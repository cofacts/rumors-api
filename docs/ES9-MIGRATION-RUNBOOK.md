# Migration Runbook: Elasticsearch 6.3.2 → 9.2.2

> **Audience**: AI Agent with SSH access to the Cofacts server.
> **Prerequisite**: You are already SSH'd into the server.
> **Estimated total time**: 1–5 hours (Phase 2 bulk reindex dominates).

---

## Environment Setup

This runbook works for both **staging** and **production**. Before starting, determine which environment you are migrating and set the following variables. All subsequent commands use these variables.

```bash
# === SET THESE FIRST ===

# "staging" or "production"
export ENV="staging"
```

Then derive the service names from `ENV`. Inspect `$COMPOSE_FILE` (found in Phase 0) to confirm the actual service names — the table below is based on `docker-compose.production.yml` in the `cofacts/rumors-deploy` repo, but the server admin may have customized them.

| Variable           | Staging                     | Production                | Description                   |
| ------------------ | --------------------------- | ------------------------- | ----------------------------- |
| `DB_SERVICE`       | `db-staging`                | `db`                      | Current ES 6 database service |
| `API_SERVICE`      | `api-staging`               | `api`                     | API service                   |
| `COLLAB_SERVICE`   | `collab-server-staging`     | `collab-server`           | Collab server service         |
| `API_IMAGE_TAG`    | `cofacts/rumors-api:dev`    | `cofacts/rumors-api`      | ES9-compatible API image      |
| `COLLAB_IMAGE_TAG` | `cofacts/collab-server:dev` | `cofacts/collab-server`   | Collab server image           |
| `DB_VOLUME`        | `./volumes/db-staging`      | `./volumes/db-production` | Current ES 6 data volume      |

```bash
# Example for staging:
export DB_SERVICE="db-staging"
export API_SERVICE="api-staging"
export COLLAB_SERVICE="collab-server-staging"
export API_IMAGE_TAG="cofacts/rumors-api:dev"
export COLLAB_IMAGE_TAG="cofacts/collab-server:dev"

# Example for production:
# export DB_SERVICE="db"
# export API_SERVICE="api"
# export COLLAB_SERVICE="collab-server"
# export API_IMAGE_TAG="cofacts/rumors-api"
# export COLLAB_IMAGE_TAG="cofacts/collab-server"
```

We'll also use a temporary service name for the new ES 9 instance during migration:

```bash
export DB_V9_SERVICE="${DB_SERVICE}-v9"  # e.g. "db-staging-v9" or "db-v9"
```

---

## Architecture Overview

```
BEFORE:                          AFTER:
┌──────────────┐                 ┌──────────────┐
│ $DB_SERVICE  │                 │ $DB_SERVICE  │
│  ES 6.3.2    │                 │  ES 9.2.2    │
│  :9200       │                 │  :9200       │
└──────┬───────┘                 └──────┬───────┘
       │                                │
┌──────┴───────┐                 ┌──────┴───────┐
│ $API_SERVICE │                 │ $API_SERVICE │
│ (old image)  │                 │ (ES9 image)  │
└──────────────┘                 └──────────────┘

DURING MIGRATION (Phase 1–2):
┌──────────────┐   ┌──────────────┐
│ $DB_SERVICE  │   │$DB_V9_SERVICE│
│  ES 6.3.2    │   │  ES 9.2.2    │
│  (original)  │   │  (temporary) │
└──────────────┘   └──────────────┘
```

After migration, `$DB_SERVICE` IS the ES 9.2.2 instance. The temporary `$DB_V9_SERVICE` name only exists during Phase 1–2.

---

## Phase 0: Pre-flight Checks

**Goal**: Locate the deployment directory and confirm the environment is healthy.

### Step 0.1: Find the deployment directory

The deployment repo (`cofacts/rumors-deploy`) is cloned somewhere on this server. Find it:

```bash
# Look for the docker-compose file used by running containers
docker inspect --format='{{index .Config.Labels "com.docker.compose.project.working_dir"}}' $(docker ps -q | head -1)
```

Use the output as your working directory for the rest of this runbook. We'll refer to it as `DEPLOY_DIR`.

```bash
export DEPLOY_DIR="<result from above>"
cd "$DEPLOY_DIR"
```

### Step 0.2: Identify the compose file in use

```bash
# Check which compose file the running containers were started with
docker inspect --format='{{index .Config.Labels "com.docker.compose.project.config_files"}}' $(docker ps -q | head -1)
```

Use this compose file for ALL `docker-compose -f <FILE>` commands below. We'll refer to it as `COMPOSE_FILE`.

```bash
export COMPOSE_FILE="<result from above>"
```

### Step 0.3: Verify service names and set variables

Read `$COMPOSE_FILE` and confirm the actual service names match the variables set in the Environment Setup section above. Adjust if needed.

### Step 0.4: Verify environment health

```bash
# 1. Verify docker-compose sees the running services
docker-compose -f "$COMPOSE_FILE" ps

# 2. Find the host port for $DB_SERVICE (if any)
# Look at the ports column in the output above, or:
docker-compose -f "$COMPOSE_FILE" port "$DB_SERVICE" 9200 2>/dev/null || echo "No host port exposed"

# 3. If a host port is exposed, verify DB is healthy
# Replace <DB_PORT> with the actual port (e.g. 62222 for staging)
curl -s http://localhost:<DB_PORT>/_cluster/health?pretty

# 4. Record current document counts for later verification
# Save this output — you'll compare against it after reindex.
curl -s http://localhost:<DB_PORT>/_cat/indices?v&s=index
```

If `$DB_SERVICE` does not have a host port mapped, you can use `docker-compose exec` instead:

```bash
docker-compose -f "$COMPOSE_FILE" exec "$DB_SERVICE" curl -s http://localhost:9200/_cluster/health?pretty
docker-compose -f "$COMPOSE_FILE" exec "$DB_SERVICE" curl -s "http://localhost:9200/_cat/indices?v&s=index"
```

### Checkpoint

- `$DB_SERVICE` container is running and cluster health is `yellow` or `green`
- You have a record of document counts per index
- You know `DEPLOY_DIR`, `COMPOSE_FILE`, and all service name variables are correct
- If `$DB_SERVICE` is not running or unhealthy, fix that first before proceeding

---

## Phase 1: Deploy Temporary ES 9 Container

**Goal**: Add a temporary ES 9.2.2 container (`$DB_V9_SERVICE`) for the reindex operation.

### Step 1.1: Add `$DB_V9_SERVICE` service to docker-compose

Edit `$COMPOSE_FILE` and add the following service definition (place it after the `$DB_SERVICE` service block). Replace `<DB_V9_SERVICE>` with the actual value of `$DB_V9_SERVICE`:

```yaml
<DB_V9_SERVICE>:
  image: elasticsearch:9.2.2
  environment:
    - "ES_JAVA_OPTS=-Xms2g -Xmx2g"
    - "reindex.remote.whitelist=<DB_SERVICE>:9200"
    - "discovery.type=single-node"
    - "xpack.security.enabled=false"
  volumes:
    - "./volumes/<DB_V9_SERVICE>:/usr/share/elasticsearch/data"
  ports:
    - "<AVAILABLE_PORT>:9200"
  restart: always
```

Notes:

- `reindex.remote.whitelist=<DB_SERVICE>:9200` allows ES 9 to pull data from the ES 6 container via Docker network DNS. Replace `<DB_SERVICE>` with the actual value.
- Pick an available host port for `<AVAILABLE_PORT>` (e.g. `62223`). This is used for monitoring reindex progress from the host.
- `xpack.security.enabled=false` disables authentication (matching the existing ES 6 setup).

**Memory note**: Both `$DB_SERVICE` and `$DB_V9_SERVICE` are configured with 2GB heap each. Before starting, check that the machine has enough free memory for both. If the existing `$DB_SERVICE` config uses a higher value, match it. Adjust `ES_JAVA_OPTS` if needed.

### Step 1.2: Create data volume directory

```bash
mkdir -p "./volumes/$DB_V9_SERVICE"
```

### Step 1.3: Increase $DB_SERVICE memory for reindex

The existing `$DB_SERVICE` may be running with less memory. During reindex, both instances need adequate heap. Check the current `ES_JAVA_OPTS` for `$DB_SERVICE` in `$COMPOSE_FILE` — if it's below 2GB, increase it to at least `-Xms2g -Xmx2g`. Then restart it:

```bash
docker-compose -f "$COMPOSE_FILE" up -d "$DB_SERVICE"
```

### Step 1.4: Stop non-essential services

Free up resources during the reindex. First, check which services are currently running:

```bash
docker-compose -f "$COMPOSE_FILE" ps --services --filter status=running
```

Record the full list of running services — you'll need to restart them in Phase 3. Then stop everything except `$DB_SERVICE`. Decide which services to stop based on available memory and the resource needs of the two ES instances:

```bash
# Stop services that are not needed during reindex.
# At minimum, stop $API_SERVICE, $COLLAB_SERVICE, and site services.
# If memory is tight, also stop other services (line-bot, url-resolver, etc.)
# Keep $DB_SERVICE running — it's the reindex source.
docker-compose -f "$COMPOSE_FILE" stop <list of services to stop>
```

### Step 1.5: Start the ES 9 container

```bash
docker-compose -f "$COMPOSE_FILE" up -d "$DB_V9_SERVICE"
```

### Step 1.6: Wait for ES 9 to be ready

```bash
# Poll until cluster health returns. May take 30-60 seconds on first boot.
# Replace <V9_PORT> with the port chosen in Step 1.1
curl -sf http://localhost:<V9_PORT>/_cluster/health?pretty
```

### Checkpoint

- `$DB_V9_SERVICE` container is running (`docker-compose ps` shows it `Up`)
- `_cluster/health` returns `green` (single-node cluster with no indices should be green)
- If ES 9 fails to start, check logs: `docker-compose -f "$COMPOSE_FILE" logs "$DB_V9_SERVICE"`

---

## Phase 2: Run Bulk Reindex (V6 → V9)

**Goal**: Copy all 14 indices from ES 6 to ES 9 via remote reindex. This is the longest phase (1–5 hours).

### Step 2.1: Clone rumors-api with the ES9 branch

The migration scripts require Node.js + babel + bash. Clone the repo on the server:

```bash
cd "$DEPLOY_DIR"
git clone --recursive --branch feature/upgrade-to-elasticsearch-v9 \
  https://github.com/cofacts/rumors-api.git rumors-api-migration

# Verify the migration scripts are present (they live in the rumors-db submodule)
ls rumors-api-migration/src/rumors-db/db/migrations/202602-001-reindex-v6-to-v9.sh
```

If the migration script is missing, the submodule may be outdated. Update it:

```bash
cd rumors-api-migration && git submodule update --init --recursive && cd ..
```

### Step 2.2: Run the migration script from inside the Docker network

The migration script uses `DEST_HOST` in curl URLs (e.g. `curl ${DEST_HOST}/_reindex`), so it must run from a context that can resolve Docker service hostnames like `$DB_V9_SERVICE` and `$DB_SERVICE`. Run it inside a temporary container attached to the same Docker network:

```bash
# Find the Docker network name (typically <directory>_default)
docker network ls | grep -i rumors

# Run migration from a temporary node:24 container (non-alpine, has bash)
# Replace <NETWORK_NAME>, <DB_SERVICE>, and <DB_V9_SERVICE> with actual values
docker run --rm -it \
  --network <NETWORK_NAME> \
  -v "$DEPLOY_DIR/rumors-api-migration":/app \
  -w /app/src/rumors-db \
  node:24 \
  bash -c 'npm install && SOURCE_HOST="http://<DB_SERVICE>:9200" DEST_HOST="<DB_V9_SERVICE>:9200" bash db/migrations/202602-001-reindex-v6-to-v9.sh'
```

Replace `<NETWORK_NAME>` with the actual network name from `docker network ls`.

**What this does**:

1. Installs `rumors-db` npm dependencies (babel, elasticsearch client, etc.)
2. Runs `202602-000-create-v9-indices.js` to create all V9 indices with correct mappings and aliases on ES 9
3. Fires async reindex tasks for all 14 indices (returns task IDs)

**Save all task IDs** from the output — you'll need them to monitor progress.

### Step 2.3: Monitor reindex progress

```bash
# Replace <V9_PORT> with the port chosen in Phase 1
# Check all running reindex tasks
curl -s "http://localhost:<V9_PORT>/_tasks?detailed=true&actions=*reindex&pretty"

# Check a specific task by ID
curl -s "http://localhost:<V9_PORT>/_tasks/<task_id>?pretty"
```

In the task response, look at `task.status`:

- `created`: documents successfully indexed so far
- `total`: total documents to process
- `completed: true`: task is done

### Step 2.4: Verify reindex completion

Once all tasks show `completed: true`:

```bash
# Compare document counts between V6 and V9
# Replace <DB_PORT> and <V9_PORT> with actual ports
echo "=== V6 ($DB_SERVICE) ==="
curl -s http://localhost:<DB_PORT>/_cat/indices?v\&s=index

echo "=== V9 ($DB_V9_SERVICE) ==="
curl -s "http://localhost:<V9_PORT>/_cat/indices?v&s=index"
```

### Checkpoint

- All 14 reindex tasks completed without errors
- Document counts match between V6 and V9 for each index (V9 index names have `-v9` suffix)
- The 14 indices are: `articlereplyfeedbacks`, `urls`, `tags`, `categories`, `airesponses`, `replies`, `articlecategoryfeedbacks`, `analytics`, `badges`, `users`, `replyrequests`, `ydocs`, `articles`, `cooccurrences`
- If any reindex task failed, check the error details. The script uses `op_type: create` + `conflicts: proceed`, so re-running is safe

---

## Phase 3: Swap DB and Deploy ES9-compatible API

**Goal**: Replace the old `$DB_SERVICE` (ES 6) with ES 9, and deploy the ES9-compatible API image. After this phase, there is no `$DB_V9_SERVICE` — `$DB_SERVICE` IS ES 9.

### Step 3.1: Stop both DB containers

```bash
docker-compose -f "$COMPOSE_FILE" stop "$DB_SERVICE" "$DB_V9_SERVICE"
```

### Step 3.2: Replace `$DB_SERVICE` service definition

Edit `$COMPOSE_FILE`. Replace the existing `$DB_SERVICE` service block with:

```yaml
<DB_SERVICE>:
  image: elasticsearch:9.2.2
  environment:
    - "ES_JAVA_OPTS=-Xms2g -Xmx2g"
    - "discovery.type=single-node"
    - "xpack.security.enabled=false"
  volumes:
    - "./volumes/<DB_V9_SERVICE>:/usr/share/elasticsearch/data"
  restart: always
  ports:
    - "<DB_PORT>:9200"
```

Notes:

- Replace `<DB_SERVICE>`, `<DB_V9_SERVICE>`, and `<DB_PORT>` with actual values.
- The volume points to `./volumes/<DB_V9_SERVICE>` — that's where the reindexed data lives. No need to rename the directory.
- Keep the same host port that `$DB_SERVICE` previously used (if any). If it had no port mapping, add one or omit.

Also **remove the `$DB_V9_SERVICE` service block** that was added in Phase 1 — it's no longer needed.

### Step 3.3: Fix $COLLAB_SERVICE Elasticsearch URL

`$COLLAB_SERVICE` may be pointing to the wrong DB. Check its `ELASTICSEARCH_URL` in `$COMPOSE_FILE` and ensure it points to `http://<DB_SERVICE>:9200`:

```yaml
<COLLAB_SERVICE>:
  image: <COLLAB_IMAGE_TAG>
  environment:
    - PORT=1234
    - ELASTICSEARCH_URL=http://<DB_SERVICE>:9200
```

### Step 3.4: Ensure the ES9-compatible API image is available

The ES9-compatible image is built automatically when the ES9 branch is merged:

- **Staging**: `cofacts/rumors-api:dev` (built on push to `master`)
- **Production**: `cofacts/rumors-api` / `cofacts/rumors-api:latest` (built on release tag)

```bash
docker pull "$API_IMAGE_TAG"
```

If the ES9 branch has NOT been merged/released yet, build and tag the image locally:

```bash
cd "$DEPLOY_DIR/rumors-api-migration"
docker build -t "$API_IMAGE_TAG" .
```

### Step 3.5: Restart all services

Restart `$DB_SERVICE`, `$API_SERVICE`, `$COLLAB_SERVICE`, plus the same services that were running before Phase 1 (site images don't need updating):

```bash
cd "$DEPLOY_DIR"
# Restart all services that were running before migration.
# $API_SERVICE will pick up the new image; site services use the same image.
docker-compose -f "$COMPOSE_FILE" up -d <list of all services to restart>
```

This will:

- Start the new `$DB_SERVICE` (ES 9.2.2) using the reindexed data
- Restart `$API_SERVICE` with the new ES9-compatible image
- Restart `$COLLAB_SERVICE` with the corrected ES URL
- Restart other services that were stopped in Phase 1 (same images, no update needed)

### Checkpoint

- `$DB_SERVICE` is now running ES 9.2.2 (verify: `curl -s http://localhost:<DB_PORT>` or `docker-compose exec`)
- `$API_SERVICE` container is running with the new image
- `$COLLAB_SERVICE` is running and pointing to `$DB_SERVICE`
- Check logs for startup errors: `docker-compose -f "$COMPOSE_FILE" logs --tail=50 "$DB_SERVICE" "$API_SERVICE" "$COLLAB_SERVICE"`

---

## Phase 4: Validation

**Goal**: Confirm the API works correctly against ES 9.

### Step 4.1: Basic health check

```bash
# ES 9 cluster health
curl -s http://localhost:<DB_PORT>/_cluster/health?pretty
```

Verify the API is accessible:

- **Staging**: `https://dev-api.cofacts.tw/graphql`
- **Production**: `https://cofacts-api.g0v.tw/graphql`

```bash
curl -s "<API_URL>/graphql" \
  -H "Content-Type: application/json" \
  -d '{"query":"{ ListArticles(first: 3) { edges { node { id text } } } }"}'
```

### Step 4.2: Functional verification

Test these through the API (via GraphQL or website):

1. **Search**: Query `ListArticles` with a search term — confirm results are returned and relevant
2. **Read**: Fetch a specific article by ID — confirm all fields are populated
3. **Write** (if safe): Create a test reply or feedback — confirm it persists
4. **Aggregations**: Any query that uses aggregations — confirm no errors

### Checkpoint

- API responds to GraphQL queries without errors
- Search results are returned and look correct
- No Elasticsearch errors in API logs
- Website loads and functions normally
  - **Staging**: `dev.cofacts.tw`
  - **Production**: `cofacts.tw`

---

## Phase 5: Cleanup

**Goal**: Remove temporary resources after successful validation.

```bash
# Remove the cloned migration repo
rm -rf "$DEPLOY_DIR/rumors-api-migration"
```

The old ES 6 data still exists in the original DB volume directory but is no longer used. Keep it as a backup until you are confident the migration is stable, then remove it.

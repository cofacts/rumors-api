# Context: BFF Auth Flow — rumors-api

**Created**: 2026-03-24 13:44
**Branch**: `feature/upgrade-to-elasticsearch-v9`
**Status**: Complete — pending integration test & push

## Goal

Implement a Custom Authorization Code Flow via BFF (Backend for Frontend) in `rumors-api` to support secure SSR authentication for cofacts.ai, while maintaining full backward compatibility with the existing cofacts.tw cookie-session flow.

## Current State

**Implementation is done.** All 9 tasks + 4 final-wave reviews passed. The branch has been rebased onto `origin/feature/upgrade-to-elasticsearch-v9` (ES v9 migration). 5 BFF auth commits sit cleanly on top of the remote tip. Two integration test scripts were created but are untracked (not committed).

**Working tree**: clean except for 2 untracked test scripts (`test-bff-flow.mjs`, `test-bff-flow-curl.sh`).

**Not yet pushed to remote.** No PR created.

## Key Decisions

| Decision | Rationale |
|----------|-----------|
| HS256 shared secret via `jose` (already in deps) | Simplest JWT signing for first-party BFF; no new dependencies |
| Long-lived JWT contains `{ sub: userId }` only | Minimal claims; BFF sends `x-app-id` header for appId |
| `redirect_to` as new param alongside existing `redirect` | Full backward compat — both coexist in loginRouter |
| Exact URL match for `ALLOWED_CALLBACK_URLS` | Sufficient for first-party BFF; origin-only match deferred |
| Bearer token invalid → throw 401; no Bearer → fall through to session auth | Matches design doc (img3); no silent failures for explicit Bearer |
| Rebase conflicts: accept remote for all ES-related files | ES v9 migration is authoritative; our BFF changes don't touch ES code |

## Completed Work

- [x] `src/lib/jwt.js` — signShortLivedJWT, signLongLivedJWT, verifyJWT (HS256)
- [x] `src/auth.js` — redirect_to + state params, ShortLivedJWT generation after OAuth callback
- [x] `.env.sample` — JWT_SECRET, ALLOWED_CALLBACK_URLS entries
- [x] `src/tokenRoute.js` — POST /auth/token (code → long-lived token exchange)
- [x] `src/index.js` — mount /auth/token route
- [x] `src/contextFactory.ts` — Bearer token verification, 401 on invalid
- [x] 31 Jest tests across 4 suites (jwt, auth-bff, tokenRoute, contextFactory-bearer) — all pass
- [x] 5 atomic commits (feat × 4, test × 1)
- [x] Rebased onto origin/feature/upgrade-to-elasticsearch-v9
- [x] Integration test scripts created (test-bff-flow.mjs, test-bff-flow-curl.sh)

## Not Yet Done

- [ ] Set up `.env` with `JWT_SECRET`, `ALLOWED_CALLBACK_URLS`, GitHub OAuth creds
- [ ] Start rumors-api locally and run integration test (`node test-bff-flow.mjs`)
- [ ] Push to remote (requires user approval)
- [ ] Create PR (requires user approval)
- [ ] Decide whether to commit test scripts or keep them local-only

## Code Context

### New files
| File | Purpose |
|------|---------|
| `src/lib/jwt.js` | JWT sign/verify utilities (HS256, jose v5) |
| `src/tokenRoute.js` | POST /auth/token handler |
| `src/__tests__/jwt.test.js` | 10 unit tests |
| `src/__tests__/auth-bff.test.js` | 9 tests (loginRouter + authRouter BFF flow) |
| `src/__tests__/tokenRoute.test.js` | 6 tests |
| `src/__tests__/contextFactory-bearer.test.js` | 6 tests |
| `test-bff-flow.mjs` | Auto-intercept integration test (untracked) |
| `test-bff-flow-curl.sh` | Manual curl test guide (untracked) |

### Modified files
| File | Change |
|------|--------|
| `src/auth.js` | Added redirect_to/state branch in loginRouter; BFF redirect + JWT in authRouter |
| `src/contextFactory.ts` | Added Bearer token verification before session auth |
| `src/index.js` | Mounted POST /auth/token |
| `.env.sample` | Added JWT_SECRET, ALLOWED_CALLBACK_URLS |

### Commits (ahead of remote by 5)
```
781be74 test(auth): add tests for BFF auth flow (JWT, login, token exchange, bearer)
6955368 feat(auth): add Bearer token verification in contextFactory
95c15af feat(auth): add POST /auth/token endpoint for code-to-token exchange
d8e9e90 feat(auth): support redirect_to, state params and short-lived JWT in login flow
54d25af feat(auth): add JWT utility module and env config for BFF auth flow
```

### Key env vars for testing
```
JWT_SECRET=<at-least-32-chars>
ALLOWED_CALLBACK_URLS=http://localhost:3987/callback
GITHUB_CLIENT_ID=...
GITHUB_SECRET=...
GITHUB_CALLBACK_URL=http://localhost:5000/callback/github
```

### Notepad files
- `.sisyphus/notepads/bff-auth-flow/learnings.md` — technical patterns, test mocking strategies, jose usage
- `.sisyphus/notepads/bff-auth-flow/issues.md` — resolved blockers (session guard, babel-jest ESM, jose iat)
- `.sisyphus/notepads/bff-auth-flow/decisions.md` — architectural choices with rationale

### Plan file (READ ONLY)
- `.sisyphus/plans/bff-auth-flow.md` — full plan, all top-level tasks checked

## Resume Instructions

1. If continuing integration testing: set `.env` vars per "Key env vars" above, start rumors-api, run `node test-bff-flow.mjs`
2. If pushing: `git push origin feature/upgrade-to-elasticsearch-v9` (force push may be needed after rebase)
3. If creating PR: target branch is `master` or whatever the ES v9 branch merges into
4. Read `.sisyphus/notepads/bff-auth-flow/learnings.md` for test patterns and gotchas

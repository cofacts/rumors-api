import { GoogleGenAI } from '@google/genai';
import { GoogleAuth } from 'google-auth-library';

/**
 * Construct a Vertex AI `GoogleGenAI` client.
 *
 * Authenticates via Application Default Credentials — set
 * `GOOGLE_APPLICATION_CREDENTIALS` to a service account key whose principal has
 * `roles/aiplatform.user` (or at least `aiplatform.endpoints.predict`) on the
 * target project. The project is resolved by `GoogleAuth`, which reads
 * `GCLOUD_PROJECT` / `GOOGLE_CLOUD_PROJECT` first and only then falls back to
 * the key file's own `project_id` — so keep that env in sync with the key.
 *
 * Note there is no Files API on Vertex: media is referenced by
 * `fileData.fileUri`, which takes either a `gs://` URI (readable by the
 * project's Vertex service agent) or a publicly-readable https URL. Audio and
 * video fetched by https URL are capped at 15 MB, while `gs://` allows up to
 * 2 GB, so media that is not in our bucket yet is uploaded there first (see
 * `uploadMediaAndWait`).
 *
 * @param location Regional endpoint, e.g. `us-central1` or `global`.
 */
export async function createGenAI(location: string): Promise<GoogleGenAI> {
  const project = await new GoogleAuth().getProjectId();
  return new GoogleGenAI({ vertexai: true, project, location });
}

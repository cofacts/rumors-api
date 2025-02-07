import { Langfuse } from 'langfuse';

const langfuse = new Langfuse();

export const CURRENT_ENV = process.env.ROLLBAR_ENV ?? 'dev';

const originalTrace = langfuse.trace;
langfuse.trace = (body) =>
  originalTrace.call(langfuse, {
    ...body,
    tags: [...(body?.tags ?? []), CURRENT_ENV],
  });

export default langfuse;

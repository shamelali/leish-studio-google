// Vercel serverless entry (static filename, committed).
// Static names get full dependency tracing; the previous dynamic
// api/[...path] entry was deployed without its imports. Extensionless
// import lets the tracer resolve ../server.ts and the whole graph
// (including native prebuilds). The Express app normalizes Vercel's
// ...path rewrite envelope itself.
import app from '../server';

export default app;

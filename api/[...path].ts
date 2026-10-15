// Vercel serverless entry (source wrapper, committed).
// Extensionless import: Vercel's function bundler resolves ../server to
// ../server.ts and traces the whole graph (including native prebuilds)
// natively. An explicit .ts extension breaks module resolution at runtime
// (ERR_MODULE_NOT_FOUND), and a pre-bundled ESM file cannot execute under
// Node's ESM loader (dynamic require, __dirname in native loaders).
import app from '../server';

export default app;

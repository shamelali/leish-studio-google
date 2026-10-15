// Vercel serverless entry (source wrapper, committed).
// Vercel compiles this TypeScript-aware entry and traces node_modules
// natively (including bcrypt's prebuilt binaries), which a pre-bundled
// ESM file cannot do under Node's ESM loader. The Express app in
// ../server.ts normalizes Vercel's ...path rewrite envelope itself.
import app from '../server.ts';

export default app;

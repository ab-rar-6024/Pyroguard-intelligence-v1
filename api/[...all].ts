// Import the esbuild-bundled server (produced by `npm run build`), placed inside api/
// so Vercel's function file-tracer includes it as a sibling of this entry point.
// dist/ is reserved for the static frontend output and is NOT bundled into serverless
// functions, and importing the raw ../server.ts source fails at runtime with
// ERR_MODULE_NOT_FOUND once any of its own relative imports are reached (Vercel's
// Node runtime resolves relative ESM imports strictly and doesn't bundle those files).
// @ts-ignore - JS build artifact, no type declarations
import app from './_server.cjs';

export default app;

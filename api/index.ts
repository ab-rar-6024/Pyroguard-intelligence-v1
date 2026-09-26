// See api/[...all].ts for why this imports the bundled build output, not the TS source.
// @ts-ignore - JS build artifact, no type declarations
import app from './_server.cjs';

export default app;

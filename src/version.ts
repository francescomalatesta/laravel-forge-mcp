import { createRequire } from 'node:module';

// Resolves to the package root from both src/ (tsx) and dist/ (build).
const pkg = createRequire(import.meta.url)('../package.json') as { version: string };

export const VERSION: string = pkg.version;

import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';

// Resolve relative to the source, not the terminal's current directory.
const envFile = process.env.KARAOKE_ENV_FILE || fileURLToPath(new URL('../.env.local', import.meta.url));
try { loadEnvFile(envFile); }
catch (error) {
  if (error.code !== 'ENOENT') throw new Error(`Could not load configuration at ${envFile}: ${error.message}`);
  // Deployed servers can supply their configuration entirely via environment.
}

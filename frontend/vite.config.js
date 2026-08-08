import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const localAppData =
  process.env.LOCALAPPDATA || process.env.TEMP || process.cwd();
const viteCacheDir = path.join(localAppData, 'strobe-client', 'vite-cache');

export default defineConfig({
  plugins: [react()],
  cacheDir: viteCacheDir,
  server: { port: 5173 },
});

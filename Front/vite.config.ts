import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';

const getGitCommit = () => {
  if (process.env.RENDER_GIT_COMMIT) return process.env.RENDER_GIT_COMMIT;
  if (process.env.GIT_COMMIT) return process.env.GIT_COMMIT;
  if (process.env.VITE_GIT_COMMIT) return process.env.VITE_GIT_COMMIT;

  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'local';
  }
};

const buildTime = new Date().toISOString();
const gitCommit = getGitCommit();
const assetVersion = process.env.VITE_ASSET_VERSION || `${gitCommit}-${buildTime}`;

export default defineConfig({
  plugins: [react()],
  define: {
    __ESCORT_RADAR_GIT_COMMIT__: JSON.stringify(gitCommit),
    __ESCORT_RADAR_BUILD_TIME__: JSON.stringify(buildTime),
    __ESCORT_RADAR_ASSET_VERSION__: JSON.stringify(assetVersion),
  },
});

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/web',
  timeout: 30000,
  workers: 1,
  use: { baseURL: process.env.WEB_URL || 'http://localhost:8080', browserName: 'chromium' },
  reporter: 'list',
});

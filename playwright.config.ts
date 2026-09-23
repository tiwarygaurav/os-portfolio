import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests: a real browser driving the real desktop.
 *
 * These exist because the headless unit tests cannot see the class of bug that matters most here
 * — minimising a window used to unmount its app, and `ps` pids ran into their column, and neither
 * was visible to anything but a browser. See CLAUDE.md §8, "Verify with both".
 *
 * Runs against a production build: `npm run build`, then `npm run test:e2e`. The server is started
 * for you, or an already-running one on the same port is reused.
 */
/** Override with PLAYWRIGHT_PORT to test a build served from another checkout (e.g. a mirror). */
const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 3111);

export default defineConfig({
    testDir: './tests/e2e',
    timeout: 90_000,
    expect: { timeout: 8_000 },
    fullyParallel: true,
    retries: process.env.CI ? 1 : 0,
    reporter: process.env.CI ? 'github' : 'list',
    use: {
        baseURL: `http://localhost:${PORT}`,
        viewport: { width: 1366, height: 768 },
        trace: 'retain-on-failure',
    },
    projects: [
        { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 768 } }, testIgnore: /mobile\.spec/ },
        { name: 'phone', use: { ...devices['iPhone 13'], browserName: 'chromium' }, testMatch: /mobile\.spec/ },
    ],
    webServer: {
        command: `npx next start -p ${PORT}`,
        port: PORT,
        reuseExistingServer: true,
        timeout: 120_000,
    },
});

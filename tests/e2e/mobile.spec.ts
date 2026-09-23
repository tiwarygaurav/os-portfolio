import { expect, test } from '@playwright/test';
import { bootAndLogin, settledBox, win } from './helpers';

/** Runs in the `phone` project (iPhone 13 viewport, touch). See playwright.config.ts. */

test('a tapped icon opens full-screen with no horizontal overflow', async ({ page }) => {
    await bootAndLogin(page);
    await page.locator('[data-desktop-icon="about"]').tap();
    const box = await settledBox(win(page, 'About Me'));
    const vw = await page.evaluate(() => window.innerWidth);
    expect(Math.round(box.width)).toBe(vw);
    expect(Math.round(box.x)).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
});

test('a maximised window fills the visible viewport above the taskbar', async ({ page }) => {
    await bootAndLogin(page);
    await page.locator('[data-desktop-icon="projects"]').tap();
    const box = await settledBox(win(page, 'My Projects'));
    const vh = await page.evaluate(() => window.innerHeight);
    expect(Math.abs(box.height - (vh - 36))).toBeLessThan(4);
});

test('crossing into the phone breakpoint re-maximises a floating window', async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 800 });
    await bootAndLogin(page);
    await page.locator('[data-desktop-icon="projects"]').dblclick();
    const wide = await settledBox(win(page, 'My Projects'));
    expect(wide.width).toBeLessThan(1200);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(async () => Math.round((await win(page, 'My Projects').boundingBox())!.width)).toBe(390);
});

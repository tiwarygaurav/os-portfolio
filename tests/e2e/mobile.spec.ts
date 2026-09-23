import { expect, test } from '@playwright/test';
import { bootAndLogin, run, settledBox, win } from './helpers';

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

test('taskbar buttons keep their floor width and the row scrolls instead of collapsing', async ({ page }) => {
    await bootAndLogin(page);
    for (const cmd of ['about', 'projects', 'skills', 'resume', 'contact', 'notepad']) await run(page, cmd);
    const widths = await Promise.all(
        ['About Me', 'My Projects', 'Untitled - Notepad'].map((t) =>
            page.locator('button', { hasText: t }).last().evaluate((el) => el.getBoundingClientRect().width),
        ),
    );
    // Below 640px there used to be no floor, so six buttons collapsed to ~28px unlabelled stubs.
    for (const w of widths) expect(w).toBeGreaterThanOrEqual(104);
    const row = page.locator('button', { hasText: 'About Me' }).last().locator('xpath=..');
    expect(await row.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
});

test('a tap that wakes the screen saver does not also press what is underneath', async ({ page }) => {
    await bootAndLogin(page);
    await run(page, 'desk.cpl');
    const settings = win(page, 'Display Properties');
    await settings.getByRole('tab', { name: 'Screen Saver' }).tap();
    await settings.getByLabel('Screen saver', { exact: true }).selectOption('marquee');
    await settings.getByRole('button', { name: 'Preview' }).tap();
    const canvas = page.locator('canvas[aria-label^="Screen saver"]');
    await expect(canvas).toHaveCount(1);
    await page.waitForTimeout(700);

    // Tap exactly where the Start button is. A tap's click arrives after its touchend, and used to
    // land on the Start button once the saver had gone.
    const box = await page.getByText('start', { exact: true }).first().boundingBox();
    await page.touchscreen.tap(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await expect(canvas).toHaveCount(0);
    await page.waitForTimeout(600);
    await expect(page.getByText('All Programs')).toBeHidden();
});

test('the shell root uses the dynamic viewport height, not 100vh', async ({ page }) => {
    await bootAndLogin(page);
    // Headless Chromium has no collapsing toolbar, so 100vh and 100dvh coincide here and a size
    // check alone could not tell them apart. Check the rule that differs on a real phone.
    const rule = await page.evaluate(() => {
        const main = document.querySelector('main')!;
        return { cls: main.classList.contains('h-viewport'), h: main.getBoundingClientRect().height, vh: window.innerHeight };
    });
    expect(rule.cls).toBe(true);
    expect(Math.round(rule.h)).toBe(rule.vh);
    const usesDvh = await page.evaluate(() =>
        Array.from(document.styleSheets).some((sheet) => {
            try {
                return Array.from(sheet.cssRules).some((r) => r.cssText.includes('.h-viewport') && r.cssText.includes('100dvh'));
            } catch {
                return false;
            }
        }),
    );
    expect(usesDvh).toBe(true);
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

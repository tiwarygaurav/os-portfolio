import { expect, test } from '@playwright/test';
import { bootAndLogin } from './helpers';

/*
 * Tests that have to prepare the page before the visitor logs on: a saved setting, a fake clock, a
 * slow file. Each does its own boot and logon.
 */

test('the screen saver never starts under Stand By', async ({ page }) => {
    // A saver with the shortest wait, as if chosen in Display Properties on an earlier visit.
    await page.addInitScript(() => {
        if (!localStorage.getItem('gaurav-xp-os')) {
            localStorage.setItem('gaurav-xp-os', JSON.stringify({ state: { screenSaver: { kind: 'starfield', idleMinutes: 1 } }, version: 0 }));
        }
    });
    await page.clock.install();
    await bootAndLogin(page);

    await page.getByText('start', { exact: true }).first().click();
    await page.getByRole('button', { name: 'Turn Off Computer', exact: true }).click();
    await page.locator('[data-exit="standby"]').click();
    await expect(page.locator('.xp-standby')).toBeVisible();

    // Well past the wait: the idle check runs, and must find the screen off rather than idle.
    await page.clock.fastForward('05:00');
    await page.waitForTimeout(500);
    const saver = page.getByRole('img', { name: /^Screen saver/ });
    await expect(saver).toHaveCount(0);

    // Waking with a nudge — less than the saver's own 6 px — shows the desktop, not a saver that
    // started in the dark.
    await page.mouse.move(600, 400);
    await page.mouse.move(602, 401);
    await expect(page.locator('.xp-standby')).toHaveCount(0);
    await expect(saver).toHaveCount(0);
});

test('a slow startup.mp3 still plays: priming it never pauses the real startup sound', async ({ page }) => {
    // Count what happens to the startup recording while it is audible (the primer is muted).
    await page.addInitScript(() => {
        const counts = { play: 0, pause: 0 };
        (window as unknown as { __startup: typeof counts }).__startup = counts;
        const { play, pause } = HTMLMediaElement.prototype;
        const audible = (el: HTMLMediaElement) => el.src.includes('/sounds/startup') && !el.muted;
        HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
            if (audible(this)) counts.play++;
            return play.call(this);
        };
        HTMLMediaElement.prototype.pause = function (this: HTMLMediaElement) {
            if (audible(this)) counts.pause++;
            return pause.call(this);
        };
    });
    // Slower than the ~2 s between the logon click and the startup sound, so the primer's play()
    // is still pending when the real one starts.
    await page.route('**/sounds/startup.mp3', async (route) => {
        await new Promise((r) => setTimeout(r, 4000));
        await route.continue();
    });
    await bootAndLogin(page);

    const counts = () => page.evaluate(() => (window as unknown as { __startup: { play: number; pause: number } }).__startup);
    await expect.poll(async () => (await counts()).play, { timeout: 10_000 }).toBeGreaterThan(0);
    await page.waitForTimeout(6000);
    expect((await counts()).pause).toBe(0);
});

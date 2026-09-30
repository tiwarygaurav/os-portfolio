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
    await page.getByRole('menuitem', { name: 'Turn Off Computer', exact: true }).click();
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

    // The same wait with the screen on does start it, so the checks above were not simply early.
    await page.clock.fastForward('05:00');
    await expect(saver).toHaveCount(1);
});

test('a slow startup.mp3 still plays: priming it never pauses the real startup sound', async ({ page }) => {
    // Count what happens to the startup recording while it is audible (the primer is muted).
    await page.addInitScript(() => {
        const counts = { play: 0, pause: 0, element: null as HTMLMediaElement | null };
        (window as unknown as { __startup: typeof counts }).__startup = counts;
        const { play, pause } = HTMLMediaElement.prototype;
        const audible = (el: HTMLMediaElement) => el.src.includes('/sounds/startup') && !el.muted;
        HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
            if (audible(this)) {
                counts.play++;
                counts.element = this;
            }
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

    // Wait for the sound to be really playing (the file has arrived and the primer's promise has
    // settled) or for a pause, whichever comes first: no fixed sleep for the defect to outlast.
    const state = () =>
        page.evaluate(() => {
            const c = (window as unknown as { __startup: { play: number; pause: number; element: HTMLMediaElement | null } }).__startup;
            return { play: c.play, pause: c.pause, playing: !!c.element && !c.element.paused && c.element.currentTime > 0.5 };
        });
    await expect.poll(async () => { const st = await state(); return st.pause > 0 || st.playing; }, { timeout: 20_000 }).toBe(true);
    const final = await state();
    expect(final.pause).toBe(0);
    expect(final.playing).toBe(true);
});

test('a right-click while the last menu fades out opens a new menu', async ({ page }) => {
    // On Playwright's clock, so the fade can be held part-way instead of raced.
    await page.clock.install();
    await bootAndLogin(page);
    await page.mouse.click(900, 300, { button: 'right' });
    await expect(page.getByRole('menuitem', { name: 'Refresh' })).toBeVisible();
    const now = await page.evaluate(() => Date.now());
    await page.clock.pauseAt(now + 1000);
    await page.getByRole('menuitem', { name: 'Refresh' }).click();
    // A few frames into its 100 ms fade: the chosen menu is still there, over the same point.
    await page.clock.runFor(40);
    await expect(page.locator('[data-xp-menu]')).toHaveCount(1);
    await page.mouse.click(900, 300, { button: 'right' });
    await page.clock.resume();
    // Once the old menu has gone, the new one is there: the old one used to take the press.
    await expect(page.locator('[data-xp-menu]')).toHaveCount(1);
    await expect(page.getByRole('menu')).toHaveCount(1);
});

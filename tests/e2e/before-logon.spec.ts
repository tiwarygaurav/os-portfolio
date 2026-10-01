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
    // The 100 ms fade is a Web Animation on the document's own timeline, which no fake clock holds.
    // While armed, the test stretches any new animation to 100 s, so the chosen menu stays mid-exit for
    // as long as it needs, however slowly this machine is running; finish() then lets it go. Animation
    // frames go on, so whatever a closing menu does on its first frame still happens.
    await page.addInitScript(() => {
        const w = window as unknown as { __slowAnimations: boolean };
        w.__slowAnimations = false;
        const animate = Element.prototype.animate;
        Element.prototype.animate = function (this: Element, keyframes: Keyframe[] | PropertyIndexedKeyframes | null, options?: number | KeyframeAnimationOptions) {
            if (w.__slowAnimations) options = typeof options === 'object' ? { ...options, duration: 100_000 } : 100_000;
            return animate.call(this, keyframes, options);
        };
    });
    await bootAndLogin(page);
    const menus = page.locator('[data-xp-menu]');
    const frames = (n: number) =>
        page.evaluate((count) => new Promise<void>((resolve) => {
            const step = (left: number) => (left === 0 ? resolve() : requestAnimationFrame(() => step(left - 1)));
            step(count);
        }), n);

    await page.mouse.click(900, 300, { button: 'right' });
    const refresh = page.getByRole('menuitem', { name: 'Refresh' });
    await expect(refresh).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.getAnimations().length)).toBe(0); // fully in
    await page.evaluate(() => { (window as unknown as { __slowAnimations: boolean }).__slowAnimations = true; });
    await refresh.click();
    // The chosen menu has begun to close (aria-hidden is its first render as a closing menu), and a
    // couple of frames have passed: it is still there, fading, over the same point.
    await expect(page.locator('[data-xp-menu] [role="menu"][aria-hidden="true"]')).toHaveCount(1);
    await frames(2);
    await expect(menus).toHaveCount(1);

    // The same point, over the closing menu: it used to take the press, and nothing opened.
    await page.mouse.click(900, 300, { button: 'right' });
    await expect(menus).toHaveCount(2);

    await page.evaluate(() => {
        (window as unknown as { __slowAnimations: boolean }).__slowAnimations = false;
        document.getAnimations().forEach((a) => a.finish());
    });
    await expect(menus).toHaveCount(1);
    await expect(page.locator('[data-xp-menu] [role="menu"]:not([aria-hidden])')).toHaveCount(1);
});

import { expect, test, type Page } from '@playwright/test';
import { bootAndLogin, run } from './helpers';

/**
 * Windows Media Player: real playback, and a visualisation that is driven by the playing track —
 * so it moves while music plays, and stops repainting once playback stops and the bars settle.
 */

const player = (page: Page) => page.locator('[data-app="music"]');

/** How many animation frames in `ms` actually changed the visualisation canvas. */
async function repaints(page: Page, ms: number): Promise<number> {
    return player(page)
        .locator('canvas')
        .evaluate(
            (c: HTMLCanvasElement, span: number) =>
                new Promise<number>((resolve) => {
                    const ctx = c.getContext('2d')!;
                    const read = () => ctx.getImageData(0, 0, c.width, c.height).data.join(',');
                    let last = read();
                    let changes = 0;
                    const t0 = performance.now();
                    const frame = () => {
                        const now = read();
                        if (now !== last) changes++;
                        last = now;
                        if (performance.now() - t0 < span) requestAnimationFrame(frame);
                        else resolve(changes);
                    };
                    requestAnimationFrame(frame);
                }),
            ms,
        );
}

type Counted = Window & { __rafCalls: number };

test('plays a track, draws it, and goes quiet when paused', async ({ page }) => {
    // Count animation-frame requests, so an idle loop is caught even if it draws identical frames.
    await page.addInitScript(() => {
        const w = window as Counted;
        const raf = w.requestAnimationFrame.bind(w);
        w.__rafCalls = 0;
        w.requestAnimationFrame = (cb) => {
            w.__rafCalls++;
            return raf(cb);
        };
    });
    await bootAndLogin(page);
    await run(page, 'wmplayer');
    await expect(player(page)).toBeVisible();

    await player(page).getByRole('option', { name: /Lose Yourself/ }).dblclick();
    await expect(player(page).getByRole('status')).toHaveText('Playing: Lose Yourself');
    const seek = player(page).getByRole('slider', { name: 'Seek' });
    await expect.poll(async () => Number(await seek.getAttribute('aria-valuenow')), { timeout: 10_000 }).toBeGreaterThan(0);
    expect(await repaints(page, 600)).toBeGreaterThan(5);

    await player(page).getByRole('button', { name: 'Pause' }).click();
    await expect(player(page).getByRole('status')).toHaveText('Paused');
    // Bars fall to rest, then nothing redraws and no frame is even requested: no idle loop.
    await page.waitForTimeout(2500);
    const calls = () => page.evaluate(() => (window as Counted).__rafCalls);
    const before = await calls();
    await page.waitForTimeout(600);
    expect((await calls()) - before).toBeLessThan(3);
});

test("WMP's own Ctrl+P pauses", async ({ page }) => {
    await bootAndLogin(page);
    await run(page, 'wmplayer');
    await player(page).getByRole('option', { name: /Mockingbird/ }).dblclick();
    await expect(player(page).getByRole('status')).toHaveText('Playing: Mockingbird');
    await page.keyboard.press('Control+p');
    await expect(player(page).getByRole('status')).toHaveText('Paused');
});

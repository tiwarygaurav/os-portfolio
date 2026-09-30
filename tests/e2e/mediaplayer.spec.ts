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

// ---- from the review of 7212919 ------------------------------------------------------------------

test('a single click on another song selects it; only a double-click plays it', async ({ page }) => {
    await bootAndLogin(page);
    await run(page, 'wmplayer');
    await player(page).getByRole('option', { name: /Lose Yourself/ }).dblclick();
    await expect(player(page).getByRole('status')).toHaveText('Playing: Lose Yourself');
    const mockingbird = player(page).getByRole('option', { name: /Mockingbird/ });
    await mockingbird.click();
    await expect(mockingbird).toHaveAttribute('aria-selected', 'true');
    await page.waitForTimeout(400);
    await expect(player(page).getByRole('status')).toHaveText('Playing: Lose Yourself');
    await mockingbird.dblclick();
    await expect(player(page).getByRole('status')).toHaveText('Playing: Mockingbird');
});

test('a track that cannot load says so, not that the browser blocked it', async ({ page }) => {
    await page.route('**/sounds/Eminem%20-%20Kim.mp3', (route) => route.fulfill({ status: 404, body: '' }));
    await bootAndLogin(page);
    await run(page, 'wmplayer');
    await player(page).getByRole('option', { name: /^\d+\s*Kim/ }).dblclick();
    await expect(player(page).getByRole('status')).toHaveText('This track could not be loaded.');
    await page.waitForTimeout(500);
    await expect(player(page).getByRole('status')).toHaveText('This track could not be loaded.');
});

test('a click while paused only selects; Play resumes the paused song where it was', async ({ page }) => {
    await bootAndLogin(page);
    await run(page, 'wmplayer');
    await player(page).getByRole('option', { name: /Lose Yourself/ }).dblclick();
    const seek = player(page).getByRole('slider', { name: 'Seek' });
    await expect.poll(async () => Number(await seek.getAttribute('aria-valuenow')), { timeout: 10_000 }).toBeGreaterThan(1);
    await player(page).getByRole('button', { name: 'Pause' }).click();
    await expect(player(page).getByRole('status')).toHaveText('Paused');
    const at = Number(await seek.getAttribute('aria-valuenow'));
    await player(page).getByRole('option', { name: /Mockingbird/ }).click();
    await expect(player(page).getByRole('status')).toHaveText('Paused');
    await player(page).getByRole('button', { name: 'Play' }).click();
    await expect(player(page).getByRole('status')).toHaveText('Playing: Lose Yourself');
    expect(Number(await seek.getAttribute('aria-valuenow'))).toBeGreaterThanOrEqual(at);
});

test('stopped, Play starts the song that was clicked', async ({ page }) => {
    await bootAndLogin(page);
    await run(page, 'wmplayer');
    await player(page).getByRole('option', { name: /Mockingbird/ }).click();
    await player(page).getByRole('button', { name: 'Play' }).click();
    await expect(player(page).getByRole('status')).toHaveText('Playing: Mockingbird');
});

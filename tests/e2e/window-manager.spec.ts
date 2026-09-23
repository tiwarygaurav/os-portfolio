import { expect, test } from '@playwright/test';
import { bootAndLogin, openFromDesktop, run, settledBox, win, windows } from './helpers';

test.beforeEach(async ({ page }) => {
    await bootAndLogin(page);
});

test('windows open at the size the registry declares', async ({ page }) => {
    await openFromDesktop(page, 'calculator');
    const box = await settledBox(win(page, 'Calculator'));
    // It used to open everything at 800x600, stretching the keypad across a window it was also
    // forbidden to resize.
    expect(Math.round(box.width)).toBe(240);
});

test('minimising hides a window without destroying its app', async ({ page }) => {
    await openFromDesktop(page, 'calculator');
    const calc = win(page, 'Calculator');
    await calc.getByRole('button', { name: '7', exact: true }).click();
    await calc.getByRole('button', { name: '8', exact: true }).click();
    await expect(calc.locator('div.font-mono').first()).toHaveText('78');

    await calc.locator('button[aria-label="Minimize"], button[title="Minimize"]').click();
    await expect(calc).toBeHidden();
    await expect(windows(page)).toHaveCount(1); // still mounted

    await page.locator('button', { hasText: 'Calculator' }).last().click();
    await expect(calc).toBeVisible();
    await expect(calc.locator('div.font-mono').first()).toHaveText('78');
});

test('the Start button closes its own menu', async ({ page }) => {
    const start = page.getByText('start', { exact: true }).first();
    await start.click();
    await expect(page.getByText('All Programs')).toBeVisible();
    await start.click();
    await expect(page.getByText('All Programs')).toBeHidden();
});

test('a context menu near the corner stays on screen', async ({ page }) => {
    // The bottom-right corner, above the taskbar, so both axes have to flip.
    await page.mouse.click(1350, 700, { button: 'right' });
    const menu = page.locator('div').filter({ has: page.getByText('Arrange Icons By', { exact: true }) }).last();
    const box = await menu.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x + box!.width).toBeLessThanOrEqual(1366);
    expect(box!.y + box!.height).toBeLessThanOrEqual(768 - 30);
});

test('dropping an icon on the Recycle Bin deletes it, and the bin gives it back', async ({ page }) => {
    const from = await page.locator('[data-desktop-icon="notepad"]').boundingBox();
    const to = await page.locator('[data-desktop-icon="trash"]').boundingBox();
    await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
    await page.mouse.down();
    await page.mouse.move(to!.x + to!.width / 2, to!.y + to!.height / 2, { steps: 15 });
    await page.mouse.up();
    await expect(page.locator('[data-desktop-icon="notepad"]')).toHaveCount(0);

    await openFromDesktop(page, 'trash');
    const bin = win(page, 'Recycle Bin');
    await expect(bin).toContainText('Notepad');
    // XP's way: select the item, then Restore this item in the task pane.
    await bin.locator('tr[data-bin-item]', { hasText: 'Notepad' }).click();
    await bin.getByRole('button', { name: 'Restore this item' }).click();
    await expect(page.locator('[data-desktop-icon="notepad"]')).toHaveCount(1);
});

test('z-order never climbs over the taskbar', async ({ page }) => {
    // Open and close through paths that bypass focus — the old free-running counter grew here.
    for (let i = 0; i < 25; i++) {
        await run(page, 'calc');
        await page.keyboard.press('Alt+F4');
    }
    await run(page, 'notepad');
    const z = await win(page, 'Untitled - Notepad').evaluate((el) => Number(getComputedStyle(el).zIndex));
    // One window open: it must sit at the bottom of the band. The old free-running counter would
    // have put it at 35 here, which "< 50" could not tell apart from correct.
    expect(z).toBe(10);
});

test('the media player plays through a track boundary', async ({ page }) => {
    await openFromDesktop(page, 'music');
    await page.getByText('Lose Yourself').first().click();
    const result = await page.evaluate(async () => {
        const audio = document.querySelector('audio')!;
        audio.muted = true;
        const first = audio.getAttribute('src');
        await audio.play();
        await new Promise<void>((resolve) => {
            audio.addEventListener('ended', () => resolve(), { once: true });
            audio.currentTime = Math.max(0, (audio.duration || 1) - 0.3);
            setTimeout(resolve, 8000);
        });
        await new Promise((r) => setTimeout(r, 1500));
        const el = document.querySelector('audio')!;
        return { first, second: el.getAttribute('src'), paused: el.paused };
    });
    expect(result.second).not.toBe(result.first);
    expect(result.paused).toBe(false);
});

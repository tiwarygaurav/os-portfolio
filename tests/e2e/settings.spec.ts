import { expect, test, type Page } from '@playwright/test';
import { bootAndLogin, run, shell, win } from './helpers';

const taskbarBg = (page: Page) =>
    page.evaluate(() => getComputedStyle(document.querySelector('.luna-taskbar')!).backgroundImage);

test.beforeEach(async ({ page }) => {
    await bootAndLogin(page);
});

test('the desktop starts on the Blue scheme, drawn from the Luna tokens', async ({ page }) => {
    // Asserts that the token is applied, not its exact stops: the Blue values are being refined
    // towards the real Luna bitmaps, and a test pinned to one approximation would fight that.
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('blue');
    expect(await taskbarBg(page)).toMatch(/^linear-gradient\(/);
    const token = await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--luna-taskbar').trim(),
    );
    expect(token).toMatch(/^linear-gradient\(/);
});

test('colour schemes recolour the chrome, persist, and the Windows XP theme restores Blue', async ({ page }) => {
    const blue = await taskbarBg(page);
    await run(page, 'desk.cpl');
    const settings = win(page, 'Display Properties');

    await settings.getByRole('tab', { name: 'Appearance' }).click();
    await settings.locator('select').nth(1).selectOption('olive');
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('olive');
    expect(await taskbarBg(page)).not.toBe(blue);

    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('gaurav-xp-os')!).state.themeId);
    expect(saved).toBe('olive');

    await settings.getByRole('tab', { name: 'Themes' }).click();
    await expect(settings.locator('select').first()).toHaveValue('modified');
    await settings.locator('select').first().selectOption('xp');
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('blue');
    expect(await taskbarBg(page)).toBe(blue);
});

test('the screen saver previews, runs on idle, and any input dismisses it', async ({ page }) => {
    await run(page, 'desk.cpl');
    const settings = win(page, 'Display Properties');
    await settings.getByRole('tab', { name: 'Screen Saver' }).click();

    const preview = settings.getByRole('button', { name: 'Preview' });
    await expect(preview).toBeDisabled();
    await settings.getByLabel('Screen saver', { exact: true }).selectOption('starfield');
    await preview.click();

    const canvas = page.locator('canvas[aria-label^="Screen saver"]');
    await expect(canvas).toHaveCount(1);
    await page.waitForTimeout(800);
    const bright = await canvas.evaluate((c: HTMLCanvasElement) => {
        const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
        let n = 0;
        for (let i = 0; i < d.length; i += 16) if (d[i] > 60) n++;
        return n;
    });
    expect(bright, 'the starfield should actually draw').toBeGreaterThan(20);

    await page.keyboard.press('Shift');
    await expect(canvas).toHaveCount(0);

    // Idle start: one-minute wait, and move the clock the timer reads.
    await settings.getByLabel('Minutes before the screen saver starts').selectOption('1');
    await page.evaluate(() => {
        const real = Date.now;
        Date.now = () => real() + 61_000;
    });
    await expect(canvas).toHaveCount(1, { timeout: 8_000 });
    await page.mouse.move(100, 100);
    await page.mouse.move(420, 420, { steps: 5 });
    await expect(canvas).toHaveCount(0);
});

test('Restore Deleted Icons brings back what the Recycle Bin holds', async ({ page }) => {
    await page.locator('[data-desktop-icon="minesweeper"]').click({ button: 'right' });
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Yes' }).click();
    await expect(page.locator('[data-desktop-icon="minesweeper"]')).toHaveCount(0);

    await run(page, 'desk.cpl');
    const settings = win(page, 'Display Properties');
    await settings.getByRole('tab', { name: 'Desktop' }).click();
    await settings.getByRole('button', { name: 'Restore Deleted Icons (1)' }).click();
    await expect(page.locator('[data-desktop-icon="minesweeper"]')).toHaveCount(1);
});

test('the Event Viewer shows what this session really did', async ({ page }) => {
    await run(page, 'desk.cpl');
    const settings = win(page, 'Display Properties');
    await settings.getByRole('tab', { name: 'Appearance' }).click();
    await settings.locator('select').nth(1).selectOption('silver');

    await run(page, 'eventvwr');
    const ev = win(page, 'Event Viewer');
    await ev.locator('tbody tr').first().click();
    await expect(ev).toContainText(/"Event Viewer" \(w\d+\) was opened/);

    await ev.getByRole('button', { name: /^System/ }).click();
    await expect(ev.locator('tbody')).toContainText('Settings');
    await ev.getByRole('button', { name: /^Security/ }).click();
    await expect(ev.locator('tbody')).toContainText('Logon');

    await ev.getByRole('button', { name: 'Clear all events' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Clear' }).click();
    await ev.getByRole('button', { name: /^Application/ }).click();
    // Clearing is itself followed by the dialog's own answer being logged, so the log is not
    // necessarily empty — but everything from before the clear is gone.
    await expect(ev.locator('tbody')).not.toContainText('WindowManager');

    // The shell's `kill` is attributed to the shell in the log.
    await run(page, 'notepad');
    await run(page, 'cmd');
    await shell(page, 'ps');
    const pid = (await win(page, 'Command Prompt').innerText()).match(/^(w\d+)\s+\w+\s+\d+\s+Untitled - Notepad$/m)?.[1];
    await shell(page, `kill ${pid}`);
    await win(page, 'Event Viewer').locator('span:text-is("Event Viewer")').click();
    await expect(ev.locator('tbody')).toContainText('Shell');
});

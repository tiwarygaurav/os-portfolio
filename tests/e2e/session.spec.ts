import { expect, test, type Page } from '@playwright/test';
import { bootAndLogin, openFromDesktop, run, win, windows } from './helpers';

test.beforeEach(async ({ page }) => {
    await bootAndLogin(page);
});

async function startMenu(page: Page, item: 'Log Off' | 'Turn Off Computer'): Promise<void> {
    await page.getByText('start', { exact: true }).first().click();
    await page.getByRole('button', { name: item, exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
}

/** The element painted at the centre of a locator — what a visitor would actually see there. */
async function paintedAtCentre(page: Page, selector: string): Promise<boolean> {
    return page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) return false;
        const r = el.getBoundingClientRect();
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return !!top && el.contains(top);
    }, selector);
}

test('Log Off saves the settings and returns to the Welcome screen', async ({ page }) => {
    await startMenu(page, 'Log Off');
    await page.locator('[data-exit="logoff"]').click();
    await expect(page.getByText('Saving your settings...')).toBeVisible();
    await expect(page.locator('[data-logon-user]')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('[data-desktop-icon]')).toHaveCount(0);
});

test('Turn Off leaves the machine off, with one button to start it', async ({ page }) => {
    await startMenu(page, 'Turn Off Computer');
    await page.locator('[data-exit="off"]').click();
    await expect(page.getByText(/is shutting down\.\.\./)).toBeVisible();
    await expect(page.getByRole('button', { name: /^Turn on / })).toBeVisible({ timeout: 10_000 });
});

test('Switch User keeps the session: the tile counts it, and logging back in returns to it', async ({ page }) => {
    await openFromDesktop(page, 'notepad');
    await expect(win(page, 'Untitled - Notepad')).toBeVisible();
    await startMenu(page, 'Log Off');
    await page.locator('[data-exit="switch"]').click();
    const tile = page.locator('[data-logon-user]');
    await expect(tile).toContainText('1 program running');
    await tile.click();
    await expect(tile).toHaveCount(0, { timeout: 10_000 });
    await expect(win(page, 'Untitled - Notepad')).toBeVisible();
});

test('from the Switch User screen, Turn off computer opens a dialog that is really on top', async ({ page }) => {
    await startMenu(page, 'Log Off');
    await page.locator('[data-exit="switch"]').click();
    await page.getByRole('button', { name: 'Turn off computer' }).click();
    await expect(page.locator('.xp-exit')).toBeVisible();
    // It used to open underneath the Welcome screen: invisible, yet holding the keyboard.
    expect(await paintedAtCentre(page, '.xp-exit')).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.locator('.xp-exit')).toHaveCount(0);
    await expect(page.locator('[data-logon-user]')).toBeVisible();
});

/**
 * Stand By, with the pointer parked at `at`. It is moved there inside the grace period, while a
 * move does not wake the screen yet, so the waking input can be a press with no move before it.
 */
async function standBy(page: Page, at: { x: number; y: number }): Promise<void> {
    await startMenu(page, 'Turn Off Computer');
    await page.locator('[data-exit="standby"]').click();
    await page.mouse.move(at.x, at.y);
    await page.waitForTimeout(900);
    await expect(page.locator('.xp-standby')).toBeVisible();
}

async function centreOf(page: Page, selector: string): Promise<{ x: number; y: number }> {
    const box = (await page.locator(selector).boundingBox())!;
    return { x: box.x + box.width / 2, y: box.y + 20 };
}

test('a right-press that wakes Stand By opens no menu, however long it is held', async ({ page }) => {
    await standBy(page, await centreOf(page, '[data-desktop-icon="contact"]'));
    await page.mouse.down({ button: 'right' });
    await expect(page.locator('.xp-standby')).toHaveCount(0);
    // Longer than the fixed 800 ms the swallow used to last: the release opened the icon's menu.
    await page.waitForTimeout(1200);
    await page.mouse.up({ button: 'right' });
    await page.waitForTimeout(300);
    await expect(page.getByRole('menu')).toHaveCount(0);
});

test('a double-press that wakes Stand By does not open the icon underneath', async ({ page }) => {
    await standBy(page, await centreOf(page, '[data-desktop-icon="contact"]'));
    await page.mouse.down();
    await page.mouse.up();
    await page.mouse.down({ clickCount: 2 });
    await page.mouse.up({ clickCount: 2 });
    await page.waitForTimeout(400);
    await expect(windows(page)).toHaveCount(0);
});

test('a drag begun straight after waking from Stand By ends when released', async ({ page }) => {
    await standBy(page, { x: 900, y: 300 });
    await page.mouse.down();
    await page.mouse.up();
    await expect(page.locator('.xp-standby')).toHaveCount(0);

    const icon = page.locator('[data-desktop-icon="contact"]');
    const from = await centreOf(page, '[data-desktop-icon="contact"]');
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 200, from.y + 40, { steps: 6 });
    await page.mouse.up();
    const dropped = (await icon.boundingBox())!;
    // The old fixed window swallowed this release, and the icon went on following the pointer.
    await page.mouse.move(from.x + 500, from.y + 250, { steps: 6 });
    const later = (await icon.boundingBox())!;
    expect(Math.round(later.x)).toBe(Math.round(dropped.x));
    expect(Math.round(later.y)).toBe(Math.round(dropped.y));
});

test('the key that wakes Stand By does nothing else', async ({ page }) => {
    await page.locator('[data-desktop-icon="contact"]').click();
    await standBy(page, { x: 900, y: 300 });
    await page.keyboard.press('Enter');
    await expect(page.locator('.xp-standby')).toHaveCount(0);
    await page.waitForTimeout(300);
    await expect(windows(page)).toHaveCount(0);
});

test('behind the Welcome screen, the session takes no Tab and no keys', async ({ page }) => {
    await openFromDesktop(page, 'notepad');
    await expect(win(page, 'Untitled - Notepad')).toBeVisible();
    await startMenu(page, 'Log Off');
    await page.locator('[data-exit="switch"]').click();
    await expect(page.locator('[data-logon-user]')).toBeVisible();

    // Tab never reaches a caption or taskbar button behind the screen...
    for (let i = 0; i < 10; i++) {
        await page.keyboard.press('Tab');
        const behind = await page.evaluate(() => !!document.activeElement?.closest('[data-window], [data-taskbar]'));
        expect(behind).toBe(false);
    }
    // ...and Notepad's Alt+F, aimed at nothing in particular, opens no menu behind it.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press('Alt+f');
    await expect(page.getByRole('menu')).toHaveCount(0);
});

test('a message box does not answer the Enter typed into Run', async ({ page }) => {
    await page.locator('[data-desktop-icon="contact"]').click();
    await page.keyboard.press('Delete');
    await expect(page.getByRole('dialog', { name: 'Confirm File Delete' })).toBeVisible();
    await run(page, 'calc');
    await expect(win(page, 'Calculator')).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Confirm File Delete' })).toBeVisible();
    await expect(page.locator('[data-desktop-icon="contact"]')).toHaveCount(1);
});

test('hiding the desktop icons can be undone from the same menu', async ({ page }) => {
    const openArrange = async () => {
        await page.mouse.click(900, 300, { button: 'right' });
        await page.getByRole('menuitem', { name: 'Arrange Icons By' }).hover();
    };
    await openArrange();
    await page.getByRole('menuitemcheckbox', { name: 'Show Desktop Icons' }).click();
    await expect(page.locator('[data-desktop-icon="contact"]')).toBeHidden();
    await openArrange();
    await page.getByRole('menuitemcheckbox', { name: 'Show Desktop Icons' }).click();
    await expect(page.locator('[data-desktop-icon="contact"]')).toBeVisible();
    await expect(windows(page)).toHaveCount(0);
});

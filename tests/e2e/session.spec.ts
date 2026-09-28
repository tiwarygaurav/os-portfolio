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

test('Stand By wakes on a press, and the press does nothing else', async ({ page }) => {
    await startMenu(page, 'Turn Off Computer');
    await page.locator('[data-exit="standby"]').click();
    await expect(page.locator('.xp-standby')).toBeVisible();
    await page.waitForTimeout(900);
    // Wake by pressing right on a desktop icon: before the fix the release selected it.
    const icon = page.locator('[data-desktop-icon="contact"]');
    const box = (await icon.boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + 20);
    await expect(page.locator('.xp-standby')).toHaveCount(0);
    await expect(icon).toHaveAttribute('aria-pressed', 'false');
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

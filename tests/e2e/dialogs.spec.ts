import { expect, test } from '@playwright/test';
import { bootAndLogin, openFromDesktop, run, win } from './helpers';

test.beforeEach(async ({ page }) => {
    await bootAndLogin(page);
});

test('Enter on a delete confirmation answers the box and nothing else', async ({ page }) => {
    await page.locator('[data-desktop-icon="notepad"]').click();
    await page.keyboard.press('Delete');
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('[data-desktop-icon="notepad"]')).toHaveCount(0);
    // The same keystroke used to reach the desktop underneath and open the app being deleted.
    await expect(win(page, 'Untitled - Notepad')).toHaveCount(0);
});

test('the desktop ignores keys while a message box is open', async ({ page }) => {
    await page.locator('[data-desktop-icon="notepad"]').click();
    await page.keyboard.press('Delete');
    await expect(page.getByRole('dialog')).toBeVisible();
    for (const key of ['ArrowUp', 'ArrowUp', 'ArrowDown', 'Delete']) await page.keyboard.press(key);
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await page.getByRole('dialog').getByRole('button', { name: 'No' }).click();
    await expect(page.locator('[data-desktop-icon="notepad"]')).toHaveCount(1);
});

test('Task Manager reports a minimised window as Minimized', async ({ page }) => {
    await openFromDesktop(page, 'notepad');
    await win(page, 'Untitled - Notepad').locator('button[aria-label="Minimize"], button[title="Minimize"]').click();
    await run(page, 'taskmgr');
    const tm = win(page, 'Windows Task Manager');
    await expect(tm).toContainText('Minimized');
    await expect(tm).not.toContainText('Not Responding');
});

test('End Task asks, then really closes the window', async ({ page }) => {
    await openFromDesktop(page, 'notepad');
    await run(page, 'taskmgr');
    const tm = win(page, 'Windows Task Manager');
    await tm.getByRole('cell', { name: 'Untitled - Notepad' }).click();
    await tm.getByRole('button', { name: 'End Task' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'End Task' }).click();
    await expect(win(page, 'Untitled - Notepad')).toHaveCount(0);
});

test('an unknown Run command reports itself', async ({ page }) => {
    await run(page, 'definitely-not-a-program');
    // The message, not merely a dialog: the Run box is itself a dialog and was already open.
    await expect(page.getByRole('dialog', { name: 'Run' })).toContainText('Cannot find "definitely-not-a-program"');
});



import { expect, test } from '@playwright/test';
import { bootAndLogin, openFromDesktop, win, windows } from './helpers';

test.beforeEach(async ({ page }) => {
    await bootAndLogin(page);
});

/*
 * The desktop acts on Delete / Enter only while it has the keyboard. That used to be cleared only
 * when the *active window changed*, so clicking inside a window that was already active left it set,
 * and Delete over that window offered to recycle the icon still selected on the desktop.
 */
test('keys pressed over an already-active window never act on the desktop selection', async ({ page }) => {
    await openFromDesktop(page, 'explorer');
    const explorer = win(page, 'Windows Explorer');
    await expect(explorer).toBeVisible();

    // Select a desktop icon while Explorer stays the active window.
    await page.locator('[data-desktop-icon="contact"]').click();

    // Click a non-input part of the window, then press the desktop's keys.
    const box = (await explorer.boundingBox())!;
    await page.mouse.click(box.x + box.width - 30, box.y + box.height - 40);
    const before = await windows(page).count();
    await page.keyboard.press('Delete');
    await page.keyboard.press('Enter');

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(windows(page)).toHaveCount(before);
    await expect(page.locator('[data-desktop-icon="contact"]')).toHaveCount(1);
});

test('on the desktop itself, Delete still asks about the selected icon', async ({ page }) => {
    await page.locator('[data-desktop-icon="contact"]').click();
    await page.keyboard.press('Delete');
    await expect(page.getByRole('dialog')).toContainText('Contact Me');
    await page.getByRole('dialog').getByRole('button', { name: 'No' }).click();
    await expect(page.locator('[data-desktop-icon="contact"]')).toHaveCount(1);
});

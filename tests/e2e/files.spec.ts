import { expect, test, type Page } from '@playwright/test';
import { bootAndLogin, run, shell, terminalText, win } from './helpers';

/** The visitor's own folder: Notepad saves, Explorer lists, the shell reads, a reload keeps. */

const notepad = (page: Page, title = 'Untitled - Notepad') => win(page, title);

async function saveAs(page: Page, name: string) {
    const dialog = page.getByRole('dialog', { name: 'Save As' });
    await expect(dialog).toBeVisible();
    await dialog.locator('#fd-name').fill(name);
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
}

test.beforeEach(async ({ page }) => {
    await bootAndLogin(page);
});

test('Notepad saves to My Documents, and every surface sees the same file', async ({ page }) => {
    await run(page, 'notepad');
    const np = notepad(page);
    await np.locator('textarea').fill('Remember the milk.');
    await np.getByRole('button', { name: 'File' }).dispatchEvent('mousedown');
    await np.getByRole('button', { name: 'Save As...' }).click();
    await saveAs(page, 'shopping');

    // XP titles the window after the file, with the extension the type implies.
    await expect(notepad(page, 'shopping.txt - Notepad')).toBeVisible();

    await run(page, 'explorer');
    const ex = win(page, 'Windows Explorer');
    await ex.locator('#explorer-address').fill('/home/guest/My Documents');
    await ex.locator('#explorer-address').press('Enter');
    await expect(ex.locator('ul li button', { hasText: 'shopping.txt' })).toBeVisible();

    await run(page, 'cmd');
    await shell(page, 'cat "/home/guest/My Documents/shopping.txt"');
    await expect.poll(() => terminalText(page)).toContain('Remember the milk.');

    // It survives a reload, because it lives in the browser's storage.
    await page.reload();
    await bootAndLogin(page);
    await run(page, '/home/guest/My Documents/shopping.txt');
    await expect(notepad(page, 'shopping.txt - Notepad').locator('textarea')).toHaveValue('Remember the milk.');
});

test('closing with unsaved changes asks first, in XP words', async ({ page }) => {
    await run(page, 'notepad');
    const np = notepad(page);
    await np.locator('textarea').fill('draft');
    await np.locator('button[aria-label="Close"], button[title="Close"]').click();

    const ask = page.getByRole('dialog', { name: 'Notepad' });
    await expect(ask).toContainText('The text in the Untitled file has changed.');
    await ask.getByRole('button', { name: 'Cancel' }).click();
    await expect(np).toBeVisible();

    await np.locator('button[aria-label="Close"], button[title="Close"]').click();
    await page.getByRole('dialog', { name: 'Notepad' }).getByRole('button', { name: 'No' }).click();
    await expect(np).toHaveCount(0);
});

test('Yes on close saves through Save As, then closes', async ({ page }) => {
    await run(page, 'notepad');
    const np = notepad(page);
    await np.locator('textarea').fill('keep me');
    await page.keyboard.press('Alt+F4');
    await page.getByRole('dialog', { name: 'Notepad' }).getByRole('button', { name: 'Yes' }).click();
    await saveAs(page, 'kept.txt');
    await expect(win(page, 'kept.txt - Notepad')).toHaveCount(0);

    await run(page, 'cmd');
    await shell(page, 'ls "/home/guest/My Documents"');
    await expect.poll(() => terminalText(page)).toContain('kept.txt');
});

test('the portfolio is read-only: saving into it is refused with the reason', async ({ page }) => {
    await run(page, '~/projects/os-portfolio/stack.txt');
    const np = notepad(page, 'stack.txt - Notepad');
    await expect(np.locator('textarea')).toHaveValue(/TypeScript/);
    await expect(np).toContainText('Read-only');

    // Save on a read-only file becomes Save As; aiming it back at the portfolio is refused.
    await np.locator('textarea').press('Control+s');
    const dialog = page.getByRole('dialog', { name: 'Save As' });
    await dialog.locator('#fd-name').fill('/home/gaurav/projects/os-portfolio/stack.txt');
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Save As' }).last()).toContainText('portfolio is read-only');
});

test('the shell writes files the GUI can open, and removes them', async ({ page }) => {
    await run(page, 'cmd');
    await shell(page, 'cd /home/guest');
    await shell(page, 'echo written by the shell > from-shell.txt');
    await shell(page, 'open from-shell.txt');
    await expect(notepad(page, 'from-shell.txt - Notepad').locator('textarea')).toHaveValue('written by the shell\n');

    await notepad(page, 'from-shell.txt - Notepad').locator('button[aria-label="Close"], button[title="Close"]').click();
    await win(page, 'Command Prompt').locator('#shell-input').click();
    await shell(page, 'rm from-shell.txt');
    // What is saved, not what is printed: the terminal's text never contained its own input line,
    // so a check on the output passed whether or not the file went.
    await expect.poll(() => page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('gaurav-xp-os')!).state.userFiles)))
        .not.toContain('/home/guest/from-shell.txt');
    await shell(page, 'rm ~/about.md');
    await expect(win(page, 'Command Prompt')).toContainText('Read-only file system');
});

test('the picture viewer walks a real folder; built-in pictures cannot be deleted', async ({ page }) => {
    await run(page, 'imageviewer');
    const viewer = win(page, 'Bliss.jpg - Windows Picture and Fax Viewer');
    await expect(viewer.locator('img[alt="Bliss.jpg"]')).toHaveAttribute('src', '/wallpapers/Bliss.jpg');
    await expect(viewer.getByRole('button', { name: 'Built-in pictures cannot be deleted' })).toBeDisabled();
    await viewer.getByRole('button', { name: 'Next Image' }).click();
    await expect(win(page, 'Profile.png - Windows Picture and Fax Viewer')).toBeVisible();
});

test('the viewer keeps its folder when its last picture is deleted, and Delete works from the keyboard', async ({ page }) => {
    // A 1x1 PNG in My Pictures, put where the store keeps the visitor's files.
    const dot = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    await page.evaluate((src) => {
        const saved = JSON.parse(localStorage.getItem('gaurav-xp-os')!);
        saved.state.userFiles = { '/home/guest/My Pictures/dot.png': { content: src, mime: 'image/png', modified: 1 } };
        localStorage.setItem('gaurav-xp-os', JSON.stringify(saved));
    }, dot);
    await page.reload();
    await bootAndLogin(page);

    // A selected desktop icon is what a leaked Delete would have offered to recycle.
    await page.locator('[data-desktop-icon]').first().click();
    await run(page, '/home/guest/My Pictures/dot.png');
    const viewer = win(page, 'dot.png - Windows Picture and Fax Viewer');
    await viewer.locator('img[alt="dot.png"]').click();
    await page.keyboard.press('Delete');
    const confirm = page.getByRole('dialog', { name: 'Confirm File Delete' });
    await expect(confirm).toContainText("delete 'dot.png'");
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await confirm.getByRole('button', { name: 'Yes' }).click();

    // It used to treat the folder as the picture, and show the folder's parent instead.
    const empty = win(page, 'Windows Picture and Fax Viewer');
    await expect(empty).toContainText('There are no pictures in /home/guest/My Pictures.');
});

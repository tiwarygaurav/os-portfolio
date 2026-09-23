import { expect, test } from '@playwright/test';
import { bootAndLogin, openFromDesktop, run, win } from './helpers';

test('Explorer browses the same filesystem the shell walks', async ({ page }) => {
    await bootAndLogin(page);
    await openFromDesktop(page, 'explorer');
    const w = win(page, 'Windows Explorer');
    const addr = w.locator('#explorer-address');
    const files = w.locator('ul li button');
    await expect(addr).toHaveValue('~');

    // Folders navigate, the way real Explorer does.
    await files.filter({ hasText: 'projects' }).first().dblclick();
    await expect(addr).toHaveValue('~/projects');
    await expect(files.filter({ hasText: 'os-portfolio' })).toHaveCount(1);

    await files.filter({ hasText: 'os-portfolio' }).first().dblclick();
    await expect(addr).toHaveValue('~/projects/os-portfolio');
    await expect(files.filter({ hasText: 'README.md' })).toHaveCount(1);

    // A file's launch hint opens its app, exactly as `open <path>` would.
    await files.filter({ hasText: 'README.md' }).first().dblclick();
    await expect(win(page, 'My Projects')).toContainText(/OS Portfolio/i);

    // History is real.
    await w.locator('span:text-is("Windows Explorer")').click();
    await w.getByLabel('Back').click();
    await expect(addr).toHaveValue('~/projects');
    await w.getByLabel('Forward').click();
    await expect(addr).toHaveValue('~/projects/os-portfolio');
    await w.getByLabel('Up one level').click();
    await expect(addr).toHaveValue('~/projects');

    // Typed paths, including the live process table.
    await addr.fill('/proc');
    await addr.press('Enter');
    await expect(addr).toHaveValue('/proc');
    expect(await files.count()).toBeGreaterThan(0);

    // An unknown path reports itself in-world.
    await addr.fill('/nope/not/real');
    await addr.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'OK' }).click();

    // A text file with no window of its own opens in Notepad, as XP's file associations did.
    await addr.fill('~/projects/os-portfolio');
    await addr.press('Enter');
    await files.filter({ hasText: 'stack.txt' }).first().dblclick();
    await expect(win(page, 'stack.txt - Notepad').locator('textarea')).toHaveValue(/TypeScript/);
});

test('Run hands a folder with no owning app to Explorer', async ({ page }) => {
    await bootAndLogin(page);
    await run(page, '/etc');
    await expect(win(page, 'Windows Explorer')).toBeVisible();
});

test('opened on a path, Explorer has no Back yet; a later open is one step, and drops Forward', async ({ page }) => {
    await bootAndLogin(page);
    await run(page, '/etc');
    const w = win(page, 'Windows Explorer');
    const addr = w.locator('#explorer-address');
    await expect(addr).toHaveValue('/etc');
    // The opening path used to be added to the history twice, so Back went "back" to the same folder.
    await expect(w.getByLabel('Back')).toBeDisabled();

    await run(page, '/proc');
    await expect(addr).toHaveValue('/proc');
    await w.getByLabel('Back').click();
    await expect(addr).toHaveValue('/etc');
    await expect(w.getByLabel('Back')).toBeDisabled();

    // A new place after going Back replaces what was ahead, as every browser and Explorer does.
    await run(page, '/home');
    await expect(addr).toHaveValue('/home');
    await expect(w.getByLabel('Forward')).toBeDisabled();
    await w.getByLabel('Back').click();
    await expect(addr).toHaveValue('/etc');
});

test('Delete on a file stays in Explorer, and a read-only file says why it cannot go', async ({ page }) => {
    await bootAndLogin(page);
    // A selected desktop icon is what a leaked Delete would have offered to recycle.
    await page.locator('[data-desktop-icon]').first().click();
    await run(page, 'explorer');
    const w = win(page, 'Windows Explorer');
    await w.locator('ul li button', { hasText: 'about.md' }).first().click();
    await page.keyboard.press('Delete');

    const error = page.getByRole('dialog', { name: 'Error Deleting File or Folder' });
    await expect(error).toContainText('Cannot delete about.md: it is read-only.');
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await error.getByRole('button', { name: 'OK' }).click();
    await expect(page.locator('[data-desktop-icon]')).not.toHaveCount(0);
});

test('My Computer selects on a click, opens on a double-click, and Details describes the selection', async ({ page }) => {
    await bootAndLogin(page);
    await run(page, 'mycomputer');
    const mc = win(page, 'My Computer');
    const docs = mc.getByRole('button', { name: 'My Documents', exact: true }).last();
    await docs.click();
    // A single click only selects, as XP did: nothing opens.
    await expect(win(page, 'Windows Explorer')).toHaveCount(0);
    await expect(mc).toContainText('1 object selected');
    await expect(mc.locator('.xp-taskpane')).toContainText('File Folder');
    await docs.dblclick();
    await expect(win(page, 'Windows Explorer').locator('#explorer-address')).toHaveValue('/home/guest/My Documents');
});

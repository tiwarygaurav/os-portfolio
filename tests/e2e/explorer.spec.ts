import { expect, test } from '@playwright/test';
import { bootAndLogin, openFromDesktop, run, shell, win } from './helpers';

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

test('Explorer right-click: Copy and Paste (then "Copy of"), New > Text Document, Details view, Properties', async ({ page }) => {
    await bootAndLogin(page);
    await run(page, 'explorer');
    const w = win(page, 'Windows Explorer');
    const item = (name: string) => w.locator(`button[data-name="${name}"]`);
    const menuItem = (label: string) => page.getByRole('menuitem', { name: new RegExp(`^${label}`) });
    const saved = () => page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('gaurav-xp-os')!).state.userFiles).sort());

    // Copy a portfolio file from its right-click menu...
    await item('about.md').click({ button: 'right' });
    await menuItem('Copy').click();
    // ...and paste it into My Documents from the empty part of the folder's menu, twice.
    await w.getByRole('button', { name: 'My Documents', exact: true }).first().click();
    await w.getByText('This folder is empty.').click({ button: 'right' });
    await menuItem('Paste').click();
    await expect(item('about.md')).toBeVisible();
    await item('about.md').click();
    await page.keyboard.press('Control+V');
    await expect(item('Copy of about.md')).toBeVisible();
    expect(await saved()).toEqual(['/home/guest/My Documents/Copy of about.md', '/home/guest/My Documents/about.md']);

    // New > Text Document goes straight into naming it, the number before the extension.
    // The empty corner of the folder has the folder's menu, not an item's.
    const area = await w.locator('ul').locator('xpath=..').boundingBox();
    await page.mouse.click(area!.x + area!.width - 12, area!.y + area!.height - 12, { button: 'right' });
    await menuItem('New').click();
    await menuItem('Text Document').click();
    // The menu fades out for 0.1 s; a key typed before it is gone can be caught by it (a ContextMenu
    // issue, reported to its owner). This test is about naming the file, so wait for the menu first.
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(w.getByLabel('New name for New Text Document.txt')).toBeFocused();
    await page.keyboard.type('todo');
    await page.keyboard.press('Enter');
    await expect(item('todo.txt')).toBeVisible();

    // The Details view shows XP's columns.
    await w.getByRole('button', { name: 'Views' }).click();
    await page.getByRole('menuitemcheckbox', { name: 'Details' }).click();
    await expect(w.getByRole('button', { name: /^Date Modified/ })).toBeVisible();
    await expect(item('todo.txt')).toContainText('Text Document');

    // Properties reports what is really there.
    await item('todo.txt').click({ button: 'right' });
    await menuItem('Properties').click();
    const props = page.getByRole('dialog', { name: 'todo.txt Properties' });
    await expect(props).toContainText('Text Document');
    await expect(props).toContainText('0 bytes');
    await expect(props).toContainText('/home/guest/My Documents');
    await props.getByRole('button', { name: 'OK' }).click();
    await expect(props).toHaveCount(0);
});

test('Explorer: Cut is refused for the portfolio, and a cut file moves on Paste', async ({ page }) => {
    await bootAndLogin(page);
    await run(page, 'cmd');
    await shell(page, 'echo moving > "/home/guest/My Documents/move-me.txt"');
    await run(page, 'explorer');
    const w = win(page, 'Windows Explorer');
    const item = (name: string) => w.locator(`button[data-name="${name}"]`);

    await item('about.md').click();
    await page.keyboard.press('Control+X');
    await expect(page.getByRole('dialog', { name: 'Error Moving File or Folder' })).toContainText('Cannot move about.md');
    await page.getByRole('dialog').getByRole('button', { name: 'OK' }).click();

    await w.getByRole('button', { name: 'My Documents', exact: true }).first().click();
    await item('move-me.txt').click();
    await page.keyboard.press('Control+X');
    await w.getByRole('button', { name: 'My Pictures', exact: true }).first().click();
    await item('Sample Pictures').click();
    await page.keyboard.press('Control+V');
    await expect(item('move-me.txt')).toBeVisible();
    const files = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('gaurav-xp-os')!).state.userFiles));
    expect(files).toEqual(['/home/guest/My Pictures/move-me.txt']);
});

test('the Search Companion finds portfolio files by a word in them, and by name with wildcards', async ({ page }) => {
    await bootAndLogin(page);
    await run(page, 'explorer');
    const w = win(page, 'Windows Explorer');
    const form = w.locator('form');
    await w.getByRole('button', { name: 'Search', exact: true }).first().click();
    await expect(w.getByText('Search Companion')).toBeVisible();

    // A word in the file: the portfolio's own text is searchable.
    await w.getByLabel('A word or phrase in the file:').fill('typescript');
    await form.getByRole('button', { name: 'Search' }).click();
    await expect(w).toContainText(/Search is complete\. There are \d+ results to display\./);
    await expect(w.getByText('In Folder', { exact: true })).toBeVisible();
    const stack = w.locator('button[data-path$="/projects/os-portfolio/stack.txt"]');
    await expect(stack).toContainText('~/projects/os-portfolio');
    await stack.dblclick();
    await expect(win(page, 'stack.txt - Notepad')).toBeVisible();

    // By name, with XP's wildcards.
    await w.locator('.xp-titlebar-text').click();
    await w.getByLabel('A word or phrase in the file:').fill('');
    await w.getByLabel('All or part of the file name:').fill('README*');
    await form.getByRole('button', { name: 'Search' }).click();
    const found = w.locator('button[data-path]');
    await expect(found.first()).toBeVisible();
    const names = await found.evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.name));
    expect(names.length).toBeGreaterThan(1);
    expect(names.every((n) => n!.startsWith('README'))).toBe(true);

    // Back closes the Search Companion and shows the folder again.
    await form.getByRole('button', { name: 'Back' }).click();
    await expect(w.getByText('Search Companion')).toHaveCount(0);
    await expect(w.locator('button[data-name="about.md"]')).toBeVisible();
});

test('dragging a file onto a folder moves it, and Ctrl+drag copies it', async ({ page }) => {
    await bootAndLogin(page);
    await run(page, 'cmd');
    await shell(page, 'mkdir "/home/guest/My Documents/Box"');
    await shell(page, 'echo a > "/home/guest/My Documents/a.txt"');
    await shell(page, 'echo b > "/home/guest/My Documents/b.txt"');
    await run(page, 'explorer');
    const w = win(page, 'Windows Explorer');
    const item = (name: string) => w.locator(`button[data-name="${name}"]`);
    const saved = () => page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('gaurav-xp-os')!).state.userFiles).sort());
    await w.getByRole('button', { name: 'My Documents', exact: true }).first().click();

    await item('a.txt').dragTo(item('Box'));
    await expect(item('a.txt')).toHaveCount(0);
    await page.keyboard.down('Control');
    await item('b.txt').dragTo(item('Box'));
    await page.keyboard.up('Control');
    await expect.poll(saved).toEqual([
        '/home/guest/My Documents/Box/a.txt',
        '/home/guest/My Documents/Box/b.txt',
        '/home/guest/My Documents/b.txt',
    ]);
});

test('the Folders pane shows the tree, opens a folder, follows navigation, and gives way to Search', async ({ page }) => {
    await bootAndLogin(page);
    await run(page, 'cmd');
    await shell(page, 'mkdir "/home/guest/My Documents/Tree Test"');
    await run(page, 'explorer');
    const w = win(page, 'Windows Explorer');
    const addr = w.locator('#explorer-address');
    await w.getByRole('button', { name: 'Folders', exact: true }).click();
    const tree = w.getByRole('tree', { name: 'Folders' });
    await expect(tree.locator('button[data-tree-path="/"]')).toContainText('Local Disk (C:)');

    // A click in the tree opens that folder.
    await tree.locator('button[data-tree-path="/etc"]').click();
    await expect(addr).toHaveValue('/etc');

    // Navigating anywhere else opens the tree down to it, the folder made in the shell included.
    await addr.fill('/home/guest/My Documents/Tree Test');
    await addr.press('Enter');
    const made = tree.locator('li[role="treeitem"][aria-selected="true"] > div button[data-tree-path="/home/guest/My Documents/Tree Test"]');
    await expect(made).toBeVisible();

    // Search and Folders take turns, as in XP.
    await w.getByRole('button', { name: 'Search', exact: true }).first().click();
    await expect(tree).toHaveCount(0);
    await expect(w.getByText('Search Companion')).toBeVisible();
});

test('a deleted search result drops out, and My Documents is not called read-only', async ({ page }) => {
    await bootAndLogin(page);
    await run(page, 'cmd');
    await shell(page, 'echo remember the milk > "/home/guest/My Documents/notes.txt"');
    await run(page, 'explorer');
    const w = win(page, 'Windows Explorer');
    await w.getByRole('button', { name: 'Search', exact: true }).first().click();
    await w.getByLabel('A word or phrase in the file:').fill('remember the milk');
    await w.getByLabel('Look in:').selectOption({ label: 'Your folder (/home/guest)' });
    await w.locator('form').getByRole('button', { name: 'Search' }).click();

    // Results used to be a frozen snapshot: a deleted file stayed listed, and every action on it failed.
    const hit = w.locator('button[data-path="/home/guest/My Documents/notes.txt"]');
    await hit.click();
    await page.keyboard.press('Delete');
    await page.getByRole('dialog', { name: 'Confirm File Delete' }).getByRole('button', { name: 'Yes' }).click();
    await expect(hit).toHaveCount(0);

    // My Documents is the visitor's to save into: its Properties said "Read-only" and "Part of the portfolio".
    await w.locator('form').getByRole('button', { name: 'Back' }).click();
    await w.locator('#explorer-address').fill('/home/guest');
    await w.locator('#explorer-address').press('Enter');
    await w.locator('button[data-name="My Documents"]').click({ button: 'right' });
    await page.getByRole('menuitem', { name: /^Properties/ }).click();
    const props = page.getByRole('dialog', { name: 'My Documents Properties' });
    await expect(props.getByRole('checkbox')).not.toBeChecked();
    await expect(props).toContainText('One of your system folders');
    await expect(props).not.toContainText('Part of the portfolio');
});

test('multiple selection: Shift takes a range, Ctrl toggles, and Properties, Delete and drag act on all of it', async ({ page }) => {
    await bootAndLogin(page);
    await run(page, 'cmd');
    for (const n of ['a', 'b', 'c', 'd']) await shell(page, `echo ${n} > "/home/guest/My Documents/${n}.txt"`);
    await shell(page, 'mkdir "/home/guest/My Documents/Box"');
    await run(page, 'explorer');
    const w = win(page, 'Windows Explorer');
    const item = (name: string) => w.locator(`button[data-name="${name}"]`);
    await w.getByRole('button', { name: 'My Documents', exact: true }).first().click();

    await item('a.txt').click();
    await item('c.txt').click({ modifiers: ['Shift'] });
    await expect(w).toContainText('3 objects selected');
    await item('a.txt').click({ modifiers: ['Control'] });
    await expect(w).toContainText('2 objects selected');

    // Properties sums the selection, as XP did.
    await item('b.txt').click({ button: 'right' });
    await page.getByRole('menuitem', { name: /^Properties/ }).click();
    const props = page.getByRole('dialog', { name: 'b.txt, ... Properties' });
    await expect(props).toContainText('2 Files');
    await expect(props).toContainText('All of type Text Document');
    await props.getByRole('button', { name: 'OK' }).click();

    // Delete takes the whole selection, in XP's words for several.
    await item('b.txt').focus();
    await page.keyboard.press('Delete');
    const confirm = page.getByRole('dialog', { name: 'Confirm Multiple File Delete' });
    await expect(confirm).toContainText('send these 2 items to the Recycle Bin');
    await confirm.getByRole('button', { name: 'Yes' }).click();
    await expect(item('b.txt')).toHaveCount(0);
    await expect(item('c.txt')).toHaveCount(0);

    // Ctrl+A, then dragging one selected item carries all of them (the folder itself stays put).
    await item('a.txt').click();
    await page.keyboard.press('Control+A');
    await expect(w).toContainText('3 objects selected');
    await item('d.txt').dragTo(item('Box'));
    await expect.poll(() =>
        page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('gaurav-xp-os')!).state.userFiles).sort()),
    ).toEqual(['/home/guest/My Documents/Box/a.txt', '/home/guest/My Documents/Box/d.txt']);
});

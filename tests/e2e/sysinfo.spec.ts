import { expect, test } from '@playwright/test';
import { bootAndLogin, run, shell, terminalText, win } from './helpers';

/** System Information (msinfo32): the browser's own facts, and this desktop's module graph. */

test.beforeEach(async ({ page }) => {
    await bootAndLogin(page);
});

test('System Summary reports what the browser measures, and Loaded Modules walks the module graph', async ({ page }) => {
    await run(page, 'msinfo32');
    const w = win(page, 'System Information');
    await expect(w).toContainText('OS Name');
    await expect(w).toContainText('Dependency Rule');
    await expect(w).toContainText('Holds');

    await w.getByRole('button', { name: 'Loaded Modules' }).click();
    await w.locator('tr[data-module="system/vfs.ts"]').click();
    const about = w.getByLabel('About system/vfs.ts');
    await expect(about).toContainText('Virtual filesystem.');

    // An import is a link to the module it names.
    await about.getByRole('button', { name: 'content/index.ts', exact: true }).click();
    await expect(w.getByLabel('About content/index.ts')).toBeVisible();

    // Find what: narrows the list.
    await w.locator('#si-find').fill('shell.ts');
    await expect(w.locator('tr[data-module="system/shell.ts"]')).toHaveCount(1);
    await expect(w.locator('tr[data-module="system/vfs.ts"]')).toHaveCount(0);
});

test('/usr/src in the shell is the same graph, and opening a module lands in System Information', async ({ page }) => {
    await run(page, 'cmd');
    await shell(page, 'cat /usr/src/README');
    await expect.poll(() => terminalText(page)).toContain('it holds');
    await shell(page, 'open /usr/src/system/shell.ts');
    await expect(win(page, 'System Information').getByLabel('About system/shell.ts')).toBeVisible();
});

test("My Computer's View system information opens it", async ({ page }) => {
    await run(page, 'mycomputer');
    await win(page, 'My Computer').getByRole('button', { name: 'View system information' }).click();
    await expect(win(page, 'System Information')).toBeVisible();
});

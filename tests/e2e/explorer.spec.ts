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

    // A file with no owning app shows its content rather than doing nothing.
    await addr.fill('~/projects/os-portfolio');
    await addr.press('Enter');
    await files.filter({ hasText: 'stack.txt' }).first().dblclick();
    await expect(page.getByRole('dialog')).toContainText('TypeScript');
    await page.getByRole('dialog').getByRole('button', { name: 'OK' }).click();
});

test('Run hands a folder with no owning app to Explorer', async ({ page }) => {
    await bootAndLogin(page);
    await run(page, '/etc');
    await expect(win(page, 'Windows Explorer')).toBeVisible();
});

import { expect, test } from '@playwright/test';
import { bootAndLogin, run, shell, terminalText, win, windows } from './helpers';

test.beforeEach(async ({ page }) => {
    await bootAndLogin(page);
    await run(page, 'cmd');
    await expect(win(page, 'Command Prompt')).toBeVisible();
});

test('history lists what was actually typed', async ({ page }) => {
    await shell(page, 'whoami');
    await shell(page, 'history');
    const text = await terminalText(page);
    expect(text).toContain('whoami');
    expect(text).not.toContain('No history yet');
});

test('open refuses inherited keys through the real app registry', async ({ page }) => {
    const before = await windows(page).count();
    await shell(page, 'open constructor');
    await expect(win(page, 'Command Prompt')).toContainText('no such path, and no app registered');
    expect(await windows(page).count()).toBe(before);
});

test('inherited object keys are not commands', async ({ page }) => {
    for (const name of ['constructor', '__proto__', 'toString']) {
        await shell(page, name);
        await expect(win(page, 'Command Prompt')).toContainText(`${name}: command not found`);
    }
});

test('tree / includes the live process table', async ({ page }) => {
    await shell(page, 'tree /');
    await expect(win(page, 'Command Prompt')).toContainText('proc/');
});

test('ps and kill operate on real windows', async ({ page }) => {
    await run(page, 'notepad');
    await expect(win(page, 'Untitled - Notepad')).toBeVisible();
    await shell(page, 'ps');
    const text = await terminalText(page);
    const pid = text.match(/^(w\d+)\s+\w+\s+\d+\s+Untitled - Notepad$/m)?.[1];
    expect(pid, 'ps should list Notepad with a readable pid').toBeTruthy();

    await shell(page, `kill ${pid}`);
    await expect(win(page, 'Command Prompt')).toContainText(`Closed ${pid}.`);
    await expect(win(page, 'Untitled - Notepad')).toHaveCount(0);
});

test('Tab completes against the working directory', async ({ page }) => {
    await shell(page, 'cd ~/projects');
    const before = await terminalText(page);
    await page.locator('#shell-input').fill('ls ');
    await page.locator('#shell-input').press('Tab');
    await expect.poll(async () => (await terminalText(page)).slice(before.length)).toContain('os-portfolio/');
    const added = (await terminalText(page)).slice(before.length);
    expect(added).not.toContain('etc/');
});

test('events reads the same log as the Event Viewer', async ({ page }) => {
    await shell(page, 'events 5');
    await expect(win(page, 'Command Prompt')).toContainText(/events? in the log \(\d+ published this session\)/);
    await expect(win(page, 'Command Prompt')).toContainText('WindowManager');
});

test('/etc/system.conf is generated from what is really persisted', async ({ page }) => {
    await shell(page, 'cat /etc/system.conf');
    const text = await terminalText(page);
    const persisted = text.split('\n').find((l) => l.startsWith('persisted'));
    expect(persisted).toBe(
        'persisted      = volume, mute, wallpaper, wallpaper picture, colour scheme, screen saver, your files (/home/guest), your folders, icon positions, recycle bin, deleted desktop icons',
    );
});

test('a pipeline runs in the real Command Prompt', async ({ page }) => {
    await shell(page, 'ls ~/projects | grep portfolio');
    // The prompt echoes the command, which says "portfolio" but not the folder's full name.
    await expect.poll(() => terminalText(page)).toContain('os-portfolio/');
    expect(await terminalText(page)).not.toContain('url-shortener/');
    await shell(page, 'find ~ -name *.md | wc -l');
    await expect.poll(() => terminalText(page)).toMatch(/\n\s*\d+\s*\n/);
});

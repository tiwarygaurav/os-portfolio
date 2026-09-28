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
    await expect.poll(() => terminalText(page)).toContain('It holds.');
    await expect.poll(() => terminalText(page)).toMatch(/Checked over \d+ modules and the \d+ imports between them/);
    await shell(page, 'open /usr/src/system/shell.ts');
    await expect(win(page, 'System Information').getByLabel('About system/shell.ts')).toBeVisible();
});

test('selecting a module scrolls its own list, never the window or the desktop', async ({ page }) => {
    await run(page, 'msinfo32');
    const w = win(page, 'System Information');
    await w.getByRole('button', { name: 'Loaded Modules' }).click();

    // Park the window low, most of it below the screen, as a visitor might.
    const bar = w.locator('.xp-titlebar').first();
    const start = (await bar.boundingBox())!;
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
    await page.mouse.down();
    await page.mouse.move(start.x + start.width / 2, page.viewportSize()!.height - 140, { steps: 8 });
    await page.mouse.up();
    const before = (await bar.boundingBox())!;

    // The details open below a hundred rows. dispatchEvent, because Playwright's own click would
    // scroll things into view itself and hide exactly what this checks.
    await w.locator('tr[data-module]').first().dispatchEvent('click');
    await expect(w.getByLabel(/^About /)).toHaveCount(1);
    await expect.poll(() => w.locator('section').first().evaluate((el) => el.scrollTop)).toBeGreaterThan(0);

    expect((await bar.boundingBox())!.y).toBe(before.y);
    // Nothing that holds the list moved: scrollIntoView used to scroll the window frame and the desktop.
    const moved = await w.locator('section').first().evaluate((el) => {
        const out: string[] = [];
        for (let at = el.parentElement; at; at = at.parentElement) if (at.scrollTop || at.scrollLeft) out.push(at.className);
        return out;
    });
    expect(moved).toEqual([]);
});

test('Colour scheme and storage read as words and exact counts', async ({ page }) => {
    await run(page, 'msinfo32');
    const w = win(page, 'System Information');
    await w.getByRole('button', { name: 'Display' }).click();
    await expect(w).toContainText('Windows XP style (Blue)');
    await w.getByRole('button', { name: 'Storage' }).click();
    await expect(w).toContainText('0 characters of 2,000,000 characters');
    await w.getByRole('button', { name: 'Dependency Rule' }).click();
    await expect(w).toContainText('Modules checked');
    await expect(w).toContainText('stay headless');
});

test("My Computer's View system information opens it", async ({ page }) => {
    await run(page, 'mycomputer');
    await win(page, 'My Computer').getByRole('button', { name: 'View system information' }).click();
    await expect(win(page, 'System Information')).toBeVisible();
});

test('Storage follows every write, not only a new file or folder', async ({ page }) => {
    await run(page, 'msinfo32');
    const w = win(page, 'System Information');
    await w.getByRole('button', { name: 'Storage' }).click();
    const used = () => w.locator('tr', { hasText: 'Used' }).innerText();
    await run(page, 'cmd');
    await shell(page, 'echo a > "/home/guest/My Documents/grow.txt"');
    await expect.poll(used).toMatch(/[1-9][\d,]* characters of/);
    const before = await used();
    // Same file, same windows: only its content grows, and the exact count must follow it. (A review
    // traced this as going stale; in the browser the window re-renders with its parent anyway, so
    // this passes with or without the window's own subscription to file changes. It checks the
    // behaviour, not that fix.)
    await shell(page, 'echo "a longer line than the first" >> "/home/guest/My Documents/grow.txt"');
    await expect.poll(used).not.toBe(before);
});

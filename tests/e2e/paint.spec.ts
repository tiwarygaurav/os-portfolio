import { expect, test, type Locator, type Page } from '@playwright/test';
import { bootAndLogin, run, shell, terminalText } from './helpers';

/**
 * Paint, in a real browser: pixels that land where they should, dialogs that hand the keyboard
 * back, and pictures that become real files in /home/guest. Two of these guard bugs found by hand:
 * Ctrl+Z stopped working after any dialog closed, and a click that dismissed a menu also drew.
 */

const paint = (page: Page) => page.locator('[data-app="paint"]');
const canvas = (page: Page) => paint(page).locator('canvas[aria-label="Picture"]');

/** The picture's pixel at (x, y), as "r,g,b". */
async function pixel(page: Page, x: number, y: number): Promise<string> {
    return canvas(page).evaluate(
        (c: HTMLCanvasElement, [px, py]: number[]) =>
            Array.from(c.getContext('2d')!.getImageData(px, py, 1, 1).data).slice(0, 3).join(','),
        [x, y],
    );
}

/** Drag across the picture, in picture pixels. */
async function drag(page: Page, from: [number, number], to: [number, number]): Promise<void> {
    const box = (await canvas(page).boundingBox())!;
    await page.mouse.move(box.x + from[0] + 0.5, box.y + from[1] + 0.5);
    await page.mouse.down();
    await page.mouse.move(box.x + to[0] + 0.5, box.y + to[1] + 0.5, { steps: 4 });
    await page.mouse.up();
}

const tool = (w: Locator, name: string) => w.getByRole('button', { name, exact: true }).click();

test.beforeEach(async ({ page }) => {
    await bootAndLogin(page);
    await run(page, 'mspaint');
    await expect(canvas(page)).toBeVisible();
});

test('shapes are drawn in whole pixels, so Fill With Color meets the outline exactly', async ({ page }) => {
    const w = paint(page);
    await tool(w, 'Ellipse');
    await drag(page, [20, 20], [80, 60]);
    await w.getByRole('button', { name: 'Color #ff0000' }).click();
    await tool(w, 'Fill With Color');
    await drag(page, [50, 40], [50, 40]);
    await expect.poll(() => pixel(page, 50, 40)).toBe('255,0,0');
    // No anti-aliased fringe was left unfilled against the outline, and nothing leaked out of it.
    expect(await pixel(page, 50, 21)).toBe('255,0,0');
    expect(await pixel(page, 5, 5)).toBe('255,255,255');
});

test('Ctrl+Z still reaches Paint after a dialog closes', async ({ page }) => {
    await page.keyboard.press('Control+e');
    const attributes = page.getByRole('dialog', { name: 'Attributes' });
    await attributes.locator('#attr-w').fill('200');
    await attributes.getByRole('button', { name: 'OK' }).click();
    await expect.poll(() => canvas(page).evaluate((c: HTMLCanvasElement) => c.width)).toBe(200);
    await page.keyboard.press('Control+z');
    await expect.poll(() => canvas(page).evaluate((c: HTMLCanvasElement) => c.width)).not.toBe(200);
});

test('the click that closes a menu does not also draw', async ({ page }) => {
    const w = paint(page);
    await w.getByRole('menuitem', { name: 'File' }).click();
    await expect(page.getByRole('menuitem', { name: /Save As/ })).toBeVisible();
    // Well to the right of the open dropdown, so the press lands on the canvas itself.
    await drag(page, [500, 300], [540, 300]);
    await expect(page.getByRole('menuitem', { name: /Save As/ })).toHaveCount(0);
    expect(await pixel(page, 520, 300)).toBe('255,255,255');
});

test('a saved picture is a real file: the title, the shell and Open all agree', async ({ page }) => {
    const w = paint(page);
    await tool(w, 'Rectangle');
    await w.getByRole('button', { name: 'Fill, no border' }).click();
    await drag(page, [10, 10], [30, 30]);
    await page.keyboard.press('Control+s');
    const saveAs = page.getByRole('dialog', { name: 'Save As' });
    await saveAs.locator('#fd-name').fill('e2e-drawing');
    await saveAs.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(w.locator('.xp-titlebar-text')).toHaveText('e2e-drawing - Paint');

    await run(page, 'cmd');
    await shell(page, 'ls "/home/guest/My Pictures"');
    await expect.poll(() => terminalText(page)).toContain('e2e-drawing.png');
});

test('Set As Background saves the picture first, then puts it on the desktop', async ({ page }) => {
    const w = paint(page);
    const pictureWallpaper = () =>
        page.evaluate(() => Array.from(document.querySelectorAll('div')).some((d) => getComputedStyle(d).backgroundImage.includes('data:image/png')));
    expect(await pictureWallpaper()).toBe(false);
    await drag(page, [10, 10], [60, 40]);
    await w.getByRole('menuitem', { name: 'File' }).click();
    await page.getByRole('menuitem', { name: 'Set As Background (Tiled)' }).click();
    await page.getByRole('dialog').filter({ hasText: 'must be saved' }).getByRole('button', { name: 'Yes' }).click();
    const saveAs = page.getByRole('dialog', { name: 'Save As' });
    await saveAs.locator('#fd-name').fill('e2e-wallpaper');
    await saveAs.getByRole('button', { name: 'Save', exact: true }).click();
    await expect.poll(pictureWallpaper).toBe(true);
});

test('closing with unsaved changes asks first, in XP words', async ({ page }) => {
    const w = paint(page);
    await drag(page, [10, 10], [60, 10]);
    await w.locator('.xp-titlebar').getByRole('button', { name: 'Close' }).click();
    const ask = page.getByRole('dialog').filter({ hasText: 'Save changes to untitled?' });
    await ask.getByRole('button', { name: 'Cancel' }).click();
    await expect(w).toBeVisible();
    await w.locator('.xp-titlebar').getByRole('button', { name: 'Close' }).click();
    await ask.getByRole('button', { name: 'No' }).click();
    await expect(w).toHaveCount(0);
});

// ---- from the review of 7212919 ------------------------------------------------------------------

test('typed text is unsaved work: closing asks, before the text is part of the picture', async ({ page }) => {
    const w = paint(page);
    await tool(w, 'Text');
    await drag(page, [20, 20], [160, 60]);
    await page.keyboard.type('hello');
    await w.locator('.xp-titlebar').getByRole('button', { name: 'Close' }).click();
    const ask = page.getByRole('dialog').filter({ hasText: 'Save changes to untitled?' });
    await expect(ask).toBeVisible();
    await ask.getByRole('button', { name: 'Cancel' }).click();
    await expect(w).toBeVisible();
});

test('Log Off with an untitled picture: Yes saves through Save As, and then the session really ends', async ({ page }) => {
    await drag(page, [10, 10], [60, 40]);
    await page.getByText('start', { exact: true }).first().click();
    await page.locator('.xp-startmenu-footer-btn', { hasText: 'Log Off' }).click();
    await page.locator('[data-exit="logoff"]').click();
    await page.getByRole('dialog', { name: 'Paint' }).getByRole('button', { name: 'Yes' }).click();
    const saveAs = page.getByRole('dialog', { name: 'Save As' });
    await saveAs.locator('#fd-name').fill('before-logoff');
    await saveAs.getByRole('button', { name: 'Save', exact: true }).click();
    // Paint used to answer "not now" while Save As was showing, which Log Off reads as Cancel.
    await expect(page.locator('[data-logon-user], div.cursor-pointer:has(img[alt="User"])').first()).toBeVisible({ timeout: 10_000 });
    const files = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('gaurav-xp-os')!).state.userFiles));
    expect(files).toContain('/home/guest/My Pictures/before-logoff.png');
});

test('a click on a resize handle, with no drag, leaves the picture its size', async ({ page }) => {
    const size = () => canvas(page).evaluate((c: HTMLCanvasElement) => `${c.width}x${c.height}`);
    const before = await size();
    for (const name of ['Resize', 'Resize width', 'Resize height']) {
        const handle = paint(page).getByRole('separator', { name, exact: true });
        const box = (await handle.boundingBox())!;
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.up();
    }
    expect(await size()).toBe(before);
});

test('the Fonts toolbar leaves the keyboard in the text box', async ({ page }) => {
    const w = paint(page);
    await tool(w, 'Text');
    await drag(page, [20, 20], [220, 80]);
    const text = w.getByRole('textbox', { name: 'Text' });
    await page.keyboard.type('ab');
    await w.getByRole('toolbar', { name: 'Fonts' }).getByRole('button', { name: 'Bold' }).click();
    await page.keyboard.type('cd');
    const size = w.getByRole('toolbar', { name: 'Fonts' }).getByRole('combobox', { name: 'Font size' });
    // With the list focused, as choosing from it leaves it.
    await size.focus();
    await size.selectOption('18');
    await page.keyboard.type('ef');
    await expect(text).toHaveValue('abcdef');
    // A list only clicked, and closed without a choice, does not take the next letters.
    const font = w.getByRole('toolbar', { name: 'Fonts' }).getByRole('combobox', { name: 'Font', exact: true });
    await font.dispatchEvent('mousedown');
    await font.focus();
    await page.keyboard.type('gh');
    await expect(text).toHaveValue('abcdefgh');
});

test('Image > Attributes in a window parked low does not push its title bar up', async ({ page }) => {
    const w = paint(page);
    // The window's own title bar, not the dialog's that will open inside it.
    const title = w.locator('.xp-titlebar').first();
    // Park the window so most of it hangs below the screen.
    const t = (await title.boundingBox())!;
    await page.mouse.move(t.x + 60, t.y + t.height / 2);
    await page.mouse.down();
    await page.mouse.move(t.x + 60, 560, { steps: 6 });
    await page.mouse.up();
    const parked = (await title.boundingBox())!.y;
    await w.getByRole('menuitem', { name: 'Image' }).click();
    await page.getByRole('menuitem', { name: /^Attributes/ }).click();
    await expect(page.getByRole('dialog', { name: 'Attributes' })).toBeVisible();
    expect((await title.boundingBox())!.y).toBe(parked);
});

test('Alt+F does not open Paint\'s menus behind its Save As', async ({ page }) => {
    const w = paint(page);
    await w.getByRole('menuitem', { name: 'File' }).click();
    await page.getByRole('menuitem', { name: /^Save As/ }).click();
    const saveAs = page.getByRole('dialog', { name: 'Save As' });
    await expect(saveAs).toBeVisible();
    // A press on a part of the dialog that takes no focus, then keys with focus on the page.
    await saveAs.locator('.luna-title').first().click();
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press('Alt+f');
    await expect(page.getByRole('menuitem', { name: /^Save As/ })).toHaveCount(0);
});

test('keys pressed after a click inside Save As stay with the dialog, not the picture behind it', async ({ page }) => {
    const w = paint(page);
    await drag(page, [10, 10], [60, 10]);
    await expect.poll(() => pixel(page, 30, 10)).toBe('0,0,0');
    await page.keyboard.press('Control+s');
    const saveAs = page.getByRole('dialog', { name: 'Save As' });
    await expect(saveAs).toBeVisible();
    await saveAs.locator('.luna-title').first().click();
    await page.keyboard.press('Control+z');
    await saveAs.getByRole('button', { name: 'Cancel' }).click();
    // Paint's own Ctrl+Z would have taken the line back.
    expect(await pixel(page, 30, 10)).toBe('0,0,0');
    await expect(w).toBeVisible();
});

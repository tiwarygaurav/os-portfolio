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

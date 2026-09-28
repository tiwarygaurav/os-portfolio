import { expect, test, type Page } from '@playwright/test';
import { bootAndLogin, openFromDesktop, run, win, windows } from './helpers';

test.beforeEach(async ({ page }) => {
    await bootAndLogin(page);
});

async function desktopMenu(page: Page, submenu?: string): Promise<void> {
    await page.mouse.click(900, 300, { button: 'right' });
    if (submenu) await page.getByRole('menuitem', { name: submenu }).hover();
}

test('resizing a window by its top edge never strands it behind the taskbar', async ({ page }) => {
    await openFromDesktop(page, 'contact');
    const contact = win(page, 'Contact Me');
    await expect(contact).toBeVisible();
    const vh = page.viewportSize()!.height;

    // Drag it as low as it will go (the store keeps its title bar above the taskbar)...
    const title = (await contact.locator('.xp-titlebar-text').boundingBox())!;
    await page.mouse.move(title.x + 20, title.y + 5);
    await page.mouse.down();
    await page.mouse.move(title.x + 20, vh + 200, { steps: 8 });
    await page.mouse.up();

    // ...then pull its top edge down, which would push the title bar further.
    const edge = (await contact.locator('.xp-resize.n').boundingBox())!;
    await page.mouse.move(edge.x + edge.width / 2, edge.y + edge.height / 2);
    await page.mouse.down();
    await page.mouse.move(edge.x + edge.width / 2, edge.y + 40, { steps: 5 });
    await page.mouse.up();

    const after = (await contact.boundingBox())!;
    expect(after.y + 28).toBeLessThanOrEqual(vh - 30);
});

test('Arrange Icons By Name sorts by the name on the icon', async ({ page }) => {
    await desktopMenu(page, 'Arrange Icons By');
    await page.getByRole('menuitem', { name: 'Name', exact: true }).click();
    const at = async (id: string) => (await page.locator(`[data-desktop-icon="${id}"]`).boundingBox())!;
    const [notepad, paint] = [await at('notepad'), await at('paint')];
    // Column-major grid: "Notepad" comes before "Paint" (it used to sort as "Untitled - Notepad").
    const order = (b: { x: number; y: number }) => b.x * 10_000 + b.y;
    expect(order(notepad)).toBeLessThan(order(paint));
});

test('the desktop keeps the keyboard after answering its own message box', async ({ page }) => {
    await page.locator('[data-desktop-icon="contact"]').click();
    await page.keyboard.press('Delete');
    await page.getByRole('dialog').getByRole('button', { name: 'No' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.keyboard.press('Delete');
    await expect(page.getByRole('dialog')).toContainText('Contact Me');
});

test('an icon dropped on the Recycle Bin is no longer selected', async ({ page }) => {
    // Select it, then delete it by dropping it on the bin — not with the Delete key, which clears the
    // selection on its own. Enter opens whatever is still selected.
    await page.locator('[data-desktop-icon="contact"]').click();
    const from = (await page.locator('[data-desktop-icon="contact"]').boundingBox())!;
    const to = (await page.locator('[data-desktop-icon="trash"]').boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 15 });
    await page.mouse.up();
    await expect(page.locator('[data-desktop-icon="contact"]')).toHaveCount(0);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    await expect(windows(page)).toHaveCount(0);
});

test('hidden desktop icons cannot be selected or acted on', async ({ page }) => {
    await desktopMenu(page, 'Arrange Icons By');
    await page.getByRole('menuitemcheckbox', { name: 'Show Desktop Icons' }).click();
    await expect(page.locator('[data-desktop-icon="contact"]')).toBeHidden();

    // A press where the icons were gives the desktop the keyboard...
    await page.mouse.click(60, 60);
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Delete');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.keyboard.press('Enter');
    // ...and a rubber band drawn across them takes none either.
    await page.mouse.move(10, 10);
    await page.mouse.down();
    await page.mouse.move(400, 600, { steps: 6 });
    await page.mouse.up();
    await page.keyboard.press('Delete');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(windows(page)).toHaveCount(0);
});

test('a press on a window\'s own dialog takes the keyboard from the desktop', async ({ page }) => {
    await run(page, 'notepad');
    const np = win(page, 'Untitled - Notepad');
    await np.getByRole('button', { name: 'File' }).dispatchEvent('mousedown');
    await np.getByRole('button', { name: 'Save As...' }).click();
    const saveAs = page.getByRole('dialog', { name: 'Save As' });
    await expect(saveAs).toBeVisible();

    // Select a desktop icon while the Save As box stays open, then press the box's title bar,
    // where nothing takes focus.
    await page.locator('[data-desktop-icon="contact"]').click();
    const box = (await saveAs.boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + 8);
    await page.keyboard.press('Delete');
    await expect(page.getByRole('dialog', { name: 'Confirm File Delete' })).toHaveCount(0);
});

test('Show Desktop\'s second click brings back what is still open, and makes it active', async ({ page }) => {
    await openFromDesktop(page, 'notepad');
    await openFromDesktop(page, 'contact');
    await expect(win(page, 'Contact Me')).toBeVisible();
    const showDesktop = page.getByRole('button', { name: 'Show Desktop' });
    await showDesktop.click();
    await expect(win(page, 'Untitled - Notepad')).toBeHidden();

    // Close the window that was on top while both are minimised.
    await page.locator('.xp-task-btn', { hasText: 'Contact Me' }).click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Close' }).click();
    await expect(page.locator('.xp-task-btn', { hasText: 'Contact Me' })).toHaveCount(0);

    await showDesktop.click();
    await expect(win(page, 'Untitled - Notepad')).toBeVisible();
    // It used to hand focus to the closed window's pid, leaving nothing active.
    await expect(page.locator('.xp-task-btn', { hasText: 'Notepad' })).toHaveAttribute('aria-pressed', 'true');
});

test('a disabled menu item does not open its submenu from the keyboard', async ({ page }) => {
    await desktopMenu(page, 'New');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('menu')).toHaveCount(1);
});

test('the pointer in a submenu takes the keyboard with it', async ({ page }) => {
    await desktopMenu(page, 'Arrange Icons By');
    await page.getByRole('menuitem', { name: 'Type', exact: true }).hover();
    // Down from Type is Show Desktop Icons in the submenu; in the parent it would have been Refresh,
    // which also hides the icons, but only for a moment.
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
    await expect(page.locator('[data-desktop-icon="contact"]')).toBeHidden();
});

test('a submenu with no room on either side stays on screen', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.waitForTimeout(400); // the icon grid reflows for the new size
    // Hide the icons first, from a point of bare desktop, so the next menu can open near the left
    // edge: from there its submenu fits neither to the right nor, flipped, to the left.
    const bare = await page.evaluate(() => {
        const layer = document.querySelector('[data-desktop-icon]')?.parentElement?.parentElement;
        for (let x = 300; x > 20; x -= 20) {
            for (let y = 120; y < 600; y += 20) if (document.elementFromPoint(x, y) === layer) return { x, y };
        }
        return null;
    });
    expect(bare).not.toBeNull();
    await page.mouse.click(bare!.x, bare!.y, { button: 'right' });
    await page.getByRole('menuitem', { name: 'Arrange Icons By' }).hover();
    await page.getByRole('menuitemcheckbox', { name: 'Show Desktop Icons' }).click();
    await expect(page.locator('[data-desktop-icon="contact"]')).toBeHidden();

    await page.mouse.click(30, 300, { button: 'right' });
    await page.getByRole('menuitem', { name: 'Arrange Icons By' }).hover();
    const sub = page.getByRole('menu').nth(1);
    await expect(sub).toBeVisible();
    const box = (await sub.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(320);
});

test('a rubber band ends when the pointer is cancelled', async ({ page }) => {
    await page.mouse.move(700, 150);
    await page.mouse.down();
    await page.mouse.move(800, 300, { steps: 5 });
    await expect(page.locator('.xp-marquee')).toBeVisible();
    await page.evaluate(() => document.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true })));
    await expect(page.locator('.xp-marquee')).toHaveCount(0);
    await page.mouse.up();
});

test('Run says why a /usr/src path cannot open when the module graph fails to load', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    // Offline, as far as lazily loaded code is concerned: /usr/src is mounted by a chunk.
    await page.route('**/_next/static/chunks/**', (route) => route.abort());
    await run(page, '/usr/src/README');
    await expect(page.getByText(/module graph did not load/)).toBeVisible();
    expect(errors).toEqual([]);
});

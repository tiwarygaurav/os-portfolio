import { expect, test } from '@playwright/test';
import { bootAndLogin, openFromDesktop, run, win } from './helpers';

test.beforeEach(async ({ page }) => {
    await bootAndLogin(page);
});

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
    await page.mouse.click(900, 300, { button: 'right' });
    await page.getByRole('menuitem', { name: 'Arrange Icons By' }).hover();
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

test('a deleted icon is no longer selected', async ({ page }) => {
    await page.locator('[data-desktop-icon="contact"]').click();
    await page.keyboard.press('Delete');
    await page.getByRole('dialog').getByRole('button', { name: 'Yes' }).click();
    await expect(page.locator('[data-desktop-icon="contact"]')).toHaveCount(0);
    await page.keyboard.press('Delete');
    await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('a disabled menu item does not open its submenu from the keyboard', async ({ page }) => {
    await page.mouse.click(900, 300, { button: 'right' });
    await page.getByRole('menuitem', { name: 'New' }).hover();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('menu')).toHaveCount(1);
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

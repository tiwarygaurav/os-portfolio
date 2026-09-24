import { expect, test, type Page } from '@playwright/test';
import { bootAndLogin, run } from './helpers';

/**
 * Solitaire in a real browser: the deal, the stock, undo, an illegal drop snapping back, and the
 * Options dialog changing the rules. The rules themselves are unit-tested headless
 * (tests/unit/solitaire.test.cjs); this checks the input and the table the visitor touches.
 */

const table = (page: Page) => page.locator('[data-app="solitaire"]');
const pile = (page: Page, key: string) => table(page).locator(`[data-pile="${key}"][data-index]:not([data-index="-1"])`);

/** The card on top of a pile: the highest index. Stacked cards overlap, so DOM order will not do. */
async function top(page: Page, key: string) {
    const n = await pile(page, key).count();
    return table(page).locator(`[data-pile="${key}"][data-index="${n - 1}"]`);
}

test.beforeEach(async ({ page }) => {
    await bootAndLogin(page);
    await run(page, 'sol');
    // Cards are laid out once the table knows its size; wait for the whole deal.
    await expect(pile(page, 't6')).toHaveCount(7);
});

test('deals seven columns, draws three from the stock, and Ctrl+Z puts them back', async ({ page }) => {
    const columns = await Promise.all([0, 1, 2, 3, 4, 5, 6].map((t) => pile(page, `t${t}`).count()));
    expect(columns).toEqual([1, 2, 3, 4, 5, 6, 7]);
    await expect(pile(page, 'stock')).toHaveCount(24);

    await (await top(page, 'stock')).click();
    await expect(pile(page, 'waste')).toHaveCount(3);
    await page.keyboard.press('Control+z');
    await expect(pile(page, 'waste')).toHaveCount(0);
    await expect(pile(page, 'stock')).toHaveCount(24);
});

test('an illegal drop snaps the card back to where it was', async ({ page }) => {
    const card = await top(page, 't6');
    const code = await card.getAttribute('data-card');
    const from = (await card.boundingBox())!;
    const stock = (await (await top(page, 'stock')).boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + 10);
    await page.mouse.down();
    await page.mouse.move(stock.x + stock.width / 2, stock.y + 20, { steps: 8 });
    // Mid-drag the card really follows the pointer, far from home...
    const carried = (await card.boundingBox())!;
    expect(Math.abs(carried.x - from.x)).toBeGreaterThan(100);
    await page.mouse.up();
    // ...and on an illegal drop it is back on its column, in the rules and on screen.
    const dropped = table(page).locator(`[data-card="${code}"]`);
    await expect(dropped).toHaveAttribute('data-pile', 't6');
    await expect.poll(async () => Math.round((await dropped.boundingBox())!.x)).toBe(Math.round(from.x));
});

test('Options: Draw One deals a new game that turns one card at a time', async ({ page }) => {
    await table(page).getByRole('menuitem', { name: 'Game' }).click();
    await page.getByRole('menuitem', { name: /Options/ }).click();
    const options = page.getByRole('dialog', { name: 'Options' });
    await options.getByText('Draw one').click();
    await options.getByRole('button', { name: 'OK' }).click();
    await (await top(page, 'stock')).click();
    await expect(pile(page, 'waste')).toHaveCount(1);
});

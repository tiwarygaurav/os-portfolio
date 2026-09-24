import { expect, test, type Page } from '@playwright/test';
import { bootAndLogin, run, settledBox } from './helpers';

/**
 * Minesweeper in a real browser: a window that hugs its field as winmine's did, a first click
 * that always opens ground, and flags that count down the mine counter. The rules themselves are
 * unit-tested headless (tests/unit/minesweeper.test.cjs).
 */

const game = (page: Page) => page.locator('[data-app="minesweeper"]');
const field = (page: Page) => game(page).locator('[data-rows][data-cols]');
const cell = (page: Page, r: number, c: number) => game(page).locator(`[data-cell="${r},${c}"]`);

async function level(page: Page, name: string): Promise<void> {
    await game(page).getByRole('menuitem', { name: 'Game' }).click();
    await page.getByRole('menuitemradio', { name }).click();
}

test.beforeEach(async ({ page }) => {
    await bootAndLogin(page);
    await run(page, 'winmine');
    await expect(field(page)).toHaveAttribute('data-rows', '9');
});

test('the window hugs the field, growing for Expert and shrinking back for Beginner', async ({ page }) => {
    const beginner = await settledBox(game(page));
    await level(page, 'Expert');
    await expect(field(page)).toHaveAttribute('data-cols', '30');
    const expert = await settledBox(game(page));
    expect(expert.width).toBeGreaterThan(beginner.width + 200);
    expect(expert.height).toBeGreaterThan(beginner.height + 80);
    await level(page, 'Beginner');
    await expect(field(page)).toHaveAttribute('data-cols', '9');
    await expect.poll(async () => Math.round((await settledBox(game(page))).width)).toBe(Math.round(beginner.width));
});

test('the first click never hits a mine and opens an area', async ({ page }) => {
    await cell(page, 4, 4).click();
    await expect(field(page)).toHaveAttribute('data-status', 'playing');
    // The clicked square and its neighbours are clear, so at least those nine are open.
    await expect.poll(() => game(page).locator('[data-cell]:not([data-tile="covered"])').count()).toBeGreaterThanOrEqual(9);
    await expect(cell(page, 4, 4)).not.toHaveAttribute('data-tile', 'mine-hit');
});

test('right-click flags a square and the mine counter counts down', async ({ page }) => {
    const counter = game(page).getByRole('img', { name: /^Mines left:/ });
    await expect(counter).toHaveAccessibleName('Mines left: 10');
    await cell(page, 0, 0).click({ button: 'right' });
    await expect(cell(page, 0, 0)).toHaveAttribute('data-tile', 'flag');
    await expect(counter).toHaveAccessibleName('Mines left: 9');
    // A flagged square ignores a left click.
    await cell(page, 0, 0).click();
    await expect(cell(page, 0, 0)).toHaveAttribute('data-tile', 'flag');
});

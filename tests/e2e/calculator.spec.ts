import { expect, test, type Page } from '@playwright/test';
import { bootAndLogin, run, settledBox } from './helpers';

/**
 * Calculator in a real browser: the two views and the window that fits each, XP's own evaluation
 * rules (Standard left to right, Scientific by precedence), and radix conversion. The arithmetic
 * itself is unit-tested headless (tests/unit/calculator.test.cjs).
 */

const calc = (page: Page) => page.locator('[data-app="calculator"]');
const display = (page: Page) => calc(page).locator('[data-calc-display]');

async function view(page: Page, name: 'Standard' | 'Scientific'): Promise<void> {
    await calc(page).getByRole('menuitem', { name: 'View' }).click();
    await page.getByRole('menuitemradio', { name, exact: true }).click();
}

test.beforeEach(async ({ page }) => {
    await bootAndLogin(page);
    await run(page, 'calc');
    await expect(display(page)).toHaveText('0');
});

test('Standard evaluates left to right and Scientific by precedence, as XP did', async ({ page }) => {
    await page.keyboard.type('2+3*4=');
    await expect(display(page)).toHaveText('20');
    await view(page, 'Scientific');
    await page.keyboard.press('Escape');
    await page.keyboard.type('2+3*4=');
    await expect(display(page)).toHaveText('14');
});

test('the window fits each view, growing for Scientific and shrinking back', async ({ page }) => {
    const standard = await settledBox(calc(page));
    await view(page, 'Scientific');
    await expect(calc(page).getByRole('radio', { name: 'Hex' })).toBeVisible();
    const scientific = await settledBox(calc(page));
    expect(scientific.width).toBeGreaterThan(standard.width + 150);
    await view(page, 'Standard');
    await expect.poll(async () => Math.round((await settledBox(calc(page))).width)).toBe(Math.round(standard.width));
});

test('Hex and Bin show the same value in another radix', async ({ page }) => {
    await view(page, 'Scientific');
    await page.keyboard.type('255');
    await calc(page).getByRole('radio', { name: 'Hex' }).check();
    await expect(display(page)).toHaveText('FF');
    await calc(page).getByRole('radio', { name: 'Bin' }).check();
    await expect(display(page)).toHaveText('11111111');
});

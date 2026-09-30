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

// ---- menus, from the review of 7212919 -----------------------------------------------------------

test('the click that closes a menu does not also press the key under it', async ({ page }) => {
    await calc(page).getByRole('menuitem', { name: 'View' }).click();
    await expect(page.getByRole('menuitemradio', { name: 'Scientific' })).toBeVisible();
    await calc(page).getByRole('button', { name: '7', exact: true }).click();
    await expect(page.getByRole('menuitemradio', { name: 'Scientific' })).toHaveCount(0);
    await expect(display(page)).toHaveText('0');
    // The next click is an ordinary one.
    await calc(page).getByRole('button', { name: '7', exact: true }).click();
    await expect(display(page)).toHaveText('7');
});

test('a press inside an open menu keeps the keyboard in it: Escape closes the menu, not the sum', async ({ page }) => {
    await page.keyboard.type('5');
    await calc(page).getByRole('menuitem', { name: 'View' }).click();
    const menu = page.getByRole('menu');
    await menu.getByRole('separator').first().click();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(display(page)).toHaveText('5');
});

test('Alt+letter does not open a menu behind an open dialog', async ({ page }) => {
    await calc(page).getByRole('menuitem', { name: 'Help' }).click();
    await page.getByRole('menuitem', { name: 'Help Topics' }).click();
    await expect(calc(page).getByRole('dialog')).toBeVisible();
    // Leave focus on the page, as a click on the title bar does.
    await calc(page).locator('.xp-titlebar-text').first().click();
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press('Alt+v');
    await expect(page.getByRole('menuitemradio', { name: 'Scientific' })).toHaveCount(0);
});

test('Alt+letter does not open a menu while an XP message box is up', async ({ page }) => {
    await calc(page).getByRole('menuitem', { name: 'Help' }).click();
    await page.getByRole('menuitem', { name: 'About Calculator' }).click();
    await expect(page.getByRole('dialog', { name: 'About Calculator' })).toBeVisible();
    // Focus somewhere in the Calculator's own window, where the message box does not hear keys.
    await calc(page).getByRole('menubar').focus();
    await page.keyboard.press('Alt+v');
    await expect(page.getByRole('menuitemradio', { name: 'Scientific' })).toHaveCount(0);
});

test('a dismissing press that never becomes a click does not eat a later keyboard click', async ({ page }) => {
    await calc(page).getByRole('menuitem', { name: 'View' }).click();
    await expect(page.getByRole('menuitemradio', { name: 'Scientific' })).toBeVisible();
    const seven = calc(page).getByRole('button', { name: '7', exact: true });
    // A touch on the 7 that the browser cancels (a scroll took it over, say): no click follows.
    await seven.evaluate((b) => {
        const at = b.getBoundingClientRect();
        const init = { bubbles: true, cancelable: true, composed: true, pointerId: 7, pointerType: 'touch', clientX: at.x + 5, clientY: at.y + 5 };
        b.dispatchEvent(new PointerEvent('pointerdown', init));
        b.dispatchEvent(new PointerEvent('pointercancel', init));
    });
    await expect(page.getByRole('menuitemradio', { name: 'Scientific' })).toHaveCount(0);
    await expect(display(page)).toHaveText('0');
    await seven.focus();
    await page.keyboard.press('Space');
    await expect(display(page)).toHaveText('7');
});

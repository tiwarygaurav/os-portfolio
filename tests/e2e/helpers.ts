import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Shared steps for driving the desktop. Everything goes through the UI a visitor uses — the boot
 * gate, the login tile, Start > Run — so a test that passes proves the real route works.
 */

/**
 * Get past the boot and log in. Works with or without a click-to-boot gate: some builds need a
 * gesture before the boot (for audio), others take it at the logon screen instead.
 */
export async function bootAndLogin(page: Page): Promise<void> {
    await page.goto('/');
    const gate = page.getByRole('button', { name: /^Start / });
    const tile = page.locator('[data-logon-user], div.cursor-pointer:has(img[alt="User"])').first();
    await gate.or(tile).first().waitFor({ timeout: 15_000 });
    if (await gate.isVisible()) await gate.click();
    await tile.waitFor({ timeout: 15_000 });
    await tile.click();
    await expect(page.getByText('start', { exact: true }).first()).toBeVisible({ timeout: 15_000 });
}

/** A window's outer frame, found by its exact title-bar text. */
export function win(page: Page, title: string): Locator {
    return page
        .locator('[data-window], div.flex.flex-col.shadow-2xl')
        .filter({ has: page.locator(`span:text-is("${title}")`) })
        .first();
}

export async function openFromDesktop(page: Page, appId: string): Promise<void> {
    await page.locator(`[data-desktop-icon="${appId}"]`).first().dblclick();
}

/** Start > Run..., type, Enter — the route that always works, whatever is on screen. */
export async function run(page: Page, input: string): Promise<void> {
    await page.getByText('start', { exact: true }).first().click();
    await page.getByRole('button', { name: 'Run...' }).click();
    await page.locator('#run-input').fill(input);
    await page.locator('#run-input').press('Enter');
}

/** Type a command into the open Command Prompt. */
export async function shell(page: Page, command: string): Promise<void> {
    const input = page.locator('#shell-input');
    await input.fill(command);
    await input.press('Enter');
}

export async function terminalText(page: Page): Promise<string> {
    return (await win(page, 'Command Prompt').innerText()).replace(/\r/g, '');
}

/** Window frames currently in the DOM (minimised ones included — they are hidden, not unmounted). */
export function windows(page: Page): Locator {
    return page.locator('[data-window], div.flex.flex-col.shadow-2xl');
}

/**
 * A window's bounding box once its open animation has finished. Windows scale in from 0.92, so
 * a box read immediately after opening is ~5% small; this waits until two reads agree.
 */
export async function settledBox(locator: Locator): Promise<{ x: number; y: number; width: number; height: number }> {
    let prev = await locator.boundingBox();
    for (let i = 0; i < 40; i++) {
        await locator.page().waitForTimeout(50);
        const next = await locator.boundingBox();
        if (prev && next && prev.width === next.width && prev.height === next.height && prev.x === next.x) return next;
        prev = next;
    }
    throw new Error('window never settled');
}

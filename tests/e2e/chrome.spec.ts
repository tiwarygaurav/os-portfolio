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

test('choosing a menu item never moves focus into the menu', async ({ page }) => {
    // Any focus inside a menu, at any moment, is recorded: a fading menu is aria-hidden, and focus
    // inside it is hidden from a screen reader, which Chrome refuses and logs.
    await page.evaluate(() => {
        const w = window as unknown as { __menuFocus: number };
        w.__menuFocus = 0;
        document.addEventListener('focusin', (e) => {
            if ((e.target as Element).closest?.('[data-xp-menu]')) w.__menuFocus++;
        }, true);
    });
    await desktopMenu(page);
    await page.getByRole('menuitem', { name: 'Refresh' }).click();
    await expect(page.locator('[data-xp-menu]')).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { __menuFocus: number }).__menuFocus)).toBe(0);
});

test('choosing from a submenu with the mouse leaves the keyboard with the window', async ({ page }) => {
    await run(page, 'explorer');
    const w = win(page, 'Windows Explorer');
    await w.locator('button[data-name="about.md"]').click();
    const area = (await w.locator('ul').locator('xpath=..').boundingBox())!;
    await page.mouse.click(area.x + area.width - 12, area.y + area.height - 12, { button: 'right' });
    await page.getByRole('menuitem', { name: 'View' }).hover();
    // The pointer goes into the submenu to choose: it must not take focus out of the list with it...
    await page.getByRole('menuitemcheckbox', { name: 'List', exact: true }).hover();
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => !!document.activeElement?.closest('[data-window]'))).toBe(true);
    // ...nor after choosing.
    await page.getByRole('menuitemcheckbox', { name: 'List', exact: true }).click();
    await expect(page.locator('[data-xp-menu]')).toHaveCount(0);
    expect(await page.evaluate(() => !!document.activeElement?.closest('[data-window]'))).toBe(true);
});

test('a menu driven by keys hands focus back where it was when it closes', async ({ page }) => {
    await run(page, 'explorer');
    const w = win(page, 'Windows Explorer');
    const about = w.locator('button[data-name="about.md"]');
    await about.click();
    await page.evaluate(() => {
        const g = window as unknown as { __hiddenOverFocus: number };
        g.__hiddenOverFocus = 0;
        new MutationObserver((records) => {
            for (const r of records) {
                const el = r.target as Element;
                if (el.getAttribute('aria-hidden') === 'true' && el.contains(document.activeElement)) g.__hiddenOverFocus++;
            }
        }).observe(document.body, { attributes: true, attributeFilter: ['aria-hidden'], subtree: true });
    });
    await about.click({ button: 'right' });
    await page.keyboard.press('ArrowDown');
    await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('[data-xp-menu]'))).toBe(true);
    // Escape closes it without choosing: focus returns to the file it came from, before the fade.
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-xp-menu]')).toHaveCount(0);
    await expect(about).toBeFocused();
    expect(await page.evaluate(() => (window as unknown as { __hiddenOverFocus: number }).__hiddenOverFocus)).toBe(0);
});

const focusedText = (page: Page) => page.evaluate(() => document.activeElement?.textContent?.trim() ?? null);

test('backing out of a submenu the keys drove lands on the item that opened it, and Escape then returns to the list', async ({ page }) => {
    await run(page, 'explorer');
    const w = win(page, 'Windows Explorer');
    const about = w.locator('button[data-name="about.md"]');
    await about.click();
    const area = (await w.locator('ul').locator('xpath=..').boundingBox())!;
    await page.mouse.click(area.x + area.width - 12, area.y + area.height - 12, { button: 'right' });
    // The pointer opens View's submenu and goes into it; then a key takes focus into the submenu.
    await page.getByRole('menuitem', { name: 'View' }).hover();
    await page.getByRole('menuitemcheckbox', { name: 'List', exact: true }).hover();
    await page.keyboard.press('ArrowDown');
    await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('[data-xp-menu] [data-xp-menu], [data-xp-menu] .xp-menu .xp-menu'))).toBe(true);
    // Escape backs out of the submenu only: the keys now drive the parent, on View, as in XP.
    await page.keyboard.press('Escape');
    await expect.poll(() => focusedText(page)).toBe('View');
    // A second Escape closes the menu, and the list it was opened over has the keyboard again.
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-xp-menu]')).toHaveCount(0);
    expect(await page.evaluate(() => !!document.activeElement?.closest('[data-window]'))).toBe(true);
});

test('a submenu the keys drove, closed by the pointer moving on, does not strand focus', async ({ page }) => {
    await run(page, 'explorer');
    const w = win(page, 'Windows Explorer');
    const about = w.locator('button[data-name="about.md"]');
    await about.click();
    const area = (await w.locator('ul').locator('xpath=..').boundingBox())!;
    await page.mouse.click(area.x + area.width - 12, area.y + area.height - 12, { button: 'right' });
    // The pointer opens View's submenu and goes into it; then a key takes focus into the submenu.
    await page.getByRole('menuitem', { name: 'View' }).hover();
    await page.getByRole('menuitemcheckbox', { name: 'List', exact: true }).hover();
    await page.keyboard.press('ArrowDown');
    await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('[data-xp-menu] [data-xp-menu], [data-xp-menu] .xp-menu .xp-menu'))).toBe(true);
    // The pointer moves on to another item of the parent, and the submenu closes under it.
    await page.getByRole('menuitem', { name: 'Properties' }).hover();
    await expect(page.locator('[data-xp-menu] .xp-menu .xp-menu')).toHaveCount(0);
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false);
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-xp-menu]')).toHaveCount(0);
    expect(await page.evaluate(() => !!document.activeElement?.closest('[data-window]'))).toBe(true);
});

test('in a submenu the keys opened, pointing at an item moves focus to it: one selection', async ({ page }) => {
    await desktopMenu(page);
    await page.keyboard.press('ArrowDown'); // Arrange Icons By
    await page.keyboard.press('ArrowRight'); // its submenu, on Name
    await expect.poll(() => focusedText(page)).toBe('Name');
    await page.getByRole('menuitem', { name: 'Type', exact: true }).hover();
    // The item lit by the pointer is the one a screen reader reads, and the one Enter chooses.
    await expect.poll(() => focusedText(page)).toBe('Type');
});

test('the keys in a menu opened over a rename box leave focus in the folder, not on nothing', async ({ page }) => {
    await run(page, 'explorer');
    const w = win(page, 'Windows Explorer');
    const menuItem = (label: string) => page.getByRole('menuitem', { name: new RegExp(`^${label}`) });
    await w.getByRole('button', { name: 'My Documents', exact: true }).first().click();
    await w.getByText('This folder is empty.').click({ button: 'right' });
    await menuItem('New').click();
    await menuItem('Folder').click();
    await expect(page.locator('[data-xp-menu]')).toHaveCount(0);
    const box = w.getByLabel('New name for New Folder');
    await expect(box).toBeFocused();
    await page.keyboard.type('Plans');
    await box.click({ button: 'right' });
    // A key takes focus into the menu, which ends the rename (the box commits and goes)...
    await page.keyboard.press('ArrowDown');
    await expect(w.locator('button[data-name="Plans"]')).toBeVisible();
    // ...so on Escape, focus returns to the folder around it rather than to nothing.
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-xp-menu]')).toHaveCount(0);
    expect(await page.evaluate(() => !!document.activeElement?.closest('[data-window]'))).toBe(true);
});

test('Ctrl+Shift+Esc with a context menu open still opens Task Manager', async ({ page }) => {
    await desktopMenu(page);
    await page.keyboard.press('Control+Shift+Escape');
    await expect(win(page, 'Windows Task Manager')).toBeVisible();
});

test('a submenu used from the keyboard takes focus, and gives it up before it fades', async ({ page }) => {
    await desktopMenu(page);
    // Record aria-hidden landing on a menu that still holds focus: Chrome blocks and logs that.
    await page.evaluate(() => {
        const w = window as unknown as { __hiddenOverFocus: number };
        w.__hiddenOverFocus = 0;
        new MutationObserver((records) => {
            for (const r of records) {
                const el = r.target as Element;
                if (el.getAttribute('aria-hidden') === 'true' && el.contains(document.activeElement)) w.__hiddenOverFocus++;
            }
        }).observe(document.body, { attributes: true, attributeFilter: ['aria-hidden'], subtree: true });
    });
    await page.keyboard.press('ArrowDown'); // Arrange Icons By
    await page.keyboard.press('ArrowRight'); // its submenu, which takes the keyboard
    // Real focus is on the submenu's selected item, so a screen reader announces it...
    await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('[data-xp-menu]'))).toBe(true);
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-xp-menu]')).toHaveCount(0);
    // ...and it is let go before the menu fades out under aria-hidden.
    expect(await page.evaluate(() => (window as unknown as { __hiddenOverFocus: number }).__hiddenOverFocus)).toBe(0);
});

test('a press in a menu ends a rename in progress, which keeps the new name', async ({ page }) => {
    await run(page, 'explorer');
    const w = win(page, 'Windows Explorer');
    const item = (name: string) => w.locator(`button[data-name="${name}"]`);
    const menuItem = (label: string) => page.getByRole('menuitem', { name: new RegExp(`^${label}`) });
    await w.getByRole('button', { name: 'My Documents', exact: true }).first().click();
    await w.getByText('This folder is empty.').click({ button: 'right' });
    await menuItem('New').click();
    await menuItem('Folder').click();
    await expect(page.locator('[data-xp-menu]')).toHaveCount(0);
    const box = w.getByLabel('New name for New Folder');
    await expect(box).toBeFocused();
    await page.keyboard.type('Plans');
    // Still naming it, right-click inside the box (the folder's menu opens and the box keeps focus)
    // and choose Arrange Icons By > Name, which moves no focus of its own: the press on the menu must
    // end the rename, as a press anywhere else would, rather than drop the typed name.
    await box.click({ button: 'right' });
    await menuItem('Arrange Icons By').click();
    await page.getByRole('menuitemcheckbox', { name: 'Name', exact: true }).click();
    await expect(item('Plans')).toBeVisible();
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

test.describe('the Start menu from the keyboard', () => {
    /** Focus the Start button and press Enter: a click with no count, as a keyboard makes. */
    const openStart = async (page: Page) => {
        await page.locator('.xp-start-button').focus();
        await page.keyboard.press('Enter');
        await expect(page.locator('.xp-startmenu')).toBeVisible();
    };
    /** The flyout panels (All Programs, its groups, Connect To): menus inside a portaled ContextMenu. */
    const flyouts = (page: Page) => page.locator('[data-xp-menu] [role="menu"]');
    const focused = (page: Page) =>
        page.evaluate(() => {
            const el = document.activeElement as HTMLElement | null;
            return { label: el?.dataset.label ?? null, side: el?.dataset.sm ?? null };
        });

    test('opens on its first item; the arrows cross the sides and reach the footer; Escape returns to Start', async ({ page }) => {
        await openStart(page);
        await expect.poll(async () => (await focused(page)).label).toBe('My Projects');
        // XP's underlined letters show once the keyboard is in use.
        await expect(page.locator('.xp-startmenu-footer-btn u')).toHaveCount(2);

        await page.keyboard.press('ArrowDown');
        expect((await focused(page)).label).toBe('Contact Me');
        await page.keyboard.press('ArrowRight');
        expect((await focused(page)).side).toBe('right');
        await page.keyboard.press('ArrowLeft');
        expect((await focused(page)).side).toBe('left');

        // Up from the top of the left side is its footer button, Log Off; Right is Turn Off Computer.
        await page.keyboard.press('Home');
        await page.keyboard.press('ArrowUp');
        expect((await focused(page)).label).toBe('Log Off');
        await page.keyboard.press('ArrowRight');
        expect((await focused(page)).label).toBe('Turn Off Computer');

        await page.keyboard.press('Escape');
        await expect(page.locator('.xp-startmenu')).toHaveCount(0);
        expect(await page.evaluate(() => document.activeElement?.classList.contains('xp-start-button'))).toBe(true);
    });

    test('opened with the mouse, it hides the underlines', async ({ page }) => {
        await page.getByText('start', { exact: true }).first().click();
        await expect(page.locator('.xp-startmenu')).toBeVisible();
        await expect(page.locator('.xp-startmenu-footer-btn u')).toHaveCount(0);
    });

    test('P opens All Programs on its first item; Left closes it and goes back to All Programs', async ({ page }) => {
        await openStart(page);
        await page.keyboard.press('p');
        await expect(flyouts(page)).toHaveCount(1);
        await expect(flyouts(page).locator('.xp-menu-item.is-active')).toHaveCount(1);
        // Real focus follows the selection into the flyout, so a screen reader announces it.
        await expect.poll(() => page.evaluate(() => (document.activeElement as HTMLElement | null)?.classList.contains('is-active') && !!document.activeElement?.closest('[data-xp-menu]'))).toBe(true);

        await page.keyboard.press('ArrowLeft');
        await expect(page.locator('[data-xp-menu]')).toHaveCount(0);
        await expect(page.locator('.xp-startmenu')).toBeVisible();
        expect((await focused(page)).label).toBe('All Programs');
    });

    test('a program starts from All Programs without the mouse', async ({ page }) => {
        await openStart(page);
        await page.keyboard.press('p');
        await expect(flyouts(page)).toHaveCount(1);
        // Into the first group, then its first program.
        await page.keyboard.press('ArrowRight');
        await expect(flyouts(page)).toHaveCount(2);
        // Record aria-hidden landing on a menu that still holds focus: Chrome blocks and logs that.
        await page.evaluate(() => {
            const w = window as unknown as { __hiddenOverFocus: number };
            w.__hiddenOverFocus = 0;
            new MutationObserver((records) => {
                for (const r of records) {
                    const el = r.target as Element;
                    if (el.getAttribute('aria-hidden') === 'true' && el.contains(document.activeElement)) w.__hiddenOverFocus++;
                }
            }).observe(document.body, { attributes: true, attributeFilter: ['aria-hidden'], subtree: true });
        });
        await page.keyboard.press('Enter');
        await expect(windows(page)).toHaveCount(1);
        await expect(page.locator('.xp-startmenu')).toHaveCount(0);
        expect(await page.evaluate(() => (window as unknown as { __hiddenOverFocus: number }).__hiddenOverFocus)).toBe(0);
    });

    test('R opens Run: an underlined letter answers before Resume.pdf, which only begins with it', async ({ page }) => {
        await openStart(page);
        await page.keyboard.press('r');
        await expect(page.locator('#run-input')).toBeVisible();
    });

    test('Connect To opens from the keyboard, and Escape closes only its flyout', async ({ page }) => {
        await openStart(page);
        await page.keyboard.press('ArrowRight');
        await page.keyboard.press('End'); // Run...
        await page.keyboard.press('ArrowUp'); // Connect To
        expect((await focused(page)).label).toBe('Connect To');
        await page.keyboard.press('ArrowRight');
        await expect(page.locator('[data-xp-menu] [role="menu"]')).toHaveCount(1);
        await page.keyboard.press('Escape');
        await expect(page.locator('[data-xp-menu]')).toHaveCount(0);
        await expect(page.locator('.xp-startmenu')).toBeVisible();
        expect((await focused(page)).label).toBe('Connect To');
    });

    test('Tab out of the menu closes it, and its letters stop working', async ({ page }) => {
        await run(page, 'notepad');
        await expect(win(page, 'Untitled - Notepad')).toBeVisible();
        await openStart(page);
        for (let i = 0; i < 20 && (await page.locator('.xp-startmenu').count()) > 0; i++) await page.keyboard.press('Shift+Tab');
        await expect(page.locator('.xp-startmenu')).toHaveCount(0);
        await page.keyboard.press('a');
        await expect(win(page, 'About Me')).toHaveCount(0);
    });

    test('Enter on the Start button and Delete in the menu never reach a selected desktop icon', async ({ page }) => {
        await page.locator('[data-desktop-icon="contact"]').click();
        await openStart(page);
        await expect(windows(page)).toHaveCount(0);
        await page.keyboard.press('Delete');
        await expect(page.getByRole('dialog')).toHaveCount(0);
        await page.keyboard.press('Escape');
        await page.keyboard.press('Delete');
        await expect(page.getByRole('dialog')).toHaveCount(0);
    });

    test('a held U opens Turn Off Computer but does not answer it', async ({ page }) => {
        await openStart(page);
        await page.keyboard.down('u');
        await expect(page.locator('.xp-exit')).toBeVisible();
        await page.keyboard.down('u'); // the key repeating
        await page.keyboard.down('u');
        await page.keyboard.up('u');
        await page.waitForTimeout(300);
        await expect(page.getByText(/is shutting down\.\.\./)).toHaveCount(0);
        // A fresh press does.
        await page.keyboard.press('u');
        await expect(page.getByText(/is shutting down\.\.\./)).toBeVisible();
    });

    test('a held Enter on the Start button opens the menu but launches nothing', async ({ page }) => {
        await page.locator('.xp-start-button').focus();
        await page.keyboard.down('Enter');
        await expect(page.locator('.xp-startmenu')).toBeVisible();
        await page.keyboard.down('Enter'); // the key repeating, now on the first item
        await page.keyboard.down('Enter');
        await page.keyboard.up('Enter');
        await page.waitForTimeout(300);
        await expect(windows(page)).toHaveCount(0);
        // A fresh Enter does launch it.
        await page.keyboard.press('Enter');
        await expect(windows(page)).toHaveCount(1);
    });

    test('a held Enter on All Programs opens it but chooses nothing in it', async ({ page }) => {
        await openStart(page);
        await page.keyboard.press('End'); // All Programs, at the foot of the left side
        expect((await focused(page)).label).toBe('All Programs');
        await page.keyboard.down('Enter');
        await expect(flyouts(page)).toHaveCount(1);
        await page.keyboard.down('Enter'); // repeating: into a group...
        await page.keyboard.down('Enter'); // ...and on to a program
        await page.keyboard.up('Enter');
        await page.waitForTimeout(300);
        await expect(windows(page)).toHaveCount(0);
    });

    test('Escape closes the Start menu and nothing else: the desktop keeps its selection', async ({ page }) => {
        const contact = page.locator('[data-desktop-icon="contact"]');
        await contact.click();
        await expect(contact).toHaveAttribute('aria-pressed', 'true');
        await page.getByText('start', { exact: true }).first().click();
        await page.keyboard.press('Escape');
        await expect(page.locator('.xp-startmenu')).toHaveCount(0);
        await expect(contact).toHaveAttribute('aria-pressed', 'true');
    });

    test('pointing at a Start item while a keyboard-opened flyout has focus makes that item the one selection', async ({ page }) => {
        await openStart(page);
        await page.keyboard.press('p');
        await expect(flyouts(page)).toHaveCount(1);
        await page.getByRole('menuitem', { name: 'My Documents' }).hover();
        await expect(page.locator('[data-xp-menu]')).toHaveCount(0);
        expect((await focused(page)).label).toBe('My Documents');
    });

    test('Ctrl+Shift+Esc with the Start menu open still opens Task Manager', async ({ page }) => {
        await page.getByText('start', { exact: true }).first().click();
        await expect(page.locator('.xp-startmenu')).toBeVisible();
        await page.keyboard.press('Control+Shift+Escape');
        await expect(win(page, 'Windows Task Manager')).toBeVisible();
    });

    test('Start, U, U with unsaved work asks about it first', async ({ page }) => {
        await run(page, 'notepad');
        await win(page, 'Untitled - Notepad').locator('textarea').fill('unsaved');
        await openStart(page);
        await page.keyboard.press('u');
        await page.keyboard.press('u');
        await expect(page.getByRole('dialog')).toContainText(/save the changes/i);
        await expect(page.getByText(/is shutting down\.\.\./)).toHaveCount(0);
    });

    test('Start, U, U turns the computer off, as it did in XP', async ({ page }) => {
        await openStart(page);
        await page.keyboard.press('u');
        await expect(page.locator('.xp-exit')).toBeVisible();
        await page.keyboard.press('u');
        await expect(page.getByText(/is shutting down\.\.\./)).toBeVisible();
    });
});

import { useSystemStore } from '@/store/useSystemStore';
import { playSound } from '@/utils/sound';
import type { DialogRequest } from '@/store/useSystemStore';

/**
 * In-world replacements for `alert()` and `confirm()`.
 *
 * Callable from anywhere, including outside React, because they read the store imperatively —
 * which is what makes them a drop-in for the native functions they replace. The only behavioural
 * difference is that both return a promise: `alert()` blocked the thread, and nothing here does.
 *
 * See `components/os/Dialog.tsx` for why native dialogs had to go.
 */

const open = (request: Omit<DialogRequest, 'id'>) =>
    useSystemStore.getState().actions.openDialog(request);

const asBody = (body: string | string[]) => (Array.isArray(body) ? body : body.split('\n'));

/** A message box with a single OK. Resolves when it is dismissed. */
export async function xpAlert(
    title: string,
    body: string | string[],
    icon: DialogRequest['icon'] = 'info',
): Promise<void> {
    playSound(icon === 'error' ? 'error' : 'click');
    await open({
        title,
        body: asBody(body),
        icon,
        buttons: [{ id: 'ok', label: 'OK', primary: true, cancel: true }],
    });
}

/** OK / Cancel. Resolves true only if the visitor chose the confirming button. */
export async function xpConfirm(
    title: string,
    body: string | string[],
    options: { confirmLabel?: string; cancelLabel?: string; icon?: DialogRequest['icon'] } = {},
): Promise<boolean> {
    const { confirmLabel = 'Yes', cancelLabel = 'No', icon = 'question' } = options;
    playSound('click');
    const answer = await open({
        title,
        body: asBody(body),
        icon,
        buttons: [
            { id: 'confirm', label: confirmLabel, primary: true },
            { id: 'cancel', label: cancelLabel, cancel: true },
        ],
    });
    return answer === 'confirm';
}

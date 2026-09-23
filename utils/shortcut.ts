/**
 * The name a shortcut to an app shows.
 *
 * XP titled a document window "<document> - <program>" ("Untitled - Notepad"), but its desktop
 * icons and Start menu entries named the program alone ("Notepad"). Window title bars and task
 * buttons keep the full title; everything that launches the app uses this.
 */
export const shortcutName = (title: string): string => {
    const parts = title.split(' - ');
    return parts[parts.length - 1] || title;
};

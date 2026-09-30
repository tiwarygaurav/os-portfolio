/**
 * A label with its access key underlined, as XP drew it. `show` is XP's keyboard cue: menus hid
 * the underlines until the keyboard was in use, while a dialog like Turn Off Computer always showed
 * them.
 */
export default function AccessLabel({ text, accessKey, show = true }: { text: string; accessKey: string; show?: boolean }) {
    const i = text.toLowerCase().indexOf(accessKey.toLowerCase());
    if (!show || i < 0) return <span>{text}</span>;
    return (
        <span>
            {text.slice(0, i)}
            <u>{text[i]}</u>
            {text.slice(i + 1)}
        </span>
    );
}

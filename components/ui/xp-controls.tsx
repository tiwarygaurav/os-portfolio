"use client";

import { forwardRef, useId, type ButtonHTMLAttributes, type ReactNode } from 'react';

/**
 * XP form controls for app windows and in-app dialogs.
 *
 * The drawing lives in `app/luna.css`, the one stylesheet that draws XP controls for the whole
 * desktop — system message boxes included — so an app's dialog cannot drift from a system one.
 * These components only supply the markup that stylesheet expects.
 *
 * Every control is a real form element, so keyboard use, focus and screen readers behave the way
 * the browser already makes them behave.
 */

interface XPButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    /** The default button of a dialog: Enter chooses it, and XP gave it a permanent blue rim. */
    isDefault?: boolean;
}

export const XPButton = forwardRef<HTMLButtonElement, XPButtonProps>(function XPButton(
    { className = '', type = 'button', isDefault = false, ...rest },
    ref,
) {
    return <button ref={ref} type={type} className={`xp-button${isDefault ? ' is-default' : ''} ${className}`} {...rest} />;
});

/** Text input and select faces. */
export const XP_INPUT_CLASS = 'xp-input';
export const XP_SELECT_CLASS = 'xp-select';

/** XP's group box: a light rounded frame with its caption in Luna blue. */
export function GroupBox({ label, children, className = '' }: { label: ReactNode; children: ReactNode; className?: string }) {
    return (
        <fieldset className={`xp-groupbox min-w-0 ${className}`}>
            <legend>{label}</legend>
            {children}
        </fieldset>
    );
}

interface ToggleProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
    label: ReactNode;
    disabled?: boolean;
    className?: string;
    /** Radios sharing a name form one group, so arrow keys move within it. */
    name?: string;
}

function Toggle({ type, checked, onChange, label, disabled, name, className = '' }: ToggleProps & { type: 'checkbox' | 'radio' }) {
    const id = useId();
    return (
        <span className={`inline-flex items-center gap-1.5 ${className}`}>
            <input
                id={id}
                type={type}
                name={name}
                className={type === 'checkbox' ? 'xp-checkbox' : 'xp-radio'}
                checked={checked}
                disabled={disabled}
                // A radio reports only being chosen; a checkbox reports both states.
                onChange={(e) => (type === 'checkbox' ? onChange(e.target.checked) : e.target.checked && onChange(true))}
            />
            <label htmlFor={id} className={`cursor-default select-none ${disabled ? 'text-[#aca899]' : ''}`}>
                {label}
            </label>
        </span>
    );
}

export const XPCheckbox = (props: ToggleProps) => <Toggle type="checkbox" {...props} />;
export const XPRadio = (props: ToggleProps) => <Toggle type="radio" {...props} />;

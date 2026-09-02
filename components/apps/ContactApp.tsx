"use client";

import { useState } from 'react';
import { Check, Copy, Mail, Send, AlertCircle } from 'lucide-react';
import { LINKS, PROFILE } from '@/content';

/**
 * Contact — a real send, or nothing.
 *
 * The previous version ran `setTimeout(1500)` and then displayed "Sent!". Nothing was ever
 * transmitted, so anyone who wrote a message believed it had been delivered. That is the worst
 * bug the project had: it cost the owner real opportunities silently.
 *
 * Approach chosen: `mailto:`. It is honest (the message is genuinely handed to the visitor's mail
 * client), it needs no backend, no third-party form service, no API keys, and no spam handling —
 * and this site has no other server-side requirement, so adding one purely for a contact form
 * would be architecture for its own sake. The trade-off is that we cannot confirm delivery, so
 * the UI never claims to: it says the draft was handed off, and offers a copy-to-clipboard
 * fallback for anyone without a configured mail client.
 *
 * If a server-side endpoint is added later, only `submit()` changes.
 */

type Status =
    | { kind: 'idle' }
    | { kind: 'handed-off' }
    | { kind: 'copied' }
    | { kind: 'error'; message: string };

interface Errors {
    name?: string;
    from?: string;
    subject?: string;
    message?: string;
}

const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

export default function ContactApp() {
    const [form, setForm] = useState({ name: '', from: '', subject: '', message: '' });
    const [errors, setErrors] = useState<Errors>({});
    const [status, setStatus] = useState<Status>({ kind: 'idle' });

    const set = (key: keyof typeof form, value: string) => {
        setForm((f) => ({ ...f, [key]: value }));
        setErrors((e) => ({ ...e, [key]: undefined }));
        setStatus({ kind: 'idle' });
    };

    const validate = (): Errors => {
        const next: Errors = {};
        if (!form.name.trim()) next.name = 'Please add your name.';
        if (!form.from.trim()) next.from = 'Please add your email so a reply is possible.';
        else if (!isEmail(form.from.trim())) next.from = 'That does not look like an email address.';
        if (!form.subject.trim()) next.subject = 'Please add a subject.';
        if (form.message.trim().length < 10) next.message = 'Please write at least a sentence.';
        return next;
    };

    const composed = () =>
        `${form.message.trim()}\n\n—\n${form.name.trim()}\n${form.from.trim()}`;

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        const found = validate();
        setErrors(found);
        if (Object.keys(found).length > 0) {
            setStatus({ kind: 'error', message: 'Some fields need attention.' });
            return;
        }

        const url =
            `mailto:${PROFILE.email}` +
            `?subject=${encodeURIComponent(form.subject.trim())}` +
            `&body=${encodeURIComponent(composed())}`;

        try {
            window.location.href = url;
            // The browser has taken the draft. Whether it reaches a mail client is outside our
            // knowledge, so the wording stops short of claiming delivery.
            setStatus({ kind: 'handed-off' });
        } catch {
            setStatus({
                kind: 'error',
                message: 'Could not open your mail client. Copy the message instead.',
            });
        }
    };

    const copyAll = async () => {
        const text = `To: ${PROFILE.email}\nSubject: ${form.subject}\n\n${composed()}`;
        try {
            await navigator.clipboard.writeText(text);
            setStatus({ kind: 'copied' });
        } catch {
            setStatus({ kind: 'error', message: 'Clipboard access was blocked by the browser.' });
        }
    };

    return (
        <form onSubmit={submit} className="flex h-full flex-col bg-[#f4f4f0] font-sans" noValidate>
            <div className="shrink-0 border-b border-gray-300 bg-[#ece9d8] px-3 py-2">
                <div className="flex items-center gap-2 text-sm text-gray-800">
                    <Mail size={15} className="text-blue-700" aria-hidden />
                    <span className="font-semibold">New message to {PROFILE.name}</span>
                </div>
                <p className="mt-0.5 text-[11px] text-gray-600">
                    Opens in your own mail client — this window does not send mail itself.
                </p>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto p-3">
                <Field label="To">
                    <output className="block border border-gray-300 bg-gray-100 px-2 py-1 text-sm text-gray-700">
                        {PROFILE.email}
                    </output>
                </Field>

                <Field label="Your name" htmlFor="c-name" error={errors.name}>
                    <input
                        id="c-name"
                        value={form.name}
                        onChange={(e) => set('name', e.target.value)}
                        aria-invalid={!!errors.name}
                        className={inputClass(!!errors.name)}
                        autoComplete="name"
                    />
                </Field>

                <Field label="Your email" htmlFor="c-from" error={errors.from}>
                    <input
                        id="c-from"
                        type="email"
                        value={form.from}
                        onChange={(e) => set('from', e.target.value)}
                        aria-invalid={!!errors.from}
                        className={inputClass(!!errors.from)}
                        autoComplete="email"
                    />
                </Field>

                <Field label="Subject" htmlFor="c-subject" error={errors.subject}>
                    <input
                        id="c-subject"
                        value={form.subject}
                        onChange={(e) => set('subject', e.target.value)}
                        aria-invalid={!!errors.subject}
                        className={inputClass(!!errors.subject)}
                    />
                </Field>

                <Field label="Message" htmlFor="c-message" error={errors.message}>
                    <textarea
                        id="c-message"
                        value={form.message}
                        onChange={(e) => set('message', e.target.value)}
                        rows={7}
                        aria-invalid={!!errors.message}
                        className={`${inputClass(!!errors.message)} resize-none font-sans`}
                    />
                </Field>

                <div className="border-t border-gray-200 pt-3">
                    <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                        Or reach him directly
                    </p>
                    <div className="flex flex-wrap gap-3 text-xs">
                        {LINKS.filter((l) => l.known).map((l) => (
                            <a
                                key={l.url}
                                href={l.url}
                                target={l.url.startsWith('mailto:') ? undefined : '_blank'}
                                rel="noopener noreferrer"
                                className="text-blue-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                            >
                                {l.label}
                            </a>
                        ))}
                    </div>
                </div>
            </div>

            <div className="shrink-0 space-y-2 border-t border-gray-300 bg-[#ece9d8] p-3">
                <StatusLine status={status} />
                <div className="flex flex-wrap gap-2">
                    <button
                        type="submit"
                        className="flex items-center gap-2 rounded border border-gray-400 bg-gradient-to-b from-white to-gray-200 px-3 py-1.5 text-sm text-black hover:to-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                        <Send size={14} className="text-blue-700" aria-hidden />
                        Open in mail client
                    </button>
                    <button
                        type="button"
                        onClick={copyAll}
                        className="flex items-center gap-2 rounded border border-gray-400 bg-gradient-to-b from-white to-gray-200 px-3 py-1.5 text-sm text-black hover:to-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                        <Copy size={14} className="text-gray-600" aria-hidden />
                        Copy message
                    </button>
                </div>
            </div>
        </form>
    );
}

function inputClass(hasError: boolean) {
    return `w-full border px-2 py-1 text-sm text-black outline-none focus:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500 ${
        hasError ? 'border-red-500 bg-red-50' : 'border-gray-300 bg-white'
    }`;
}

function Field({
    label,
    htmlFor,
    error,
    children,
}: {
    label: string;
    htmlFor?: string;
    error?: string;
    children: React.ReactNode;
}) {
    return (
        <div>
            <label htmlFor={htmlFor} className="mb-1 block text-xs font-semibold text-gray-600">
                {label}
            </label>
            {children}
            {error && (
                <p role="alert" className="mt-1 text-[11px] text-red-700">
                    {error}
                </p>
            )}
        </div>
    );
}

function StatusLine({ status }: { status: Status }) {
    if (status.kind === 'idle') {
        return <p className="text-[11px] text-gray-500">Ready.</p>;
    }
    if (status.kind === 'handed-off') {
        return (
            <p className="flex items-center gap-1.5 text-[11px] text-green-800">
                <Check size={13} aria-hidden />
                Draft handed to your mail client. It is not sent until you send it there.
            </p>
        );
    }
    if (status.kind === 'copied') {
        return (
            <p className="flex items-center gap-1.5 text-[11px] text-green-800">
                <Check size={13} aria-hidden />
                Message copied to your clipboard.
            </p>
        );
    }
    return (
        <p role="alert" className="flex items-center gap-1.5 text-[11px] text-red-700">
            <AlertCircle size={13} aria-hidden />
            {status.message}
        </p>
    );
}

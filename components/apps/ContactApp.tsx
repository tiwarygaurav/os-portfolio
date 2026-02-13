"use client";

import { Send, Paperclip, X, Minimize2, Maximize2 } from 'lucide-react';
import { useState } from 'react';

export default function ContactApp() {
    const [form, setForm] = useState({ to: 'gauravt.nic@gmail.com', subject: '', message: '' });
    const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setStatus('sending');
        setTimeout(() => {
            setStatus('sent');
            setTimeout(() => {
                setForm({ to: 'gauravt.nic@gmail.com', subject: '', message: '' });
                setStatus('idle');
            }, 2000);
        }, 1500);
    };

    return (
        <div className="h-full flex flex-col bg-gray-100 font-sans">

            {/* Email Header */}
            <div className="bg-gray-200 border-b border-gray-300 p-2 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                    <span className="w-16 text-right text-gray-500 text-sm">To:</span>
                    <input
                        type="text"
                        value={form.to}
                        readOnly
                        className="flex-1 border border-gray-300 px-2 py-0.5 text-sm bg-gray-50 text-gray-500 cursor-not-allowed"
                    />
                </div>
                <div className="flex items-center gap-2">
                    <span className="w-16 text-right text-gray-500 text-sm">Cc:</span>
                    <input
                        type="text"
                        className="flex-1 border border-gray-300 px-2 py-0.5 text-sm"
                    />
                </div>
                <div className="flex items-center gap-2">
                    <span className="w-16 text-right text-gray-500 text-sm">Subject:</span>
                    <input
                        type="text"
                        value={form.subject}
                        onChange={(e) => setForm({ ...form, subject: e.target.value })}
                        className="flex-1 border border-gray-300 px-2 py-0.5 text-sm focus:border-blue-500 outline-none"
                        placeholder="Project Inquiry"
                    />
                </div>
            </div>

            {/* Toolbar */}
            <div className="bg-gray-50 border-b border-gray-300 p-1 flex items-center gap-1">
                <button
                    onClick={handleSubmit}
                    disabled={status !== 'idle' || !form.subject}
                    className={`
              flex items-center gap-2 px-3 py-1 border border-gray-300 rounded shadow-sm text-sm
              ${status === 'idle' && form.subject
                            ? 'bg-gradient-to-b from-gray-50 to-gray-200 hover:bg-gray-100 active:bg-gray-300 text-black'
                            : 'bg-gray-100 text-gray-400 cursor-not-allowed'}
            `}
                >
                    <Send size={14} className={status === 'sent' ? 'text-green-600' : 'text-blue-600'} />
                    {status === 'idle' ? 'Send' : status === 'sending' ? 'Sending...' : 'Sent!'}
                </button>
                <button className="flex items-center gap-2 px-3 py-1 border border-gray-300 rounded shadow-sm bg-gradient-to-b from-gray-50 to-gray-200 hover:bg-gray-100 text-sm text-black">
                    <Paperclip size={14} className="text-gray-600" />
                    Attach
                </button>
            </div>

            {/* Message Body */}
            <textarea
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                className="flex-1 p-4 resize-none outline-none font-mono text-sm bg-white text-black"
                placeholder="Type your message here..."
            />

            {/* Footer Status */}
            <div className="h-6 bg-gray-100 border-t border-gray-300 flex items-center px-2 text-xs text-gray-500">
                {status === 'sent' ? 'Message sent successfully.' : 'Ready'}
            </div>

        </div>
    );
}

"use client";

import { useEffect, useState } from 'react';
import { AlertTriangle, Download, ExternalLink, FileText, Loader2, Printer } from 'lucide-react';
import {
    ACHIEVEMENTS,
    CERTIFICATIONS,
    EDUCATION,
    LINKS,
    PROFILE,
    PROJECTS,
    RESUME,
    ROLES,
    SKILL_GROUPS,
    isConfidential,
} from '@/content';

/**
 * Resume — two representations of the same person, both real.
 *
 * "Document" is generated live from `@/content`, so it is always current.
 * "PDF" embeds the owner's actual resume file, served from `public/resume/`.
 *
 * The previous version linked a PDF that did not exist in the repository, so the single most
 * important recruiter action returned a 404. The file now exists at a deterministic path, and
 * this component *verifies* it at runtime rather than assuming — if it ever goes missing, the
 * UI says so and falls back to the generated document instead of handing over a broken download.
 *
 * Also removed: a "Find..." box that searched nothing and a "1 / 1" page counter that counted
 * nothing.
 */

type PdfState = 'checking' | 'available' | 'missing';

export default function ResumeApp() {
    const [view, setView] = useState<'document' | 'pdf'>('document');
    const [pdf, setPdf] = useState<PdfState>('checking');

    // Verify the asset exists rather than trusting the path.
    useEffect(() => {
        let cancelled = false;
        fetch(RESUME.path, { method: 'HEAD' })
            .then((res) => {
                if (!cancelled) setPdf(res.ok ? 'available' : 'missing');
            })
            .catch(() => {
                if (!cancelled) setPdf('missing');
            });
        return () => {
            cancelled = true;
        };
    }, []);

    return (
        <div className="flex h-full flex-col bg-[#5a5a5a] font-sans">
            <div className="z-10 flex shrink-0 flex-wrap items-center gap-2 border-b border-gray-400 bg-[#ece9d8] px-2 py-1.5">
                <div className="flex overflow-hidden rounded-sm border border-gray-400">
                    <ToolTab active={view === 'document'} onClick={() => setView('document')}>
                        Document
                    </ToolTab>
                    <ToolTab
                        active={view === 'pdf'}
                        onClick={() => setView('pdf')}
                        disabled={pdf !== 'available'}
                        title={pdf === 'missing' ? 'The PDF file could not be found' : undefined}
                    >
                        PDF
                    </ToolTab>
                </div>

                <div className="mx-1 h-5 w-px bg-gray-400" />

                {pdf === 'available' ? (
                    <>
                        <a
                            href={RESUME.path}
                            download={RESUME.downloadName}
                            className="flex items-center gap-1.5 rounded border border-gray-400 bg-white/60 px-2 py-1 text-xs text-gray-800 hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                        >
                            <Download size={14} aria-hidden />
                            Download PDF
                        </a>
                        <a
                            href={RESUME.path}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 rounded border border-gray-400 bg-white/60 px-2 py-1 text-xs text-gray-800 hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                        >
                            <ExternalLink size={14} aria-hidden />
                            Open in new tab
                        </a>
                    </>
                ) : pdf === 'checking' ? (
                    <span className="flex items-center gap-1.5 px-2 py-1 text-xs text-gray-500">
                        <Loader2 size={14} className="animate-spin" aria-hidden />
                        Checking for the PDF…
                    </span>
                ) : (
                    <span className="flex items-center gap-1.5 px-2 py-1 text-xs text-amber-800">
                        <AlertTriangle size={14} aria-hidden />
                        PDF unavailable
                    </span>
                )}

                <button
                    onClick={() => window.print()}
                    className="ml-auto flex items-center gap-1.5 rounded border border-gray-400 bg-white/60 px-2 py-1 text-xs text-gray-800 hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                    <Printer size={14} aria-hidden />
                    Print
                </button>
            </div>

            {view === 'pdf' && pdf === 'available' ? (
                <div className="flex flex-1 flex-col overflow-hidden">
                    <p className="shrink-0 bg-[#fff8e1] px-3 py-1.5 text-[11px] leading-relaxed text-[#7a5c00]">
                        This PDF was generated in {RESUME.asOf}. {RESUME.staleness}
                    </p>
                    <object
                        data={RESUME.path}
                        type="application/pdf"
                        className="flex-1"
                        aria-label={`${PROFILE.name} resume PDF`}
                    >
                        {/* Browsers without an inline PDF viewer land here — a real link, not a dead frame. */}
                        <div className="flex h-full flex-col items-center justify-center gap-3 bg-[#5a5a5a] p-6 text-center text-sm text-white">
                            <FileText size={32} aria-hidden />
                            <p>Your browser can’t display PDFs inline.</p>
                            <a
                                href={RESUME.path}
                                download={RESUME.downloadName}
                                className="rounded border border-white/40 px-3 py-1.5 underline"
                            >
                                Download the resume instead
                            </a>
                        </div>
                    </object>
                </div>
            ) : (
                <div className="flex-1 overflow-y-auto p-6">
                    {pdf === 'missing' && (
                        <div className="mx-auto mb-4 flex max-w-[800px] items-start gap-2 rounded border border-amber-300 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
                            <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
                            <span>
                                The PDF file (<code className="font-mono">{RESUME.path}</code>) could not be
                                loaded, so the download is disabled rather than offered as a broken link. The
                                resume below is generated from live content and is complete.
                            </span>
                        </div>
                    )}
                    <GeneratedResume />
                </div>
            )}

            <div className="flex h-6 shrink-0 items-center justify-between border-t border-gray-400 bg-[#ece9d8] px-2 text-xs text-gray-600">
                <span>
                    {view === 'pdf' ? `PDF · generated ${RESUME.asOf}` : 'Document · generated from live content'}
                </span>
                <span>{PROFILE.name}</span>
            </div>
        </div>
    );
}

function ToolTab({
    active,
    onClick,
    disabled,
    title,
    children,
}: {
    active: boolean;
    onClick: () => void;
    disabled?: boolean;
    title?: string;
    children: React.ReactNode;
}) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            title={title}
            aria-pressed={active}
            className={`px-3 py-1 text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                active ? 'bg-[#316ac5] text-white' : 'bg-white/60 text-gray-800 hover:bg-white'
            } ${disabled ? 'cursor-not-allowed opacity-40' : ''}`}
        >
            {children}
        </button>
    );
}

/** The resume, rendered from `@/content`. Nothing here is typed by hand. */
function GeneratedResume() {
    return (
        <article className="mx-auto min-h-[1000px] w-full max-w-[800px] bg-white p-12 text-black shadow-lg">
            <header className="mb-8 border-b-2 border-black pb-4">
                <h1 className="text-4xl font-bold uppercase tracking-wider">{PROFILE.name}</h1>
                <p className="mt-1 text-sm text-gray-700">{PROFILE.title}</p>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-700">
                    <a href={`mailto:${PROFILE.email}`} className="hover:underline">
                        {PROFILE.email}
                    </a>
                    {LINKS.filter((l) => l.known && l.label !== 'Email' && l.label !== 'Instagram').map((l) => (
                        <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                            {l.url.replace(/^https?:\/\//, '')}
                        </a>
                    ))}
                </div>
            </header>

            <div className="grid grid-cols-[1fr_2fr] gap-8">
                <div className="space-y-6">
                    <Section title="Education">
                        {EDUCATION.map((e) => (
                            <div key={e.id}>
                                <h4 className="text-sm font-bold">{e.qualification}</h4>
                                <p className="text-xs text-gray-600">{e.institution}</p>
                                <p className="text-xs text-gray-500">{e.location}</p>
                                <p className="font-mono text-xs text-gray-500">{e.period}</p>
                                <p className="mt-2 text-xs text-gray-600">
                                    <span className="font-semibold">Coursework: </span>
                                    {e.coursework.join(', ')}
                                </p>
                            </div>
                        ))}
                    </Section>

                    <Section title="Skills">
                        <div className="space-y-2 text-sm">
                            {SKILL_GROUPS.map((g) => (
                                <div key={g.id}>
                                    <p className="text-xs font-bold">{g.label}</p>
                                    <p className="text-gray-700">{g.skills.map((s) => s.name).join(', ')}</p>
                                </div>
                            ))}
                        </div>
                    </Section>

                    <Section title="Certifications">
                        {CERTIFICATIONS.map((c) => (
                            <div key={c.id} className="text-sm">
                                <p className="font-bold">{c.name}</p>
                                <p className="text-xs text-gray-600">
                                    {c.issuer} · {c.status === 'in-progress' ? 'ongoing' : 'completed'}
                                </p>
                            </div>
                        ))}
                    </Section>

                    <Section title="Achievements">
                        <ul className="list-disc space-y-2 pl-4 text-xs text-gray-700">
                            {ACHIEVEMENTS.map((a) => (
                                <li key={a.id}>
                                    <strong>{a.title}</strong> — {a.detail}
                                </li>
                            ))}
                        </ul>
                    </Section>
                </div>

                <div className="space-y-6">
                    <Section title="Experience">
                        {ROLES.map((r) => (
                            <div key={r.id} className="mb-4">
                                <div className="mb-1 flex items-baseline justify-between gap-3">
                                    <h4 className="font-bold">{r.title.value}</h4>
                                    <span className="shrink-0 font-mono text-xs text-gray-500">{r.period.value}</span>
                                </div>
                                <p className="mb-2 text-xs font-bold text-gray-600">
                                    {r.company}
                                    {r.location.from !== 'needs-confirmation' && ` · ${r.location.value}`}
                                </p>
                                {r.highlights.length > 0 ? (
                                    <ul className="list-disc space-y-1 pl-4 text-sm text-gray-700">
                                        {r.highlights.map((h) => (
                                            <li key={h}>{h}</li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p className="text-xs italic text-gray-500">Details not published yet.</p>
                                )}
                            </div>
                        ))}
                    </Section>

                    <Section title="Projects">
                        {PROJECTS.map((p) => (
                            <div key={p.id} className="mb-4">
                                <div className="mb-1 flex items-baseline justify-between gap-3">
                                    <h4 className="font-bold">{p.name}</h4>
                                    <span className="shrink-0 font-mono text-xs text-gray-500">{p.period}</span>
                                </div>
                                <p className="mb-2 text-xs font-bold text-gray-600">
                                    {p.stack.slice(0, 4).join(' · ')}
                                    {isConfidential(p) && (
                                        <span className="ml-2 font-normal uppercase tracking-wide text-[#8a6100]">
                                            confidential
                                        </span>
                                    )}
                                </p>
                                <ul className="list-disc space-y-1 pl-4 text-sm text-gray-700">
                                    {(p.contribution ?? p.highlights).slice(0, 4).map((h) => (
                                        <li key={h}>{h}</li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </Section>
                </div>
            </div>
        </article>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section>
            <h3 className="mb-2 border-b border-gray-300 text-sm font-bold uppercase">{title}</h3>
            {children}
        </section>
    );
}

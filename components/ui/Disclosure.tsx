"use client";

import { Lock, ShieldCheck, FileCode2 } from 'lucide-react';
import type { Project } from '@/content';
import { disclosureNote, isConfidential } from '@/content';

/**
 * Presentation pattern for work whose source cannot be shown.
 *
 * The point is to make the absence of a repository read as a professional boundary rather than a
 * broken link. A dead "Source" button says "this project is fake"; this says "this project is
 * real and I know what I'm allowed to publish" — which is the stronger signal to an employer.
 */

export function ConfidentialBadge({ className = '' }: { className?: string }) {
    return (
        <span
            className={`inline-flex items-center gap-1.5 rounded-sm border border-[#b8860b]/40 bg-[#fff8e1] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#8a6100] ${className}`}
        >
            <Lock size={11} aria-hidden />
            Confidential / Proprietary
        </span>
    );
}

/** The "why there is no source link" panel. Renders nothing for public projects. */
export function DisclosureNotice({ project }: { project: Project }) {
    const note = disclosureNote(project);
    if (!note) return null;

    return (
        <div className="rounded border border-[#d8cfa8] bg-[#fffdf3] p-3">
            <div className="mb-1.5 flex items-center gap-2 text-xs font-bold text-[#8a6100]">
                <ShieldCheck size={14} aria-hidden />
                {isConfidential(project) ? 'Why the source is not public' : 'Source availability'}
            </div>
            <p className="text-xs leading-relaxed text-gray-700">{note}</p>
        </div>
    );
}

/**
 * Problem / Approach / Contribution — the disclosure-safe way to describe employer work.
 * Each block is omitted when the content layer has nothing for it, so this never renders an
 * empty heading.
 */
export function DisclosureSafeStory({ project }: { project: Project }) {
    const { problem, approach, contribution } = project;
    if (!problem && !approach && !contribution?.length) return null;

    return (
        <div className="space-y-4">
            {problem && <StoryBlock title="The problem" body={problem} />}
            {approach && <StoryBlock title="The approach" body={approach} />}
            {contribution && contribution.length > 0 && (
                <div>
                    <SectionHeading>My contribution</SectionHeading>
                    <ul className="space-y-1.5">
                        {contribution.map((c) => (
                            <li key={c} className="flex gap-2 text-sm leading-relaxed text-gray-700">
                                <FileCode2 size={14} className="mt-0.5 shrink-0 text-gray-400" aria-hidden />
                                <span>{c}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}

function StoryBlock({ title, body }: { title: string; body: string }) {
    return (
        <div>
            <SectionHeading>{title}</SectionHeading>
            <p className="text-sm leading-relaxed text-gray-700">{body}</p>
        </div>
    );
}

export function SectionHeading({ children }: { children: React.ReactNode }) {
    return (
        <h4 className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-500">
            {children}
        </h4>
    );
}

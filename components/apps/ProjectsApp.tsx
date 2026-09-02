"use client";

import { useEffect, useState } from 'react';
import { ExternalLink, Folder, Github, Lock, Terminal } from 'lucide-react';
import {
    PROJECTS,
    availabilityLabel,
    isConfidential,
    projectById,
    type Project,
    type ProjectKind,
} from '@/content';
import { useSystemStore } from '@/store/useSystemStore';
import {
    ConfidentialBadge,
    DisclosureNotice,
    DisclosureSafeStory,
    SectionHeading,
} from '@/components/ui/Disclosure';

/**
 * Projects — reads `@/content`, nothing hardcoded.
 *
 * Interop: accepts `payload.projectId`, so `open ~/projects/bypass-lane-graph` in the terminal
 * lands directly on that project. The shell and this window resolve the same ids.
 */

interface ProjectsAppProps {
    payload?: Record<string, string>;
}

const KINDS: { id: ProjectKind | 'all'; label: string }[] = [
    { id: 'all', label: 'All projects' },
    { id: 'system', label: 'Systems' },
    { id: 'backend', label: 'Backend' },
    { id: 'geospatial', label: 'Geospatial' },
    { id: 'web', label: 'Web' },
];

export default function ProjectsApp({ payload }: ProjectsAppProps) {
    const openWindow = useSystemStore((s) => s.actions.openWindow);
    const [selectedId, setSelectedId] = useState<string | null>(payload?.projectId ?? null);
    const [filter, setFilter] = useState<ProjectKind | 'all'>('all');

    // A later `open ~/projects/<id>` (or a Skills evidence click) reuses this window; follow the
    // new payload. Keyed on the payload *object*, not `payload.projectId`: every launch site builds
    // a fresh `{ projectId }` literal and `openWindow` stores it as-is, so a new reference means a
    // new launch — which is what should re-select, even when the id is the same as last time
    // (the visitor may have clicked "All projects" in between).
    useEffect(() => {
        if (payload?.projectId && projectById(payload.projectId)) setSelectedId(payload.projectId);
    }, [payload]);

    const selected = selectedId ? projectById(selectedId) : undefined;
    const visible = filter === 'all' ? PROJECTS : PROJECTS.filter((p) => p.kind === filter);

    return (
        <div className="flex h-full bg-white font-sans text-black">
            <nav className="w-48 shrink-0 border-r border-gray-300 bg-[#f5f5f0] p-2" aria-label="Project filters">
                <div className="mb-2 px-2 pt-1 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                    Categories
                </div>
                {KINDS.map((k) => {
                    const count = k.id === 'all' ? PROJECTS.length : PROJECTS.filter((p) => p.kind === k.id).length;
                    if (count === 0) return null;
                    return (
                        <button
                            key={k.id}
                            onClick={() => {
                                setFilter(k.id);
                                setSelectedId(null);
                            }}
                            aria-current={filter === k.id}
                            className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                                filter === k.id ? 'bg-[#316ac5] text-white' : 'hover:bg-blue-100'
                            }`}
                        >
                            <Folder size={15} className={filter === k.id ? 'text-white' : 'text-[#e2c057]'} aria-hidden />
                            <span className="flex-1 truncate">{k.label}</span>
                            <span className={`text-[10px] ${filter === k.id ? 'text-blue-100' : 'text-gray-400'}`}>
                                {count}
                            </span>
                        </button>
                    );
                })}

                <p className="mt-4 border-t border-gray-300 px-2 pt-3 text-[11px] leading-relaxed text-gray-500">
                    Some work was built inside a company. It is described here, but its source
                    cannot be published.
                </p>
            </nav>

            <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex h-8 shrink-0 items-center gap-2 border-b border-gray-300 px-3 text-xs text-gray-600">
                    <Folder size={12} className="text-[#e2c057]" aria-hidden />
                    <span className="font-mono">
                        ~/projects{selected ? `/${selected.id}` : filter === 'all' ? '' : ` [${filter}]`}
                    </span>
                    <span className="ml-auto flex items-center gap-1 text-[11px] text-gray-400">
                        <Terminal size={11} aria-hidden />
                        same path works in the terminal
                    </span>
                </div>

                <div className="flex-1 overflow-y-auto p-5">
                    {selected ? (
                        <ProjectDetail project={selected} onBack={() => setSelectedId(null)} />
                    ) : (
                        <ul className="space-y-2">
                            {visible.map((p) => (
                                <li key={p.id}>
                                    <ProjectRow project={p} onOpen={() => setSelectedId(p.id)} />
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <div className="flex h-6 shrink-0 items-center justify-between border-t border-gray-300 bg-[#f5f5f0] px-3 text-xs text-gray-500">
                    <span>{selected ? selected.name : `${visible.length} project${visible.length === 1 ? '' : 's'}`}</span>
                    <button
                        onClick={() => openWindow('terminal')}
                        className="hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                        Open in terminal
                    </button>
                </div>
            </div>
        </div>
    );
}

function ProjectRow({ project, onOpen }: { project: Project; onOpen: () => void }) {
    return (
        <button
            onClick={onOpen}
            className="group w-full rounded border border-gray-200 p-3 text-left transition-colors hover:border-blue-300 hover:bg-blue-50/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-bold text-gray-800 group-hover:text-blue-700">{project.name}</h3>
                        {isConfidential(project) && <ConfidentialBadge />}
                    </div>
                    <p className="mt-1 text-sm leading-snug text-gray-600">{project.summary}</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                        {project.stack.slice(0, 5).map((t) => (
                            <span key={t} className="rounded-sm border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] text-gray-600">
                                {t}
                            </span>
                        ))}
                    </div>
                </div>
                <span className="shrink-0 pt-0.5 text-[11px] text-gray-400">{project.period}</span>
            </div>
        </button>
    );
}

function ProjectDetail({ project, onBack }: { project: Project; onBack: () => void }) {
    const publicLinks = project.links.filter((l) => l.known);

    return (
        <article className="mx-auto max-w-2xl">
            <button
                onClick={onBack}
                className="mb-4 text-sm text-blue-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
                &larr; All projects
            </button>

            <header className="mb-5 border-b border-gray-200 pb-4">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                    <h2 className="text-2xl font-bold text-gray-900">{project.name}</h2>
                    {isConfidential(project) && <ConfidentialBadge />}
                </div>
                <p className="text-sm text-gray-600">{project.summary}</p>

                <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-xs sm:grid-cols-3">
                    <Meta label="Period" value={project.period} />
                    <Meta label="Role" value={project.role} />
                    <Meta label="Context" value={project.context ?? 'Personal project'} />
                </dl>
            </header>

            <div className="space-y-5">
                {project.description.map((para) => (
                    <p key={para.slice(0, 40)} className="text-sm leading-relaxed text-gray-700">
                        {para}
                    </p>
                ))}

                <DisclosureSafeStory project={project} />

                {project.highlights.length > 0 && (
                    <div>
                        <SectionHeading>Highlights</SectionHeading>
                        <ul className="list-inside list-disc space-y-1 text-sm leading-relaxed text-gray-700">
                            {project.highlights.map((h) => (
                                <li key={h}>{h}</li>
                            ))}
                        </ul>
                    </div>
                )}

                <div>
                    <SectionHeading>Technologies</SectionHeading>
                    <div className="flex flex-wrap gap-1.5">
                        {project.stack.map((t) => (
                            <span key={t} className="rounded-sm border border-gray-300 bg-gray-50 px-2 py-0.5 text-xs text-gray-700">
                                {t}
                            </span>
                        ))}
                    </div>
                </div>

                <div>
                    <SectionHeading>Links</SectionHeading>
                    {publicLinks.length > 0 ? (
                        <div className="flex flex-wrap gap-4">
                            {publicLinks.map((l) => (
                                <a
                                    key={l.url}
                                    href={l.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1.5 text-sm text-blue-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                                >
                                    {l.label === 'Source' ? <Github size={14} aria-hidden /> : <ExternalLink size={14} aria-hidden />}
                                    {l.label}
                                </a>
                            ))}
                        </div>
                    ) : (
                        // No dead buttons: state the reason instead of rendering an inert link.
                        <p className="flex items-center gap-1.5 text-sm text-gray-500">
                            <Lock size={13} aria-hidden />
                            {availabilityLabel(project.availability)}
                        </p>
                    )}
                    {project.links.some((l) => !l.known) && (
                        <p className="mt-1.5 text-[11px] text-gray-400">
                            {project.links
                                .filter((l) => !l.known)
                                .map((l) => l.label)
                                .join(', ')}
                            : address not recorded yet — deliberately not linked rather than guessed.
                        </p>
                    )}
                </div>

                <DisclosureNotice project={project} />
            </div>
        </article>
    );
}

function Meta({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <dt className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{label}</dt>
            <dd className="text-gray-700">{value}</dd>
        </div>
    );
}

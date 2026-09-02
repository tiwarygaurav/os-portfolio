"use client";

import { useState } from 'react';
import { ArrowUpRight, Briefcase, FolderGit2, Info } from 'lucide-react';
import {
    SKILL_GROUPS,
    projectById,
    roleById,
    type Skill,
} from '@/content';
import { useSystemStore } from '@/store/useSystemStore';

/**
 * Skills — evidence, not percentages.
 *
 * The previous version rendered animated proficiency bars: React 95%, Figma 90%, Blender 3D 40%,
 * GraphQL 70%. Those numbers were invented, and three of those tools appear nowhere in the
 * owner's resume. Nobody can verify "90%", and anyone comparing this window to the resume caught
 * the contradiction immediately.
 *
 * This replaces them with claims that can be checked: every skill lists the roles and projects
 * that demonstrate it, and clicking one opens that work. A skill with no evidence says so
 * plainly rather than being padded to look strong.
 */

const LEVEL_COPY: Record<Skill['level'], { label: string; detail: string; className: string }> = {
    proficient: {
        label: 'Proficient',
        detail: 'Used to build the substantial parts of a shipped system.',
        className: 'bg-[#1f6f3f] text-white',
    },
    working: {
        label: 'Working',
        detail: 'Used productively on real tasks.',
        className: 'bg-[#2c5aa8] text-white',
    },
    familiar: {
        label: 'Familiar',
        detail: 'Used, but not deeply — the resume marks these as basic.',
        className: 'bg-[#6b6b6b] text-white',
    },
};

export default function SkillsApp() {
    const openWindow = useSystemStore((s) => s.actions.openWindow);
    const [active, setActive] = useState<Skill | null>(null);

    const openEvidence = (id: string) => {
        if (projectById(id)) {
            openWindow('projects', undefined, { projectId: id });
        } else if (roleById(id)) {
            openWindow('about');
        }
    };

    return (
        <div className="h-full overflow-y-auto bg-[#f7f7f4] font-sans">
            <div className="mx-auto max-w-4xl p-5">
                <header className="mb-5">
                    <h1 className="text-xl font-bold text-gray-900">Skills</h1>
                    <p className="mt-1 flex items-start gap-2 text-xs leading-relaxed text-gray-600">
                        <Info size={14} className="mt-0.5 shrink-0 text-gray-400" aria-hidden />
                        <span>
                            No percentage bars. Each entry names the work that demonstrates it —
                            select a skill to see where it was used, and open that work directly.
                        </span>
                    </p>
                </header>

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_260px]">
                    <div className="space-y-4">
                        {SKILL_GROUPS.map((group) => (
                            <section key={group.id} className="rounded border border-gray-200 bg-white">
                                <h2 className="border-b border-gray-200 px-3 py-2 text-xs font-bold uppercase tracking-wider text-gray-500">
                                    {group.label}
                                </h2>
                                <ul className="divide-y divide-gray-100">
                                    {group.skills.map((skill) => (
                                        <li key={skill.name}>
                                            <button
                                                onClick={() => setActive(skill)}
                                                aria-pressed={active?.name === skill.name}
                                                className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                                                    active?.name === skill.name ? 'bg-blue-50' : 'hover:bg-gray-50'
                                                }`}
                                            >
                                                <span className="flex-1 truncate text-sm text-gray-800">
                                                    {skill.name}
                                                </span>

                                                <span
                                                    className={`rounded-sm px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${LEVEL_COPY[skill.level].className}`}
                                                >
                                                    {LEVEL_COPY[skill.level].label}
                                                </span>

                                                <span className="w-24 shrink-0 text-right text-[11px] text-gray-400">
                                                    {skill.evidence.length
                                                        ? `${skill.evidence.length} source${skill.evidence.length === 1 ? '' : 's'}`
                                                        : 'no evidence'}
                                                </span>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        ))}
                    </div>

                    <aside className="lg:sticky lg:top-0 lg:self-start">
                        <EvidencePanel skill={active} onOpen={openEvidence} />
                    </aside>
                </div>

                <footer className="mt-5 rounded border border-gray-200 bg-white p-3">
                    <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-500">
                        How to read this
                    </h2>
                    <dl className="space-y-1.5">
                        {(Object.keys(LEVEL_COPY) as Skill['level'][]).map((level) => (
                            <div key={level} className="flex items-start gap-2">
                                <dt className={`mt-0.5 rounded-sm px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${LEVEL_COPY[level].className}`}>
                                    {LEVEL_COPY[level].label}
                                </dt>
                                <dd className="text-xs text-gray-600">{LEVEL_COPY[level].detail}</dd>
                            </div>
                        ))}
                    </dl>
                </footer>
            </div>
        </div>
    );
}

function EvidencePanel({ skill, onOpen }: { skill: Skill | null; onOpen: (id: string) => void }) {
    if (!skill) {
        return (
            <div className="rounded border border-dashed border-gray-300 bg-white p-4 text-center text-xs text-gray-500">
                Select a skill to see the work behind it.
            </div>
        );
    }

    // Counts describe *this skill's* evidence only. The footer used to print the global
    // ROLES/PROJECTS totals, which read as a claim about the selected skill — and contradicted
    // the "no evidence" sentence directly above it.
    const roleCount = skill.evidence.filter((id) => roleById(id)).length;
    const projectCount = skill.evidence.filter((id) => projectById(id)).length;
    const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

    return (
        <div className="rounded border border-gray-200 bg-white">
            <div className="border-b border-gray-200 px-3 py-2">
                <h2 className="text-sm font-bold text-gray-900">{skill.name}</h2>
                <p className="mt-1 text-[11px] leading-relaxed text-gray-500">
                    {LEVEL_COPY[skill.level].detail}
                </p>
            </div>

            {skill.evidence.length === 0 ? (
                <p className="p-3 text-xs leading-relaxed text-gray-500">
                    Listed on the resume, but nothing in this portfolio demonstrates it yet — so
                    it is shown without evidence rather than dressed up.
                </p>
            ) : (
                <ul className="divide-y divide-gray-100">
                    {skill.evidence.map((id) => {
                        const project = projectById(id);
                        const role = roleById(id);
                        const label = project?.name ?? role?.company ?? id;
                        const sub = project?.summary ?? role?.title.value ?? '';

                        return (
                            <li key={id}>
                                <button
                                    onClick={() => onOpen(id)}
                                    className="group flex w-full items-start gap-2 p-3 text-left hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                                >
                                    {project ? (
                                        <FolderGit2 size={14} className="mt-0.5 shrink-0 text-gray-400" aria-hidden />
                                    ) : (
                                        <Briefcase size={14} className="mt-0.5 shrink-0 text-gray-400" aria-hidden />
                                    )}
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-xs font-semibold text-gray-800 group-hover:text-blue-700">
                                            {label}
                                        </span>
                                        <span className="block text-[11px] leading-snug text-gray-500">{sub}</span>
                                    </span>
                                    <ArrowUpRight size={13} className="mt-0.5 shrink-0 text-gray-300 group-hover:text-blue-600" aria-hidden />
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}

            {skill.evidence.length > 0 && (
                <p className="border-t border-gray-100 px-3 py-2 text-[10px] text-gray-400">
                    Evidence for {skill.name}: {plural(roleCount, 'role')}, {plural(projectCount, 'project')}.
                </p>
            )}
        </div>
    );
}

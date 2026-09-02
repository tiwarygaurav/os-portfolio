"use client";

import Image from 'next/image';
import { Briefcase, GraduationCap, Award, Mail, Github, Linkedin, Globe, FileText } from 'lucide-react';
import {
    ACHIEVEMENTS,
    CERTIFICATIONS,
    EDUCATION,
    LINKS,
    PROFILE,
    ROLES,
    type Role,
} from '@/content';
import { useSystemStore } from '@/store/useSystemStore';
import ExplorerLayout from '../os/ExplorerLayout';
import { SectionHeading } from '@/components/ui/Disclosure';

/**
 * About — every fact comes from `@/content`.
 *
 * The previous version positioned the owner as a "Full Stack Developer & Designer" interested in
 * nostalgia and pixel art, listed Figma and Blender as top skills, and used a generic glyph in
 * place of his photo — all of which contradicted his own resume two windows away. None of that
 * text exists any more; there is only one source now.
 */

const ICONS: Record<string, typeof Github> = {
    GitHub: Github,
    LinkedIn: Linkedin,
    Twitter: Globe,
    Instagram: Globe,
    Email: Mail,
};

export default function AboutApp() {
    const openWindow = useSystemStore((s) => s.actions.openWindow);

    return (
        <ExplorerLayout
            path="~/about.md"
            sidebarSections={[
                {
                    title: 'Connect',
                    defaultOpen: true,
                    items: LINKS.map((l) => ({
                        label: l.label,
                        icon: ICONS[l.label] ?? Globe,
                        action: () => window.open(l.url, '_blank', 'noopener,noreferrer'),
                    })),
                },
                {
                    title: 'See also',
                    defaultOpen: true,
                    items: [
                        { label: 'Resume', icon: FileText, action: () => openWindow('resume') },
                        { label: 'Projects', icon: Briefcase, action: () => openWindow('projects') },
                        { label: 'Skills', icon: Award, action: () => openWindow('skills') },
                    ],
                },
            ]}
        >
            <div className="mx-auto max-w-3xl">
                <header className="mb-8 flex flex-col items-center gap-6 sm:flex-row sm:items-start">
                    <Image
                        src={PROFILE.avatar}
                        alt={`${PROFILE.name}`}
                        width={112}
                        height={112}
                        className="h-28 w-28 shrink-0 rounded-lg border-2 border-white object-cover shadow-lg"
                        priority
                    />

                    <div className="text-center sm:text-left">
                        <h1 className="text-3xl font-bold text-gray-900">{PROFILE.name}</h1>
                        <p className="mt-0.5 text-lg text-gray-600">{PROFILE.title}</p>

                        <div className="mt-3 flex flex-wrap justify-center gap-2 text-xs sm:justify-start">
                            <span className="rounded border border-blue-100 bg-blue-50 px-2 py-1 text-blue-700">
                                {PROFILE.availability}
                            </span>
                            {/* Location is unconfirmed in content/, so it is labelled rather than asserted. */}
                            <span
                                className="rounded border border-gray-200 bg-gray-50 px-2 py-1 text-gray-600"
                                title={PROFILE.location.note}
                            >
                                {PROFILE.location.value}
                                {PROFILE.location.from === 'needs-confirmation' && (
                                    <span className="ml-1 text-gray-400">(unconfirmed)</span>
                                )}
                            </span>
                        </div>
                    </div>
                </header>

                <p className="mb-8 border-l-2 border-blue-300 bg-blue-50/40 py-3 pl-4 text-sm leading-relaxed text-gray-800">
                    {PROFILE.summary}
                </p>

                <section className="mb-8">
                    <SectionHeading>What I work on</SectionHeading>
                    <ul className="space-y-1">
                        {PROFILE.focus.map((f) => (
                            <li key={f} className="text-sm text-gray-700">
                                — {f}
                            </li>
                        ))}
                    </ul>
                </section>

                <section className="mb-8">
                    <h2 className="mb-3 flex items-center gap-2 border-b border-gray-200 pb-2 text-lg font-bold text-gray-800">
                        <Briefcase size={18} className="text-blue-600" aria-hidden />
                        Experience
                    </h2>
                    <div className="space-y-4">
                        {ROLES.map((role) => (
                            <RoleCard key={role.id} role={role} />
                        ))}
                    </div>
                </section>

                <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
                    <section>
                        <h2 className="mb-3 flex items-center gap-2 border-b border-gray-200 pb-2 text-lg font-bold text-gray-800">
                            <GraduationCap size={18} className="text-green-600" aria-hidden />
                            Education
                        </h2>
                        {EDUCATION.map((e) => (
                            <div key={e.id} className="mb-3">
                                <h3 className="text-sm font-bold text-gray-800">{e.qualification}</h3>
                                <p className="text-xs text-gray-600">{e.institution}</p>
                                <p className="text-xs text-gray-500">
                                    {e.location} · {e.period}
                                </p>
                                <p className="mt-2 text-xs leading-relaxed text-gray-600">
                                    <span className="font-semibold">Coursework: </span>
                                    {e.coursework.join(', ')}
                                </p>
                            </div>
                        ))}

                        {CERTIFICATIONS.length > 0 && (
                            <div className="mt-4">
                                <SectionHeading>Certifications</SectionHeading>
                                {CERTIFICATIONS.map((c) => (
                                    <p key={c.id} className="text-xs text-gray-700">
                                        {c.name} — {c.issuer}
                                        <span className="ml-1 text-gray-400">
                                            ({c.status === 'in-progress' ? 'in progress' : 'completed'})
                                        </span>
                                    </p>
                                ))}
                            </div>
                        )}
                    </section>

                    <section>
                        <h2 className="mb-3 flex items-center gap-2 border-b border-gray-200 pb-2 text-lg font-bold text-gray-800">
                            <Award size={18} className="text-amber-600" aria-hidden />
                            Achievements
                        </h2>
                        <ul className="space-y-3">
                            {ACHIEVEMENTS.map((a) => (
                                <li key={a.id}>
                                    <p className="text-sm font-bold text-gray-800">{a.title}</p>
                                    <p className="text-xs leading-relaxed text-gray-600">{a.detail}</p>
                                </li>
                            ))}
                        </ul>
                    </section>
                </div>
            </div>
        </ExplorerLayout>
    );
}

function RoleCard({ role }: { role: Role }) {
    const unconfirmed =
        role.title.from === 'needs-confirmation' || role.period.from === 'needs-confirmation';

    return (
        <article className="rounded border border-gray-200 p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-bold text-gray-800">
                    {role.title.value}
                    {role.current && (
                        <span className="ml-2 rounded-sm bg-green-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-green-800">
                            Current
                        </span>
                    )}
                </h3>
                <span className="text-xs text-gray-500">{role.period.value}</span>
            </div>
            <p className="mb-2 text-xs font-semibold text-gray-600">
                {role.company}
                {role.location.from !== 'needs-confirmation' && ` · ${role.location.value}`}
            </p>

            {role.highlights.length > 0 ? (
                <ul className="list-inside list-disc space-y-1 text-xs leading-relaxed text-gray-700">
                    {role.highlights.map((h) => (
                        <li key={h}>{h}</li>
                    ))}
                </ul>
            ) : (
                // A real role with nothing recorded yet. Say so; do not invent responsibilities.
                <p className="text-xs italic text-gray-500">
                    Details for this role haven’t been published yet.
                </p>
            )}

            {role.stack.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                    {role.stack.map((t) => (
                        <span key={t} className="rounded-sm border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] text-gray-600">
                            {t}
                        </span>
                    ))}
                </div>
            )}

            {unconfirmed && (
                <p className="mt-2 border-t border-gray-100 pt-2 text-[10px] leading-relaxed text-gray-400">
                    Title and dates for this entry are pending the owner’s correction and are shown
                    as recorded rather than reconciled.
                </p>
            )}
        </article>
    );
}

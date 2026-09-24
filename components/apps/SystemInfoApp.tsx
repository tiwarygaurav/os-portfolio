"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSystemStore, type WindowPayload } from '@/store/useSystemStore';
import { SYSTEM } from '@/content';
import { SOURCE } from '@/system/source';
import { USER_FILES_QUOTA, guestUsage, importersOf, recycledUsage, type SourceModule } from '@/system/vfs';
import { useProcesses } from '@/utils/processes';

/**
 * System Information — XP's msinfo32 — over things this page can actually measure.
 *
 * Two halves. The browser half reads what the browser reports (screen, pointer, processors, heap,
 * storage) and says "Not reported by this browser" where it reports nothing; nothing is estimated.
 * The software half is this desktop's own architecture: Loaded Modules is the module graph that
 * `scripts/gen-architecture.mjs` read from the source when this build was made — every module, its
 * layer and size, the first paragraph of its own doc comment, what it imports and what imports it —
 * and Dependency Rule is CLAUDE.md's layering rule checked against every one of those imports.
 */

interface SystemInfoAppProps {
    payload?: WindowPayload;
}

type Section = 'summary' | 'display' | 'input' | 'storage' | 'tasks' | 'modules' | 'packages' | 'rule';

const TREE: { label: string; items: { id: Section; label: string }[] }[] = [
    { label: 'System Summary', items: [{ id: 'summary', label: 'System Summary' }] },
    {
        label: 'Components',
        items: [
            { id: 'display', label: 'Display' },
            { id: 'input', label: 'Input' },
            { id: 'storage', label: 'Storage' },
        ],
    },
    {
        label: 'Software Environment',
        items: [
            { id: 'tasks', label: 'Running Tasks' },
            { id: 'modules', label: 'Loaded Modules' },
            { id: 'packages', label: 'Packages' },
            { id: 'rule', label: 'Dependency Rule' },
        ],
    },
];

const NOT_REPORTED = 'Not reported by this browser';

type Row = [string, string];

/** What the browser reports right now. Read on the client, never guessed. */
function browserFacts() {
    const nav = navigator as Navigator & { deviceMemory?: number };
    const perf = performance as Performance & { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } };
    const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;
    const media = (q: string) => window.matchMedia(q).matches;
    return {
        host: window.location.host || 'this page',
        userAgent: nav.userAgent,
        cpus: nav.hardwareConcurrency ? `${nav.hardwareConcurrency} logical processor(s)` : NOT_REPORTED,
        memory: nav.deviceMemory ? `About ${nav.deviceMemory} GB (the browser rounds it)` : NOT_REPORTED,
        heap: perf.memory ? `${mb(perf.memory.usedJSHeapSize)} used of ${mb(perf.memory.jsHeapSizeLimit)}` : NOT_REPORTED,
        screen: `${window.screen.width} x ${window.screen.height}`,
        available: `${window.screen.availWidth} x ${window.screen.availHeight}`,
        viewport: `${window.innerWidth} x ${window.innerHeight}`,
        ratio: `${window.devicePixelRatio}`,
        depth: `${window.screen.colorDepth} bits`,
        zone: Intl.DateTimeFormat().resolvedOptions().timeZone || NOT_REPORTED,
        locale: nav.language || NOT_REPORTED,
        online: nav.onLine ? 'Online' : 'Offline',
        pointer: media('(pointer: fine)') ? 'Fine (a mouse or a pen)' : media('(pointer: coarse)') ? 'Coarse (a finger)' : 'None reported',
        hover: media('(hover: hover)') ? 'Yes' : 'No',
        touch: `${nav.maxTouchPoints ?? 0}`,
        motion: media('(prefers-reduced-motion: reduce)') ? 'Reduced (the visitor asked for less motion)' : 'Full',
        scheme: media('(prefers-color-scheme: dark)') ? 'Dark' : 'Light',
    };
}

export default function SystemInfoApp({ payload }: SystemInfoAppProps) {
    const procs = useProcesses();
    const themeId = useSystemStore((s) => s.themeId);
    const fileCount = useSystemStore((s) => Object.keys(s.userFiles).length);
    const folderCount = useSystemStore((s) => s.userFolders.length);
    const binCount = useSystemStore((s) => s.recycleBin.length);

    const [section, setSection] = useState<Section>(payload?.module ? 'modules' : 'summary');
    const [moduleSel, setModuleSel] = useState<string | null>(payload?.module ?? null);
    const [find, setFind] = useState('');
    const [facts, setFacts] = useState<ReturnType<typeof browserFacts> | null>(null);
    const [sortBy, setSortBy] = useState<'path' | 'layer' | 'lines' | 'imports' | 'importers'>('path');
    const detailRef = useRef<HTMLDivElement>(null);

    // Measured on the client, and again whenever the section changes (the window may have moved
    // to another screen, or been resized).
    useEffect(() => setFacts(browserFacts()), [section]);

    // `open /usr/src/<module>` or a double-click in Explorer arrives as a payload.
    const opening = useRef(payload);
    useEffect(() => {
        if (payload === opening.current || !payload?.module) return;
        setSection('modules');
        setModuleSel(payload.module);
    }, [payload]);

    const importers = useMemo(() => importersOf(SOURCE), []);
    const selectedModule = moduleSel ? SOURCE.modules.find((m) => m.path === moduleSel) : undefined;
    useEffect(() => detailRef.current?.scrollIntoView({ block: 'nearest' }), [moduleSel]);

    const q = find.trim().toLowerCase();
    const matches = (...texts: (string | null | undefined)[]) => !q || texts.some((t) => t?.toLowerCase().includes(q));

    const layers = useMemo(() => {
        const by = new Map<string, number>();
        for (const m of SOURCE.modules) by.set(m.layer, (by.get(m.layer) ?? 0) + 1);
        return Array.from(by.entries()).sort();
    }, []);

    const packages = useMemo(() => {
        const by = new Map<string, string[]>();
        for (const m of SOURCE.modules) for (const p of m.packages) by.set(p, [...(by.get(p) ?? []), m.path]);
        return Array.from(by.entries()).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
    }, []);

    const modules = useMemo(() => {
        const count = (m: SourceModule) => importers.get(m.path)?.length ?? 0;
        const rows = SOURCE.modules.filter((m) => matches(m.path, m.summary, m.layer));
        const cmp: Record<typeof sortBy, (a: SourceModule, b: SourceModule) => number> = {
            path: (a, b) => a.path.localeCompare(b.path),
            layer: (a, b) => a.layer.localeCompare(b.layer) || a.path.localeCompare(b.path),
            lines: (a, b) => b.lines - a.lines,
            imports: (a, b) => b.imports.length - a.imports.length,
            importers: (a, b) => count(b) - count(a),
        };
        return [...rows].sort(cmp[sortBy]);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- `matches` is derived from `q`
    }, [q, sortBy, importers]);

    const usage = guestUsage();
    const rowsFor = (): Row[] => {
        const f = facts;
        if (!f) return [];
        switch (section) {
            case 'summary':
                return [
                    ['OS Name', `${SYSTEM.name} ${SYSTEM.version}`],
                    ['Modelled on', SYSTEM.ancestor],
                    ['Build', SOURCE.commit ? `Commit ${SOURCE.commit}` : 'Commit not recorded for this build'],
                    ['System Name', f.host],
                    ['Browser', f.userAgent],
                    ['Processor', f.cpus],
                    ['Device Memory', f.memory],
                    ['JavaScript Heap', f.heap],
                    ['Display', `${f.screen} at ${f.ratio}x`],
                    ['Time Zone', f.zone],
                    ['Locale', f.locale],
                    ['Network', f.online],
                    ['Running Tasks', `${procs.length}`],
                    ['Loaded Modules', `${SOURCE.modules.length}`],
                    ['Dependency Rule', SOURCE.violations.length ? `Broken ${SOURCE.violations.length} time(s)` : 'Holds'],
                ];
            case 'display':
                return [
                    ['Resolution', f.screen],
                    ['Available to windows', f.available],
                    ['This browser window', f.viewport],
                    ['Pixel ratio', f.ratio],
                    ['Colour depth', f.depth],
                    ['Colour scheme (Luna)', themeId],
                    ['System colour scheme', f.scheme],
                    ['Motion', f.motion],
                ];
            case 'input':
                return [
                    ['Pointer', f.pointer],
                    ['Can hover', f.hover],
                    ['Touch points', f.touch],
                ];
            case 'storage':
                return [
                    ['Your files', `${fileCount}`],
                    ['Your folders', `${folderCount}`],
                    ['In the Recycle Bin', `${binCount} item(s), ${Math.round(recycledUsage() / 1024)} KB`],
                    ['Used', `${Math.round(usage / 1024)} KB of ${Math.round(USER_FILES_QUOTA / 1024)} KB (${Math.round((usage / USER_FILES_QUOTA) * 100)}%)`],
                    ['Where', "This browser's localStorage. Nobody else can see it."],
                ];
            case 'rule':
                return [
                    ['Rule', 'content/ and system/ never import components/, app/, the store or React.'],
                    ['Imports checked', `${SOURCE.modules.reduce((n, m) => n + m.imports.length + m.packages.length, 0)}`],
                    ['Result', SOURCE.violations.length ? `Broken ${SOURCE.violations.length} time(s)` : 'Holds: no import breaks it'],
                    ...SOURCE.violations.map((v): Row => [v.from, `${v.to} — ${v.rule}`]),
                ];
            default:
                return [];
        }
    };

    const table = (head: string[], rows: React.ReactNode[][]) => (
        <table className="w-full border-collapse text-[11px]">
            <thead className="sticky top-0 bg-[#ece9d8]">
                <tr>
                    {head.map((h) => (
                        <th key={h} className="border-b border-r border-[#d6d2c2] px-2 py-0.5 text-left font-normal">{h}</th>
                    ))}
                </tr>
            </thead>
            <tbody>
                {rows.map((r, i) => (
                    <tr key={i} className="align-top odd:bg-white even:bg-[#f7f7f3]">
                        {r.map((c, j) => (
                            <td key={j} className="break-words px-2 py-0.5">{c}</td>
                        ))}
                    </tr>
                ))}
            </tbody>
        </table>
    );

    const moduleLink = (path: string) => (
        <button type="button" className="text-left text-[#0b3aa4] hover:underline" onClick={() => setModuleSel(path)}>
            {path}
        </button>
    );

    const sortHeader = (key: typeof sortBy, label: string) => (
        <th key={key} className="border-b border-r border-[#d6d2c2] p-0 text-left font-normal">
            <button type="button" onClick={() => setSortBy(key)} aria-pressed={sortBy === key} className="w-full px-2 py-0.5 text-left hover:bg-[#f7f6f0]">
                {label}
                {sortBy === key && <span aria-hidden> ▾</span>}
            </button>
        </th>
    );

    const body = () => {
        if (section === 'tasks') {
            return table(
                ['Process ID', 'Program', 'State'],
                procs.filter((p) => matches(p.pid, p.title, p.appId)).map((p) => [p.pid, p.title, p.state]),
            );
        }
        if (section === 'packages') {
            return table(
                ['Package', 'Imported by', 'Modules'],
                packages.filter(([name, by]) => matches(name, ...by)).map(([name, by]) => [name, `${by.length}`, by.join(', ')]),
            );
        }
        if (section === 'modules') {
            return (
                <>
                    <table className="w-full border-collapse text-[11px]">
                        <thead className="sticky top-0 bg-[#ece9d8]">
                            <tr>
                                {sortHeader('path', 'Module')}
                                {sortHeader('layer', 'Layer')}
                                {sortHeader('lines', 'Lines')}
                                {sortHeader('imports', 'Imports')}
                                {sortHeader('importers', 'Imported by')}
                            </tr>
                        </thead>
                        <tbody>
                            {modules.map((m) => {
                                const on = m.path === moduleSel;
                                return (
                                    <tr
                                        key={m.path}
                                        data-module={m.path}
                                        tabIndex={0}
                                        aria-selected={on}
                                        onClick={() => setModuleSel(m.path)}
                                        onKeyDown={(e) => {
                                            if (e.key !== 'Enter') return;
                                            e.stopPropagation();
                                            setModuleSel(m.path);
                                        }}
                                        className={`cursor-default outline-none ${on ? 'bg-[#316ac5] text-white' : 'odd:bg-white even:bg-[#f7f7f3] hover:bg-[#e8f0fe]'}`}
                                    >
                                        <td className="px-2 py-0.5">{m.path}</td>
                                        <td className="px-2 py-0.5">{m.layer}</td>
                                        <td className="px-2 py-0.5 text-right">{m.lines.toLocaleString()}</td>
                                        <td className="px-2 py-0.5 text-right">{m.imports.length}</td>
                                        <td className="px-2 py-0.5 text-right">{importers.get(m.path)?.length ?? 0}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    {selectedModule && (
                        <div ref={detailRef} className="m-2 border border-[#919b9c] bg-[#fcfcfe] p-2 text-[11px]" aria-label={`About ${selectedModule.path}`}>
                            <p className="font-bold">{selectedModule.path}</p>
                            <p className="text-gray-600">
                                {selectedModule.layer} · {selectedModule.lines.toLocaleString()} lines
                                {selectedModule.packages.length > 0 && ` · packages: ${selectedModule.packages.join(', ')}`}
                            </p>
                            <p className="my-1.5">{selectedModule.summary ?? 'This module has no doc comment of its own.'}</p>
                            <div className="grid gap-2 sm:grid-cols-2">
                                <div>
                                    <p className="font-bold">Imports ({selectedModule.imports.length})</p>
                                    <ul>
                                        {selectedModule.imports.map((i) => (
                                            <li key={i.to}>
                                                {moduleLink(i.to)}
                                                {i.typeOnly ? <span className="text-gray-500"> (types only)</span> : i.lazy ? <span className="text-gray-500"> (loaded when first needed)</span> : null}
                                            </li>
                                        ))}
                                        {selectedModule.imports.length === 0 && <li className="text-gray-500">Nothing in this repository.</li>}
                                    </ul>
                                </div>
                                <div>
                                    <p className="font-bold">Imported by ({importers.get(selectedModule.path)?.length ?? 0})</p>
                                    <ul>
                                        {(importers.get(selectedModule.path) ?? []).map((m) => (
                                            <li key={m.path}>{moduleLink(m.path)}</li>
                                        ))}
                                        {!importers.get(selectedModule.path)?.length && (
                                            <li className="text-gray-500">Nothing — an entry point, or loaded by Next.js itself.</li>
                                        )}
                                    </ul>
                                </div>
                            </div>
                        </div>
                    )}
                </>
            );
        }
        return table(['Item', 'Value'], rowsFor().filter(([k, v]) => matches(k, v)));
    };

    const current = TREE.flatMap((g) => g.items).find((i) => i.id === section)!;

    return (
        <div className="flex h-full select-none flex-col bg-[#ece9d8] font-sans text-[11px] text-black">
            <div className="flex min-h-0 flex-1 flex-col gap-1 p-1 md:flex-row">
                {/* The category tree, as msinfo32 drew it. */}
                <nav aria-label="Categories" className="shrink-0 overflow-y-auto border border-[#7f9db9] bg-white p-1 md:w-48">
                    {TREE.map((g) => (
                        <div key={g.label}>
                            {g.items.length === 1 && g.items[0].label === g.label ? null : <p className="px-1 pt-1 font-bold text-gray-700">{g.label}</p>}
                            {g.items.map((item) => (
                                <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => setSection(item.id)}
                                    aria-current={section === item.id}
                                    className={`block w-full rounded-sm px-1 py-0.5 text-left ${g.items.length > 1 || g.items[0].label !== g.label ? 'pl-4' : 'font-bold'} ${
                                        section === item.id ? 'bg-[#316ac5] text-white' : 'hover:bg-[#e8f0fe]'
                                    }`}
                                >
                                    {item.label}
                                </button>
                            ))}
                        </div>
                    ))}
                    <p className="mt-2 border-t border-[#d6d2c2] px-1 pt-1 text-gray-500">
                        {SOURCE.modules.length} modules in{' '}
                        {layers.map(([l, n]) => `${l} (${n})`).join(', ')}.
                    </p>
                </nav>
                <section aria-label={current.label} className="min-h-0 flex-1 overflow-auto border border-[#7f9db9] bg-white">
                    {body()}
                </section>
            </div>
            {/* msinfo32's Find bar. It narrows what the current category shows. */}
            <div className="flex shrink-0 items-center gap-2 border-t border-[#aca899] px-2 py-1">
                <label htmlFor="si-find">Find what:</label>
                <input
                    id="si-find"
                    value={find}
                    onChange={(e) => setFind(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                            e.stopPropagation();
                            setFind('');
                        }
                    }}
                    spellCheck={false}
                    autoComplete="off"
                    className="min-w-0 flex-1 border border-[#7f9db9] bg-white px-1 py-0.5 outline-none focus:border-[#0058ee]"
                />
                <span className="hidden text-gray-600 sm:inline">in {current.label}</span>
            </div>
        </div>
    );
}

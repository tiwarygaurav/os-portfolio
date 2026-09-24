#!/usr/bin/env node
/**
 * Generates `system/architecture.generated.ts`: this application's own module graph, read from the
 * source, for the System Information window (msinfo32) and `/usr/src`.
 *
 * It is generated, never hand-written, so it cannot drift from the code: it runs on install, before
 * `dev`, `build` and the unit tests, and its output is not committed. Everything in it is measured
 * from the files — their imports, their line counts, the first paragraph of their own doc comment —
 * and the dependency rule from CLAUDE.md is checked here, against the real import graph.
 *
 * No dependencies: Node's own fs and path, and regular expressions over TypeScript source.
 */
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'system', 'architecture.generated.ts');
const DIRS = ['app', 'components', 'constants', 'content', 'store', 'system', 'utils'];

const toPosix = (p) => p.split(sep).join('/');

function walk(dir) {
    if (!existsSync(dir)) return [];
    return readdirSync(dir).flatMap((name) => {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) return walk(full);
        if (!/\.(ts|tsx)$/.test(name) || name.endsWith('.d.ts') || name.includes('.generated.')) return [];
        return [full];
    });
}

/** The layer a module belongs to, in CLAUDE.md's terms. */
function layerOf(path) {
    for (const prefix of ['components/os', 'components/apps', 'components/ui']) if (path.startsWith(prefix + '/')) return prefix;
    return path.split('/')[0];
}

const files = DIRS.flatMap((d) => walk(join(ROOT, d))).map((f) => toPosix(relative(ROOT, f))).sort();
const known = new Set(files);

/** A specifier resolved to a module in the repo, or null for a package. */
function resolve(spec, from) {
    let base;
    if (spec.startsWith('@/')) base = spec.slice(2);
    else if (spec.startsWith('./') || spec.startsWith('../')) base = toPosix(join(dirname(from), spec));
    else return null;
    for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
        if (known.has(candidate)) return candidate;
    }
    return undefined; // in the repo but not a module we scan (a stylesheet, say)
}

const packageName = (spec) => (spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]);

/** The first paragraph of the file's first doc comment, as its author wrote it. */
function summaryOf(source) {
    const m = /\/\*\*([\s\S]*?)\*\//.exec(source);
    if (!m) return null;
    const text = m[1]
        .split('\n')
        .map((l) => l.replace(/^\s*\*\s?/, ''))
        .join('\n')
        .trim()
        .split(/\n\s*\n/)[0]
        .replace(/\s+/g, ' ')
        .trim();
    if (!text) return null;
    return text.length > 320 ? `${text.slice(0, 317).replace(/\s+\S*$/, '')}...` : text;
}

const IMPORT = /(?:^|\n)\s*(import|export)\s+(type\s+)?(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;

const modules = files.map((path) => {
    const source = readFileSync(join(ROOT, path), 'utf8');
    const imports = new Map(); // path -> { typeOnly, lazy }
    const packages = new Set();
    for (const m of source.matchAll(IMPORT)) {
        const spec = m[3] ?? m[4];
        const lazy = Boolean(m[4]);
        const typeOnly = Boolean(m[2]);
        const target = resolve(spec, path);
        if (target === null) packages.add(packageName(spec));
        else if (target) {
            const prev = imports.get(target);
            imports.set(target, { typeOnly: (prev?.typeOnly ?? true) && typeOnly, lazy: (prev?.lazy ?? true) && lazy });
        }
    }
    return {
        path,
        layer: layerOf(path),
        lines: source.split('\n').length,
        summary: summaryOf(source),
        imports: [...imports.entries()].map(([to, how]) => ({ to, typeOnly: how.typeOnly, lazy: how.lazy })),
        packages: [...packages].sort(),
    };
});

/*
 * CLAUDE.md, "Dependency direction": content/ and system/ must never import from components/, app/
 * or React; system/ may read store/persistence.ts (pure data) but not the store itself.
 */
const violations = [];
for (const m of modules) {
    if (m.layer !== 'content' && m.layer !== 'system') continue;
    for (const { to } of m.imports) {
        const bad = to.startsWith('components/') || to.startsWith('app/') || (to.startsWith('store/') && to !== 'store/persistence.ts');
        if (bad) violations.push({ from: m.path, to, rule: `${m.layer}/ must not import ${to.split('/')[0]}/` });
    }
    for (const p of m.packages) {
        if (p === 'react' || p === 'react-dom' || p === 'zustand' || p === 'framer-motion' || p === 'next') {
            violations.push({ from: m.path, to: p, rule: `${m.layer}/ must stay headless: no ${p}` });
        }
    }
}

let commit = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null;
if (!commit) {
    try {
        commit = execSync('git rev-parse --short HEAD', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || null;
    } catch {
        commit = null;
    }
}

const header = `/* eslint-disable */
// Generated by scripts/gen-architecture.mjs from the source itself. Do not edit, do not commit:
// it is rebuilt on install and before dev, build and the unit tests.

export interface ModuleImport {
    to: string;
    /** \`import type\`: erased at runtime, a dependency of the types only. */
    typeOnly: boolean;
    /** Only a dynamic \`import()\`: fetched when first needed (the app registry's code splitting). */
    lazy: boolean;
}

export interface ModuleInfo {
    path: string;
    layer: string;
    lines: number;
    /** The first paragraph of the module's own doc comment, or null if it has none. */
    summary: string | null;
    imports: ModuleImport[];
    /** npm packages it imports. */
    packages: string[];
}

export interface Violation {
    from: string;
    to: string;
    rule: string;
}
`;

const body = `
export const ARCHITECTURE: { commit: string | null; modules: ModuleInfo[]; violations: Violation[] } = ${JSON.stringify({ commit, modules, violations })};
`;

writeFileSync(OUT, header + body);
console.log(`architecture: ${modules.length} modules, ${violations.length} dependency-rule violation(s) -> ${toPosix(relative(ROOT, OUT))}`);

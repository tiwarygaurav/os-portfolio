#!/usr/bin/env node
/**
 * Generates `system/architecture.generated.ts`: this application's own module graph, read from the
 * source, for the System Information window (msinfo32) and `/usr/src`.
 *
 * It is generated, never hand-written, so it cannot drift from the code: it runs on install, before
 * `dev`, `build` and the unit tests, and its output is not committed. Everything in it is measured
 * from the files — their imports, their line counts, their own doc comment — and the dependency rule
 * from CLAUDE.md is checked against the real import graph. The analysis is `scripts/architecture.mjs`
 * (on the TypeScript parser, already a dev dependency); this file only reads the tree and writes.
 */
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyse } from './architecture.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_PATH = 'system/architecture.generated.ts';
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

const header = `/* eslint-disable */
// Do not edit, do not commit: rebuilt on install and before dev, build and the unit tests.

/**
 * This build's own module graph, written by scripts/gen-architecture.mjs from the source: every
 * module's layer, lines, doc comment, imports and packages, and the dependency rule checked.
 */

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

export interface Checked {
    /** Modules the rule reached: content/, system/ and everything their runtime imports lead to. */
    modules: number;
    /** Distinct runtime imports between those modules, each checked once. */
    imports: number;
}
`;

const declaration = (json) => `
export const ARCHITECTURE: { commit: string | null; modules: ModuleInfo[]; violations: Violation[]; checked: Checked } = ${json};
`;

const files = DIRS.flatMap((d) => walk(join(ROOT, d)))
    .map((f) => toPosix(relative(ROOT, f)))
    .map((path) => ({ path, source: readFileSync(join(ROOT, path), 'utf8') }));
// The generated file is a module too (system/source.ts imports it). The data is one line whatever it
// holds, so a placeholder of the same shape measures it exactly.
files.push({ path: OUT_PATH, source: header + declaration('null') });

const { modules, violations, checked } = analyse(files);

let commit = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null;
if (!commit) {
    try {
        commit = execSync('git rev-parse --short HEAD', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || null;
    } catch {
        commit = null;
    }
}

writeFileSync(join(ROOT, OUT_PATH), header + declaration(JSON.stringify({ commit, modules, violations, checked })));
console.log(
    `architecture: ${modules.length} modules; dependency rule over ${checked.modules} modules and ${checked.imports} imports: ` +
        `${violations.length ? `${violations.length} violation(s)` : 'holds'} -> ${OUT_PATH}`,
);
for (const v of violations) console.log(`  ${v.rule}`);

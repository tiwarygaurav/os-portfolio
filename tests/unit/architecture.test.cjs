/**
 * The module graph and the dependency rule. `scripts/architecture.mjs` is checked against small
 * made-up trees, so each test knows the right answer independently — checking the generated graph
 * against itself could only ever agree. Then the real build's graph (`pretest:unit` writes it) must
 * hold the rule, and /usr/src must show it.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const vfs = require('../../.test-out/system/vfs.js');
const { SOURCE } = require('../../.test-out/system/source.js');

const lib = import('../../scripts/architecture.mjs');
/** Analyse a tree given as { path: source }. */
const analyse = async (tree) => (await lib).analyse(Object.entries(tree).map(([path, source]) => ({ path, source })));
const moduleOf = (r, path) => r.modules.find((m) => m.path === path);

/* ------------------------------------------------------------ the rule */

test('the rule follows every chain: a headless module may not reach the UI through a third module', async () => {
    const r = await analyse({
        'system/a.ts': "import { b } from '@/utils/b';\nexport const a = b;\n",
        'utils/b.ts': "import { C } from '../components/c';\nexport const b = C;\n",
        'components/c.tsx': 'export const C = 1;\n',
    });
    assert.equal(r.violations.length, 1);
    assert.equal(r.violations[0].from, 'system/a.ts');
    assert.equal(r.violations[0].to, 'components/c.tsx');
    assert.match(r.violations[0].rule, /system\/a\.ts -> utils\/b\.ts -> components\/c\.tsx imports components\//);
});

test('type-only imports are erased, so they cannot break it', async () => {
    const r = await analyse({
        'system/a.ts': "import type { C } from '@/components/c';\nimport { type D } from '@/components/d';\nexport type { E } from '@/components/e';\n",
        'components/c.tsx': 'export type C = 1;\n',
        'components/d.tsx': 'export type D = 1;\n',
        'components/e.tsx': 'export type E = 1;\n',
    });
    assert.deepEqual(r.violations, []);
    assert.ok(moduleOf(r, 'system/a.ts').imports.every((i) => i.typeOnly));
    assert.deepEqual(r.checked, { modules: 1, imports: 0 });
});

test('JSX, an npm package, the store and an import() it cannot follow each break it', async () => {
    const r = await analyse({
        'system/view.tsx': 'export const V = () => <div />;\n',
        'content/pkg.ts': "import { x } from 'lodash/fp';\nexport const y = x;\n",
        'system/store.ts': "import { useSystemStore } from '@/store/useSystemStore';\nexport const s = useSystemStore;\n",
        'store/useSystemStore.ts': 'export const useSystemStore = 1;\n',
        'system/lazy.ts': 'export const load = (p: string) => import(p);\n',
    });
    const why = Object.fromEntries(r.violations.map((v) => [v.from, v.rule]));
    assert.match(why['system/view.tsx'], /draws JSX/);
    assert.match(why['content/pkg.ts'], /uses the npm package lodash/);
    assert.match(why['system/store.ts'], /imports the store/);
    assert.match(why['system/lazy.ts'], /cannot be known/);
    assert.equal(r.violations.length, 4);
});

test('the pure-data persistence list is the store module a headless one may read', async () => {
    const r = await analyse({
        'system/conf.ts': "import { KEYS } from '../store/persistence';\nexport const k = KEYS;\n",
        'store/persistence.ts': 'export const KEYS = [];\n',
    });
    assert.deepEqual(r.violations, []);
    assert.deepEqual(r.checked, { modules: 2, imports: 1 });
});

test('an import inside a string or a comment is not an import', async () => {
    const r = await analyse({
        'system/a.ts': "// import x from '@/components/c';\nconst s = \"import x from '@/components/c'\";\nexport default s;\n",
        'components/c.tsx': 'export default 1;\n',
    });
    assert.deepEqual(moduleOf(r, 'system/a.ts').imports, []);
    assert.deepEqual(r.violations, []);
});

test('a module reached twice is checked once, and each import counted once', async () => {
    const r = await analyse({
        'system/a.ts': "import '@/system/shared';\n",
        'system/b.ts': "import '@/system/shared';\n",
        'system/shared.ts': "import '@/content/data';\n",
        'content/data.ts': 'export const d = 1;\n',
    });
    assert.deepEqual(r.checked, { modules: 4, imports: 3 });
});

test('a dynamic import is recorded as lazy, and outside the headless layers it is fine', async () => {
    const r = await analyse({
        'constants/apps.ts': "export const load = () => import('@/components/apps/X');\n",
        'components/apps/X.tsx': 'export default function X() { return <div />; }\n',
    });
    assert.deepEqual(moduleOf(r, 'constants/apps.ts').imports, [{ to: 'components/apps/X.tsx', typeOnly: false, lazy: true }]);
    assert.equal(moduleOf(r, 'components/apps/X.tsx').layer, 'components/apps');
    assert.deepEqual(r.violations, []);
});

/* ------------------------------------------------------ what it measures */

test('lines are counted as an editor counts them', async () => {
    const r = await analyse({ 'utils/a.ts': 'a\nb\n', 'utils/b.ts': 'a\nb', 'utils/c.ts': 'a\r\nb\r\n' });
    assert.deepEqual(r.modules.map((m) => m.lines), [2, 2, 2]);
});

test('a summary is the file\'s own doc comment, never one written for something inside it', async () => {
    const summaries = await analyse({
        // The store's case: the first doc comment describes a type, not the file.
        'store/s.ts': "import x from 'zustand';\n\n/**\n * Launch argument passed to an app.\n */\nexport type P = string;\n",
        'utils/loose.ts': "import x from 'y';\n\n/**\n * The file.\n */\n\nexport const a = 1;\n",
        'utils/top.ts': '/**\n * The file, first thing in it.\n *\n * More about it.\n */\nimport x from \'y\';\n',
        'components/main.tsx': "import x from 'y';\n\nconst HELPER = 1;\n\n/** The window. */\nexport default function Main() { return null; }\n",
        'utils/overview.ts': "import x from 'y';\n\n/**\n * The sound scheme.\n *\n * What it plays.\n */\nexport type Name = 'a';\n",
        'utils/private.ts': "import x from 'y';\n\n/**\n * Send icons to the bin.\n *\n * Module scope on purpose.\n */\nasync function send() {}\nexport const z = send;\n",
        'utils/state.ts': '/**\n * What happens at shutdown.\n *\n * Module state.\n */\nlet restart = false;\nexport const r = () => restart;\n',
        'utils/none.ts': "import x from 'y';\n\nexport const a = 1;\n",
    }).then((r) => Object.fromEntries(r.modules.map((m) => [m.path, m.summary])));

    assert.deepEqual(summaries, {
        'components/main.tsx': 'The window.',
        'store/s.ts': null,
        'utils/loose.ts': 'The file.',
        'utils/none.ts': null,
        'utils/overview.ts': 'The sound scheme.',
        'utils/private.ts': null,
        'utils/state.ts': 'What happens at shutdown.',
        'utils/top.ts': 'The file, first thing in it.',
    });
});

/* ---------------------------------------------------- this build's graph */

test('this build\'s graph covers the source, and the dependency rule holds over it', () => {
    const paths = SOURCE.modules.map((m) => m.path);
    for (const p of ['system/vfs.ts', 'system/shell.ts', 'system/bus.ts', 'system/architecture.generated.ts', 'store/useSystemStore.ts', 'components/apps/ExplorerApp.tsx']) {
        assert.ok(paths.includes(p), `${p} is in the graph`);
    }
    assert.deepEqual(SOURCE.violations, [], 'content/ and system/ must stay headless');
    assert.ok(SOURCE.checked.modules >= paths.filter((p) => p.startsWith('system/') || p.startsWith('content/')).length);

    const v = SOURCE.modules.find((m) => m.path === 'system/vfs.ts');
    assert.equal(v.layer, 'system');
    assert.match(v.summary, /^Virtual filesystem/);
    assert.ok(v.imports.some((i) => i.to === 'content/index.ts'));
    assert.deepEqual(v.packages, []);
    // Taking the first doc comment anywhere once labelled the store with its WindowPayload type's.
    assert.doesNotMatch(SOURCE.modules.find((m) => m.path === 'store/useSystemStore.ts').summary ?? '', /Launch argument/);
});

test('importing system/source mounts /usr/src, one file per module, with both halves of the graph', () => {
    assert.match(vfs.lookup('/usr/src/README').content, /it holds/i);
    const shell = vfs.lookup('/usr/src/system/shell.ts');
    assert.match(shell.content, /Imports \(\d+\)\n(.|\n)*system\/vfs\.ts/);
    assert.match(shell.content, /Imported by \(\d+\)/);
    assert.deepEqual(shell.open, { appId: 'sysinfo', payload: { module: 'system/shell.ts' } });
    assert.ok(vfs.listDir('/usr/src/components').some((n) => n.name === 'apps'));
});

test('a broken rule is reported, and a module nobody imports says why', () => {
    const rule = 'system/ must stay headless: system/a.ts -> components/x.tsx imports components/';
    const broken = {
        commit: 'abc1234',
        modules: [
            { path: 'app/page.tsx', layer: 'app', lines: 3, summary: null, imports: [], packages: [] },
            { path: 'system/a.ts', layer: 'system', lines: 10, summary: null, imports: [{ to: 'components/x.tsx', typeOnly: false, lazy: false }], packages: [] },
            { path: 'components/x.tsx', layer: 'components', lines: 5, summary: 'X.', imports: [], packages: [] },
        ],
        violations: [{ from: 'system/a.ts', to: 'components/x.tsx', rule }],
        checked: { modules: 2, imports: 1 },
    };
    vfs.mountSource(broken);
    try {
        const readme = vfs.lookup('/usr/src/README').content;
        assert.match(readme, /Checked over 2 modules and the 1 imports between them/);
        assert.ok(readme.includes(`Broken 1 time(s):\n  ${rule}`));
        assert.match(vfs.lookup('/usr/src/components/x.tsx').content, /Imported by \(1\)\n {2}system\/a\.ts/);
        assert.match(vfs.lookup('/usr/src/system/a.ts').content, /No doc comment describes this module as a whole/);
        assert.match(vfs.lookup('/usr/src/system/a.ts').content, /Imported by \(0\)\n {2}Nothing\. No module in this build imports it/);
        assert.match(vfs.lookup('/usr/src/app/page.tsx').content, /Next\.js loads it itself/);
    } finally {
        vfs.mountSource(SOURCE);
    }
});

/* ------------------------------------------------- review fixes (413692c) */

test('require(), a .js ending and a stylesheet cannot slip past the rule', async () => {
    const r = await analyse({
        'system/req.ts': "const D = require('@/components/os/Desktop');\nexport default D;\n",
        'system/pkg.ts': "const React = require('react');\nexport default React;\n",
        'system/js.ts': "import D from '@/components/os/Desktop.js';\nexport default D;\n",
        'system/css.ts': "import '@/app/luna.css';\nexport const x = 1;\n",
        'components/os/Desktop.tsx': 'export default function Desktop() { return null; }\n',
    });
    const why = Object.fromEntries(r.violations.map((v) => [v.from, v.rule]));
    assert.match(why['system/req.ts'], /imports components\//);
    assert.match(why['system/pkg.ts'], /uses the npm package react/);
    assert.match(why['system/js.ts'], /imports components\//);
    assert.match(why['system/css.ts'], /imports @\/app\/luna\.css, which is not a module the check can read/);
});

test('a type-only package import is erased and breaks nothing; ".." is a folder, not a package', async () => {
    const r = await analyse({
        'content/types.ts': "import type { LucideIcon } from 'lucide-react';\nimport { type ReactNode } from 'react';\nexport type I = LucideIcon | ReactNode;\n",
        'system/sub/a.ts': "import { b } from '..';\nexport const a = b;\n",
        'system/index.ts': 'export const b = 1;\n',
    });
    assert.deepEqual(r.violations, []);
    assert.deepEqual(moduleOf(r, 'system/sub/a.ts').packages, []);
    assert.deepEqual(moduleOf(r, 'system/sub/a.ts').imports.map((i) => i.to), ['system/index.ts']);
    // Shown as packages the module imports, for the graph; ignored by the rule.
    assert.deepEqual(moduleOf(r, 'content/types.ts').packages, ['lucide-react', 'react']);
});

test('one bad import is one violation, however many headless modules reach it', async () => {
    const r = await analyse({
        'content/profile.ts': "import '@/components/os/Desktop';\nexport const p = 1;\n",
        'content/index.ts': "export * from './profile';\n",
        'system/vfs.ts': "import { p } from '@/content';\nexport const v = p;\n",
        'system/shell.ts': "import { v } from './vfs';\nexport const s = v;\n",
        'components/os/Desktop.tsx': 'export default function Desktop() { return null; }\n',
    });
    assert.equal(r.violations.length, 1);
    assert.equal(r.violations[0].to, 'components/os/Desktop.tsx');
});

test('a type-only import does not make a lazily loaded module look eager', async () => {
    const r = await analyse({
        'constants/apps.ts': "import type { X } from '@/components/apps/X';\nexport const load = () => import('@/components/apps/X');\nexport type Y = X;\n",
        'components/apps/X.tsx': 'export type X = 1;\nexport default function A() { return null; }\n',
    });
    assert.deepEqual(moduleOf(r, 'constants/apps.ts').imports, [{ to: 'components/apps/X.tsx', typeOnly: false, lazy: true }]);
});

test('the comment a file opens with is its summary, however short', async () => {
    const r = await analyse({
        'components/apps/mediaplayer/playlist.ts': "/**\n * The Media Player's playlist.\n */\nexport interface Track { src: string }\n",
        'components/os/Screens.tsx': '"use client";\n\n/** The screens around a session. */\nexport function S() { return null; }\n',
    });
    assert.equal(moduleOf(r, 'components/apps/mediaplayer/playlist.ts').summary, "The Media Player's playlist.");
    assert.equal(moduleOf(r, 'components/os/Screens.tsx').summary, 'The screens around a session.');
});

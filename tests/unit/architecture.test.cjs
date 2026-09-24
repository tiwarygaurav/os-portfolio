/**
 * The module graph `scripts/gen-architecture.mjs` reads from the source (run by `pretest:unit`),
 * and /usr/src, where the VFS shows it. The first test is also the dependency rule from CLAUDE.md,
 * enforced: if content/ or system/ ever imports components/, app/, the store or React, it fails.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const vfs = require('../../.test-out/system/vfs.js');
const { SOURCE } = require('../../.test-out/system/source.js');

test('the generated graph covers the source, and the dependency rule holds', () => {
    const paths = SOURCE.modules.map((m) => m.path);
    for (const p of ['system/vfs.ts', 'system/shell.ts', 'system/bus.ts', 'store/useSystemStore.ts', 'components/apps/ExplorerApp.tsx']) {
        assert.ok(paths.includes(p), `${p} is in the graph`);
    }
    assert.deepEqual(SOURCE.violations, [], 'content/ and system/ must stay headless');

    const v = SOURCE.modules.find((m) => m.path === 'system/vfs.ts');
    assert.equal(v.layer, 'system');
    assert.ok(v.lines > 100);
    assert.match(v.summary, /^Virtual filesystem/);
    assert.ok(v.imports.some((i) => i.to === 'content/index.ts'));
    assert.deepEqual(v.packages, []);

    // A lazy registry import is recorded as one.
    const apps = SOURCE.modules.find((m) => m.path === 'constants/apps.ts');
    assert.ok(apps.imports.some((i) => i.to === 'components/apps/ExplorerApp.tsx' && i.lazy));
});

test('importing system/source mounts /usr/src, one file per module, with both halves of the graph', () => {
    assert.match(vfs.lookup('/usr/src/README').content, /it holds/);
    const shell = vfs.lookup('/usr/src/system/shell.ts');
    assert.match(shell.content, /Imports \(\d+\)\n(.|\n)*system\/vfs\.ts/);
    assert.match(shell.content, /Imported by \(\d+\)/);
    assert.deepEqual(shell.open, { appId: 'sysinfo', payload: { module: 'system/shell.ts' } });
    assert.ok(vfs.listDir('/usr/src/components').some((n) => n.name === 'apps'));
});

test('a broken rule is reported, and a module nobody imports says so', () => {
    const broken = {
        commit: 'abc1234',
        modules: [
            { path: 'system/a.ts', layer: 'system', lines: 10, summary: null, imports: [{ to: 'components/x.tsx', typeOnly: false, lazy: false }], packages: ['react'] },
            { path: 'components/x.tsx', layer: 'components', lines: 5, summary: 'X.', imports: [], packages: [] },
        ],
        violations: [{ from: 'system/a.ts', to: 'components/x.tsx', rule: 'system/ must not import components/' }],
    };
    vfs.mountSource(broken);
    try {
        assert.match(vfs.lookup('/usr/src/README').content, /Broken 1 time\(s\):\n {2}system\/a\.ts -> components\/x\.tsx/);
        assert.match(vfs.lookup('/usr/src/components/x.tsx').content, /Imported by \(1\)\n {2}system\/a\.ts/);
        assert.match(vfs.lookup('/usr/src/system/a.ts').content, /no doc comment/);
        assert.match(vfs.lookup('/usr/src/system/a.ts').content, /Imported by \(0\)\n {2}nothing/);
    } finally {
        vfs.mountSource(SOURCE);
    }
});

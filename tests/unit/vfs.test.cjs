const test = require('node:test');
const assert = require('node:assert/strict');

const vfs = require('../../.test-out/system/vfs.js');
const content = require('../../.test-out/content/index.js');

const procs = [{ pid: 'w1', appId: 'terminal', title: 'Command Prompt', state: 'running', zIndex: 10 }];

test('every listed path resolves', () => {
    const paths = vfs.allPaths(procs);
    assert.ok(paths.length > 20);
    for (const p of paths) {
        assert.ok(vfs.lookup(p.replace(/\/$/, ''), procs), `unresolvable: ${p}`);
    }
});

test('resolvePath handles ~, . and ..', () => {
    const home = vfs.HOME_PATH;
    assert.equal(vfs.resolvePath('/etc', '~'), home);
    assert.equal(vfs.resolvePath(home, 'projects/../about.md'), `${home}/about.md`);
    assert.equal(vfs.resolvePath(home, '../../..'), '/');
    assert.equal(vfs.resolvePath('/etc', './motd'), '/etc/motd');
});

test('every project is in the tree, and only non-public ones carry a disclosure', () => {
    for (const p of content.PROJECTS) {
        const dir = vfs.lookup(`${vfs.HOME_PATH}/projects/${p.id}`, []);
        assert.ok(dir && dir.kind === 'dir', p.id);
        const names = dir.children.map((c) => c.name);
        assert.equal(names.includes('DISCLOSURE.txt'), p.availability !== 'public', p.id);
    }
});

test('confidential projects expose no source links anywhere in the tree', () => {
    for (const p of content.PROJECTS.filter(content.isConfidential)) {
        const links = vfs.lookup(`${vfs.HOME_PATH}/projects/${p.id}/links.txt`, []);
        assert.doesNotMatch(links.content, /github\.com/i, p.id);
    }
});

test('/proc reflects exactly the processes supplied', () => {
    assert.deepEqual(vfs.listDir('/proc', procs).map((n) => n.name), ['w1']);
    assert.deepEqual(vfs.listDir('/proc', []), []);
    assert.match(vfs.lookup('/proc/w1/status', procs).content, /State\s+: running/);
});

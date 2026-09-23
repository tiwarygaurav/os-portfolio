/**
 * The headless shell, driven with no browser and no React — the property `system/CLAUDE.md`
 * claims for this layer, checked. A stub `ShellContext` stands in for the renderer.
 *
 * Note the stub's `closeProcess` rejects unknown pids: the original probe accepted any id, which
 * is exactly how the `ps`/`kill` pid collision slipped past it.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const shell = require('../../.test-out/system/shell.js');
const vfs = require('../../.test-out/system/vfs.js');
const bus = require('../../.test-out/system/bus.js');
const { PERSISTED_KEYS, PERSISTED_KEY_LABELS } = require('../../.test-out/store/persistence.js');

const APP_IDS = ['about', 'projects', 'terminal', 'resume', 'notepad'];
/**
 * A plain object literal, like the real `APPS` registry, so an unguarded `APPS[id]` lookup in the
 * stub would find `constructor` exactly as the renderer once did.
 */
const REGISTRY = Object.fromEntries(APP_IDS.map((id) => [id, { id }]));

function session() {
    const state = {
        cwd: vfs.HOME_PATH,
        history: [],
        procs: [
            { pid: 'w1', appId: 'terminal', title: 'Command Prompt', state: 'running', zIndex: 10 },
            { pid: 'w12', appId: 'projects', title: 'My Projects', state: 'minimized', zIndex: 11 },
        ],
        opened: [],
        closed: [],
    };
    const ctx = {
        get cwd() { return state.cwd; },
        history: () => state.history,
        processes: () => state.procs,
        appIds: () => APP_IDS,
        openApp: (id, payload) => {
            if (!Object.prototype.hasOwnProperty.call(REGISTRY, id)) return false;
            state.opened.push({ id, payload });
            return true;
        },
        closeProcess: (pid) => {
            if (!state.procs.some((p) => p.pid === pid)) return false;
            state.closed.push(pid);
            state.procs = state.procs.filter((p) => p.pid !== pid);
            return true;
        },
        openUrl: () => {},
        writeFile: () => 'read-only in this test',
        deleteFile: () => 'read-only in this test',
    };
    const run = (input) => {
        state.history.push(input);
        const r = shell.runCommand(input, ctx);
        if (r.cwd) state.cwd = r.cwd;
        return r;
    };
    const text = (r) =>
        r.lines.map((l) => (l.kind === 'pair' ? `${l.key}  ${l.value}` : l.kind === 'blank' ? '' : l.text)).join('\n');
    return { state, ctx, run, text };
}

test('history reads the live list, not a snapshot', () => {
    const s = session();
    s.run('ls');
    s.run('whoami');
    const out = s.text(s.run('history'));
    assert.match(out, /1\s+ls/);
    assert.match(out, /2\s+whoami/);
    assert.doesNotMatch(out, /No history yet/);
});

test('inherited object keys are not commands', () => {
    const s = session();
    for (const name of ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'CONSTRUCTOR']) {
        const out = s.text(s.run(name));
        assert.match(out, new RegExp(`${name}: command not found`), name);
    }
    assert.match(s.text(s.run('help constructor')), /no such command: constructor/);
});

test('open reports an unknown app instead of pretending', () => {
    const s = session();
    assert.match(s.text(s.run('open constructor')), /no app registered/);
    assert.equal(s.state.opened.length, 0);
});

test('open on a project path launches the Projects window on that project', () => {
    const s = session();
    s.run('open ~/projects/os-portfolio');
    assert.deepEqual(s.state.opened, [{ id: 'projects', payload: { projectId: 'os-portfolio' } }]);
});

test('ps columns stay separable for multi-digit pids, and kill uses them', () => {
    const s = session();
    const rows = s.run('ps').lines.filter((l) => l.kind === 'text').map((l) => l.text);
    const w12 = rows.find((r) => r.includes('My Projects'));
    assert.match(w12, /^w12\s+minimized\s+11\s+My Projects$/);

    assert.match(s.text(s.run('kill w12')), /Closed w12/);
    assert.deepEqual(s.state.closed, ['w12']);
    assert.match(s.text(s.run('kill w999')), /no such process/);
});

test('tree / includes the live /proc', () => {
    const s = session();
    const out = s.text(s.run('tree /'));
    assert.match(out, /proc\//);
    assert.match(out, /w1\//);
});

test('/etc/system.conf lists exactly the persisted keys', () => {
    const s = session();
    const out = s.text(s.run('cat /etc/system.conf'));
    const line = out.split('\n').find((l) => l.startsWith('persisted'));
    assert.equal(line, `persisted      = ${PERSISTED_KEYS.map((k) => PERSISTED_KEY_LABELS[k]).join(', ')}`);
});

test('role files keep their paragraph breaks', () => {
    const s = session();
    const out = s.text(s.run('cat ~/experience/here-technologies.md'));
    assert.match(out, /=+\n\nPeriod/);
    assert.match(out, /Stack[^\n]*\n\nWhat I worked on/);
});

test('Tab completion is relative to the working directory', () => {
    const s = session();
    s.run('cd ~/projects');
    const empty = shell.complete('ls ', s.ctx);
    assert.ok(empty.includes('os-portfolio/'), empty.join(' '));
    assert.ok(!empty.includes('etc/'));
    assert.deepEqual(shell.complete('cat os-', s.ctx), ['os-portfolio/']);
    assert.deepEqual(shell.complete('cd /et', s.ctx), ['/etc/']);
});

test('cat publishes a filesystem read on the bus, and events prints the log', () => {
    bus.clearLog();
    const s = session();
    s.run('cat ~/about.md');
    const log = bus.getLog();
    assert.equal(log.at(-1).event.type, 'fs:read');
    assert.equal(log.at(-1).event.path, '~/about.md');

    const out = s.text(s.run('events 5'));
    assert.match(out, /1 of 1 event in the log \(\d+ published this session\)/);
    assert.match(out, /Filesystem: Read ~\/about\.md\./);
    assert.match(s.text(s.run('events zero')), /not a positive count/);
});

test('every command in help runs without throwing', () => {
    const s = session();
    for (const name of shell.commandNames()) {
        if (name === 'clear') continue;
        assert.doesNotThrow(() => s.run(name), name);
    }
});

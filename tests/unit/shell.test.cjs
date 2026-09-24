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
    const s = session();
    // Published and then cleared: the log forgets it, the session total must not.
    s.run('cat ~/about.md');
    bus.clearLog();
    s.run('cat ~/about.md');
    const log = bus.getLog();
    assert.equal(log.at(-1).event.type, 'fs:read');
    assert.equal(log.at(-1).event.path, '~/about.md');

    const out = s.text(s.run('events 5'));
    // Exact: the header used to print the log's length as the session total, and \d+ matched that too.
    assert.match(out, new RegExp(`1 of 1 event in the log \\(${bus.publishedCount()} published this session\\)`));
    assert.ok(bus.publishedCount() > 1);
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

/* ------------------------------------------------------------------ pipes */

test('a pipe feeds one command\'s output to the next, with or without spaces', () => {
    const s = session();
    const projects = vfs.listDir(`${vfs.HOME_PATH}/projects`).length;
    assert.equal(s.text(s.run('ls ~/projects | wc -l')), String(projects));
    assert.equal(s.text(s.run('ls ~/projects|grep portfolio')), 'os-portfolio/', 'ls marks folders with /, as ls -F does');
    // grep matches text, not a regular expression: every folder line ends in "/".
    assert.equal(s.text(s.run('ls ~/projects | grep -v portfolio | grep -c /')), String(projects - 1));
    // A quoted | is text, not a pipe.
    assert.equal(s.text(s.run('echo "a | b"')), 'a | b');
});

test('head, tail, sort and cat read what is piped in, or a file', () => {
    const s = session();
    const stack = vfs.lookup(`${vfs.HOME_PATH}/projects/os-portfolio/stack.txt`).content.split('\n').filter(Boolean);
    assert.equal(s.text(s.run('cat ~/projects/os-portfolio/stack.txt | head -n 2')), stack.slice(0, 2).join('\n'));
    assert.equal(s.text(s.run('tail -1 ~/projects/os-portfolio/stack.txt')), stack[stack.length - 1]);
    assert.equal(s.text(s.run('cat ~/projects/os-portfolio/stack.txt | sort | head -n 1')), [...stack].sort((a, b) => a.localeCompare(b))[0]);
    assert.equal(s.text(s.run('ls ~/projects | cat | wc -l')), String(vfs.listDir(`${vfs.HOME_PATH}/projects`).length));
    assert.match(s.text(s.run('head -n x ~/about.md')), /invalid number of lines/);
    assert.match(s.text(s.run('wc')), /missing operand. Name a file, or pipe something in/);
});

test('find walks a folder by name and kind', () => {
    const s = session();
    const md = s.text(s.run('find ~ -name *.md -type f')).split('\n');
    assert.ok(md.length > 3);
    assert.ok(md.every((p) => p.endsWith('.md')));
    const dirs = s.text(s.run('find ~/projects -type d')).split('\n');
    assert.ok(dirs.includes('~/projects/os-portfolio'));
    assert.match(s.text(s.run('find /nowhere')), /No such file or directory/);
    assert.equal(s.text(s.run('find ~ -iname readme.MD | wc -l')), s.text(s.run('find ~ -name README.md | wc -l')));
});

test('a pipeline is a subshell: cd inside it stays there, and a broken pipe says so', () => {
    const s = session();
    s.run('cd /etc | ls');
    assert.equal(s.state.cwd, vfs.HOME_PATH);
    assert.match(s.text(s.run('ls |')), /syntax error near unexpected token `\|'/);
    assert.match(s.text(s.run('| ls')), /syntax error/);
    assert.match(s.text(s.run('ls > x.txt | wc')), /Only the last command in a pipeline/);
    // An error from an earlier stage still shows.
    assert.match(s.text(s.run('cat /nope | wc -l')), /no such file or directory/);
});

test('after a |, Tab completes a command name', () => {
    const s = session();
    assert.deepEqual(shell.complete('ls | gr', s.ctx), ['grep']);
    assert.deepEqual(shell.complete('ls ~/projects | hea', s.ctx), ['head']);
});

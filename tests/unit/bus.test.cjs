const test = require('node:test');
const assert = require('node:assert/strict');

const bus = require('../../.test-out/system/bus.js');

test.beforeEach(() => bus.clearLog());

test('publish appends a described entry and notifies subscribers', () => {
    let calls = 0;
    const off = bus.subscribe(() => calls++);
    const entry = bus.publish({ type: 'app:opened', appId: 'notepad', pid: 'w3', title: 'Untitled - Notepad' });
    off();
    bus.publish({ type: 'system:login' });

    assert.equal(calls, 1, 'unsubscribe must stop notifications');
    assert.equal(entry.log, 'Application');
    assert.equal(entry.source, 'WindowManager');
    assert.equal(entry.message, '"Untitled - Notepad" (w3) was opened.');
    assert.equal(bus.getLog().length, 2);
});

test('getLog returns a stable snapshot until something is published', () => {
    bus.publish({ type: 'system:boot' });
    const a = bus.getLog();
    assert.equal(bus.getLog(), a);
    bus.publish({ type: 'system:login' });
    assert.notEqual(bus.getLog(), a, 'useSyncExternalStore relies on a new identity per change');
});

test('the log is bounded and sequence numbers are never reused', () => {
    for (let i = 0; i < bus.LOG_LIMIT + 25; i++) bus.publish({ type: 'fs:read', path: `/f${i}` });
    const log = bus.getLog();
    assert.equal(log.length, bus.LOG_LIMIT);
    assert.equal(log.at(-1).event.path, `/f${bus.LOG_LIMIT + 24}`);

    const lastSeq = log.at(-1).seq;
    bus.clearLog();
    assert.equal(bus.getLog().length, 0);
    assert.ok(bus.publish({ type: 'system:boot' }).seq > lastSeq);
});

test('on() delivers only the requested type, once each', () => {
    const seen = [];
    const off = bus.on('recycle:deleted', (e) => seen.push(e.name));
    bus.publish({ type: 'recycle:deleted', name: 'Notepad' });
    bus.publish({ type: 'recycle:restored', name: 'Notepad' });
    bus.publish({ type: 'recycle:deleted', name: 'Paint' });
    off();
    bus.publish({ type: 'recycle:deleted', name: 'Calculator' });
    assert.deepEqual(seen, ['Notepad', 'Paint']);
});

test('failures and kills are warnings, and say who did it', () => {
    assert.equal(bus.describe({ type: 'shell:command', input: 'nope', ok: false }).level, 'warning');
    const kill = bus.describe({ type: 'app:killed', pid: 'w2', title: 'Paint', by: 'shell' });
    assert.equal(kill.level, 'warning');
    assert.equal(kill.source, 'Shell');
    assert.match(kill.message, /from the Command Prompt/);
});

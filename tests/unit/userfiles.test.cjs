/**
 * The visitor's writable folder (/home/guest), headless: validation, mounting, associations,
 * and the shell's file commands (redirection, touch, rm, df) against a stub that behaves like the
 * store — it validates through the same `validateUserPath` and mounts the result.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const vfs = require('../../.test-out/system/vfs.js');
const shell = require('../../.test-out/system/shell.js');

const DOCS = vfs.DOCUMENTS_PATH;

function session() {
    let files = {};
    vfs.mountUserFiles(files);
    const state = { cwd: vfs.GUEST_PATH, history: [] };
    const ctx = {
        get cwd() { return state.cwd; },
        history: () => state.history,
        processes: () => [],
        appIds: () => ['notepad', 'imageviewer'],
        openApp: () => true,
        closeProcess: () => false,
        openUrl: () => {},
        writeFile: (p, content) => {
            const problem = vfs.validateUserPath(p);
            if (problem) return problem;
            files = { ...files, [p]: { content, mime: vfs.mimeForName(p), modified: 1 } };
            vfs.mountUserFiles(files);
            return null;
        },
        deleteFile: (p) => {
            if (!files[p]) return 'The file does not exist.';
            files = { ...files };
            delete files[p];
            vfs.mountUserFiles(files);
            return null;
        },
    };
    const run = (input) => {
        const r = shell.runCommand(input, ctx);
        if (r.cwd) state.cwd = r.cwd;
        return r;
    };
    const text = (r) => r.lines.map((l) => (l.kind === 'pair' ? `${l.key}  ${l.value}` : l.kind === 'blank' ? '' : l.text)).join('\n');
    return { ctx, run, text, files: () => files };
}

test.afterEach(() => vfs.mountUserFiles({}));

test('only My Documents, My Pictures and the guest root are writable', () => {
    assert.equal(vfs.validateUserPath(`${DOCS}/notes.txt`), null);
    assert.equal(vfs.validateUserPath(`${vfs.PICTURES_PATH}/drawing.png`), null);
    assert.equal(vfs.validateUserPath(`${vfs.GUEST_PATH}/todo.txt`), null);
    assert.match(vfs.validateUserPath(`${vfs.HOME_PATH}/about.md`), /portfolio is read-only/);
    assert.match(vfs.validateUserPath(`${vfs.SAMPLE_PICTURES_PATH}/x.png`), /Sample Pictures is read-only/);
    assert.match(vfs.validateUserPath('/etc/hosts'), /only save in/);
    assert.match(vfs.validateUserPath(`${DOCS}/a?b.txt`), /cannot contain/);
    assert.match(vfs.validateUserPath(`${DOCS}/ spaced.txt`), /start or end with a space/);
    assert.match(vfs.validateUserPath(vfs.DOCUMENTS_PATH), /already exists/);
    assert.match(vfs.validateUserPath(`${DOCS}/${'x'.repeat(65)}`), /at most 64/);
});

test('mounted files appear in the tree with the right association', () => {
    vfs.mountUserFiles({
        [`${DOCS}/notes.txt`]: { content: 'hello', mime: 'text/plain', modified: 5 },
        [`${vfs.PICTURES_PATH}/me.png`]: { content: 'data:image/png;base64,AAAA', mime: 'image/png', modified: 6 },
    });
    const note = vfs.lookup(`${DOCS}/notes.txt`);
    assert.equal(note.content, 'hello');
    assert.equal(note.writable, true);
    assert.deepEqual(note.open, { appId: 'notepad', payload: { path: `${DOCS}/notes.txt` } });

    const pic = vfs.lookup(`${vfs.PICTURES_PATH}/me.png`);
    assert.equal(pic.src, 'data:image/png;base64,AAAA');
    assert.doesNotMatch(pic.content, /base64/, 'cat and grep must not see the data URL');
    assert.deepEqual(pic.open, { appId: 'imageviewer', payload: { path: `${vfs.PICTURES_PATH}/me.png` } });

    const names = vfs.listDir(vfs.PICTURES_PATH).map((n) => n.name);
    assert.deepEqual(names, ['Sample Pictures', 'me.png']);
});

test('built-in text files open in Notepad; built-in pictures are read-only', () => {
    const stack = vfs.lookup(`${vfs.HOME_PATH}/projects/os-portfolio/stack.txt`);
    assert.deepEqual(stack.open, { appId: 'notepad', payload: { path: `${vfs.HOME_PATH}/projects/os-portfolio/stack.txt` } });
    // Files that already had a window keep it.
    assert.equal(vfs.lookup(`${vfs.HOME_PATH}/about.md`).open.appId, 'about');
    const bliss = vfs.lookup(`${vfs.SAMPLE_PICTURES_PATH}/Bliss.jpg`);
    assert.equal(bliss.src, '/wallpapers/Bliss.jpg');
    assert.ok(!bliss.writable);
});

test('echo > writes, >> appends, and a quoted ">" is just text', () => {
    const s = session();
    s.run('cd "My Documents"');
    assert.deepEqual(s.run('echo hello world > note.txt').lines, []);
    assert.equal(s.files()[`${DOCS}/note.txt`].content, 'hello world\n');

    s.run('echo second line >> note.txt');
    assert.equal(s.files()[`${DOCS}/note.txt`].content, 'hello world\nsecond line\n');

    assert.match(s.text(s.run('echo "a > b"')), /^a > b$/);
    assert.equal(Object.keys(s.files()).length, 1);
    assert.match(s.text(s.run('cat note.txt')), /hello world\nsecond line/);
});

test('redirecting into the portfolio is refused, in the same words as Save As', () => {
    const s = session();
    const out = s.text(s.run(`echo nope > ${vfs.HOME_PATH}/about.md`));
    assert.match(out, /portfolio is read-only/);
    assert.equal(Object.keys(s.files()).length, 0);
});

test('command output can be captured, without hints or trailing blank lines', () => {
    const s = session();
    s.run(`cat ${vfs.HOME_PATH}/projects/os-portfolio/stack.txt > stack-copy.txt`);
    const copy = s.files()[`${vfs.GUEST_PATH}/stack-copy.txt`].content;
    assert.match(copy, /^TypeScript\n/);
    assert.doesNotMatch(copy, /Tip:/);
    assert.ok(!copy.endsWith('\n\n'));
});

test('touch creates, rm deletes, and neither touches the portfolio', () => {
    const s = session();
    s.run('touch empty.txt');
    assert.equal(s.files()[`${vfs.GUEST_PATH}/empty.txt`].content, '');
    assert.match(s.text(s.run(`rm ${vfs.HOME_PATH}/about.md`)), /Read-only file system/);
    assert.match(s.text(s.run('rm missing.txt')), /No such file or directory/);
    assert.match(s.text(s.run('rm "My Documents"')), /Is a directory/);
    assert.deepEqual(s.run('rm empty.txt').lines, []);
    assert.equal(Object.keys(s.files()).length, 0);
});

test('Tab completion quotes names with spaces and keeps them open on folders', () => {
    const s = session();
    const both = shell.complete('cd My', s.ctx);
    assert.deepEqual(both.sort(), ['"My Documents/', '"My Pictures/']);
    // Unquoted, `cd My D` is two arguments, as in any shell; the visitor types the quote.
    const one = shell.complete('cd "My D', s.ctx);
    assert.deepEqual(one, ['"My Documents/']);
    assert.equal(shell.applyCompletion('cd "My D', one[0]), 'cd "My Documents/');
    assert.equal(shell.applyCompletion('cd My', both[0]), `cd ${both[0]}`);
    // Continue inside the open quote.
    s.ctx.writeFile(`${DOCS}/plan.txt`, 'x');
    assert.deepEqual(shell.complete('cat "My Documents/pl', s.ctx), ['"My Documents/plan.txt"']);
});

test('df reports the real space the visitor files use', () => {
    const s = session();
    s.ctx.writeFile(`${DOCS}/big.txt`, 'x'.repeat(4096));
    const out = s.text(s.run('df'));
    assert.match(out, /localStorage/);
    assert.match(out, /\/home\/guest/);
    assert.ok(vfs.guestUsage() >= 4096);
});

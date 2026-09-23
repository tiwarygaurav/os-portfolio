/**
 * The visitor's writable folder (/home/guest), headless: validation, mounting, associations,
 * and the shell's file commands (redirection, touch, rm, mkdir, mv, cp, df) against a stub that
 * behaves like the store — it validates through the same `validateUserPath`, moves and deletes
 * folders through the same `planMove` / `planRemoveFolder`, and mounts the result.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const vfs = require('../../.test-out/system/vfs.js');
const shell = require('../../.test-out/system/shell.js');

const DOCS = vfs.DOCUMENTS_PATH;

function session() {
    let tree = { files: {}, folders: [] };
    const mount = () => vfs.mountUserFiles(tree.files, tree.folders);
    mount();
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
            const problem = vfs.validateUserPath(p) ?? vfs.validateUserContent(p, content);
            if (problem) return problem;
            tree = { ...tree, files: { ...tree.files, [p]: { content, mime: vfs.mimeForName(p), modified: 1 } } };
            mount();
            return null;
        },
        deleteFile: (p) => {
            if (!tree.files[p]) return 'The file does not exist.';
            const files = { ...tree.files };
            delete files[p];
            tree = { ...tree, files };
            mount();
            return null;
        },
        makeDir: (p) => {
            if (tree.files[p]) return 'A file with that name already exists.';
            const problem = vfs.validateUserPath(p, tree.folders);
            if (problem) return problem;
            tree = { ...tree, folders: [...tree.folders, p].sort() };
            mount();
            return null;
        },
        move: (from, to) => {
            const plan = vfs.planMove(tree, from, to);
            if (typeof plan === 'string') return plan;
            tree = plan;
            mount();
            return null;
        },
        removeDir: (p, recursive) => {
            const plan = vfs.planRemoveFolder(tree, p, recursive);
            if (typeof plan === 'string') return plan;
            tree = plan.tree;
            mount();
            return null;
        },
        copy: (from, to) => {
            const plan = vfs.planCopy(tree, from, to);
            if (typeof plan === 'string') return plan;
            tree = plan;
            mount();
            return null;
        },
    };
    const run = (input) => {
        const r = shell.runCommand(input, ctx);
        if (r.cwd) state.cwd = r.cwd;
        return r;
    };
    const text = (r) => r.lines.map((l) => (l.kind === 'pair' ? `${l.key}  ${l.value}` : l.kind === 'blank' ? '' : l.text)).join('\n');
    return { ctx, run, text, files: () => tree.files, folders: () => tree.folders };
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

test('touch keeps a picture intact; picture names accept only pictures', () => {
    const s = session();
    const png = 'data:image/png;base64,iVBORw0KGgo=';
    assert.equal(s.ctx.writeFile(`${vfs.PICTURES_PATH}/me.png`, png), null);
    s.run('touch "My Pictures/me.png"');
    assert.equal(s.files()[`${vfs.PICTURES_PATH}/me.png`].content, png, 'touch must not erase the data URL');

    assert.match(s.text(s.run('echo hello > "My Pictures/photo.png"')), /Only pictures can be saved/);
    assert.match(s.text(s.run('ls > "My Pictures/me.png"')), /Only pictures can be saved/);
    assert.equal(s.files()[`${vfs.PICTURES_PATH}/me.png`].content, png, '> must not overwrite a picture with text');
    assert.match(s.text(s.run('touch new.jpg')), /Only pictures can be saved/);
    assert.match(s.text(s.run(`cat "${vfs.SAMPLE_PICTURES_PATH}/Bliss.jpg" > copy.jpg`)), /Only pictures can be saved/);
});

test('a lone apostrophe is text, not an unclosed quote', () => {
    const s = session();
    assert.equal(s.text(s.run("echo it's here")), "it's here");
    s.run("echo I'm done > note.txt");
    assert.equal(s.files()[`${vfs.GUEST_PATH}/note.txt`].content, "I'm done\n");
    // A pair still quotes.
    assert.equal(s.text(s.run("echo 'a > b'")), 'a > b');
});

test('hints and completions quote paths the shell would otherwise split', () => {
    const s = session();
    s.ctx.writeFile(`${DOCS}/notes.txt`, 'hi');
    assert.match(s.text(s.run('cat "My Documents/notes.txt"')), /open "\/home\/guest\/My Documents\/notes\.txt"/);
    s.ctx.writeFile(`${DOCS}/it's.txt`, 'x');
    s.run('cd "My Documents"');
    const c = shell.complete('cat it', s.ctx);
    assert.deepEqual(c, [`"it's.txt"`]);
    assert.match(s.text(s.run(`cat ${c[0]}`)), /^x/);
});

/* ------------------------------------------------------------------ folders */

test('mkdir makes a folder that every surface sees, and files can be saved in it', () => {
    const s = session();
    s.run('cd "My Documents"');
    assert.deepEqual(s.run('mkdir Letters').lines, []);
    assert.deepEqual(s.folders(), [`${DOCS}/Letters`]);
    const node = vfs.lookup(`${DOCS}/Letters`);
    assert.equal(node.kind, 'dir');
    assert.equal(node.writable, true);

    s.run('echo Dear reader > Letters/draft.txt');
    assert.equal(s.files()[`${DOCS}/Letters/draft.txt`].content, 'Dear reader\n');
    assert.match(s.text(s.run('ls Letters')), /draft\.txt/);
    // Folders list before files, as Explorer sorts them.
    s.run('touch a.txt');
    assert.deepEqual(vfs.listDir(DOCS).map((n) => n.name), ['Letters', 'a.txt']);
});

test('mkdir -p makes the whole chain; without it a missing parent is named', () => {
    const s = session();
    assert.match(s.text(s.run('mkdir a/b')), new RegExp(`The folder ${vfs.GUEST_PATH}/a does not exist`));
    assert.deepEqual(s.run('mkdir -p a/b/c').lines, []);
    assert.deepEqual(s.folders(), ['/home/guest/a', '/home/guest/a/b', '/home/guest/a/b/c']);
    assert.deepEqual(s.run('mkdir -p a/b').lines, [], '-p is quiet about folders that exist');
    assert.match(s.text(s.run('mkdir a')), /File exists/);
});

test('mkdir is refused in the portfolio, in Sample Pictures, and over a file', () => {
    const s = session();
    assert.match(s.text(s.run(`mkdir ${vfs.HOME_PATH}/new`)), /portfolio is read-only/);
    assert.match(s.text(s.run(`mkdir "${vfs.SAMPLE_PICTURES_PATH}/Mine"`)), /Sample Pictures is read-only/);
    s.run('touch notes');
    assert.match(s.text(s.run('mkdir notes')), /File exists/);
    assert.match(s.text(s.run('mkdir "bad:name"')), /cannot contain/);
    assert.deepEqual(s.folders(), []);
});

test('mv renames a file, and the new name decides its type', () => {
    const s = session();
    s.run('echo # Title > notes.txt');
    assert.deepEqual(s.run('mv notes.txt notes.md').lines, []);
    assert.equal(s.files()['/home/guest/notes.txt'], undefined);
    assert.equal(s.files()['/home/guest/notes.md'].mime, 'text/markdown');
    assert.match(s.text(s.run('mv notes.md photo.png')), /Only pictures can be saved/);
});

test('mv moves a folder with everything in it, and never into itself', () => {
    const s = session();
    s.run('mkdir -p Work/2026');
    s.run('echo plan > Work/2026/plan.txt');
    s.run('echo top > Work/readme.txt');
    assert.deepEqual(s.run('mv Work "My Documents"').lines, []);
    assert.deepEqual(s.folders(), [`${DOCS}/Work`, `${DOCS}/Work/2026`]);
    assert.deepEqual(Object.keys(s.files()).sort(), [`${DOCS}/Work/2026/plan.txt`, `${DOCS}/Work/readme.txt`]);
    assert.match(s.text(s.run('cat "My Documents/Work/2026/plan.txt"')), /^plan/);

    assert.match(s.text(s.run('mv "My Documents/Work" "My Documents/Work/2026"')), /inside the folder being moved/);
    assert.match(s.text(s.run(`mv ${vfs.HOME_PATH}/about.md .`)), /read-only/);
    assert.match(s.text(s.run('mv "My Documents" Docs')), /read-only/);
    assert.match(s.text(s.run('mv missing.txt x.txt')), /No such file or directory/);
});

test('mv refuses to overwrite, and several sources need a folder', () => {
    const s = session();
    s.run('touch a.txt b.txt');
    assert.match(s.text(s.run('mv a.txt b.txt')), /already exists/);
    assert.match(s.text(s.run('mv a.txt b.txt c.txt')), /is not a directory/);
    s.run('mkdir box');
    assert.deepEqual(s.run('mv a.txt b.txt box').lines, []);
    assert.deepEqual(Object.keys(s.files()).sort(), ['/home/guest/box/a.txt', '/home/guest/box/b.txt']);
});

test('rmdir takes only an empty folder; rm -r takes it all; built-in folders stay', () => {
    const s = session();
    s.run('mkdir -p Old/inner');
    s.run('echo x > Old/inner/x.txt');
    assert.match(s.text(s.run('rmdir Old')), /Directory not empty/);
    assert.match(s.text(s.run('rm Old')), /Is a directory/);
    assert.deepEqual(s.run('rm -r Old').lines, []);
    assert.deepEqual(s.folders(), []);
    assert.deepEqual(Object.keys(s.files()), []);

    s.run('mkdir Empty');
    assert.deepEqual(s.run('rmdir Empty').lines, []);
    assert.match(s.text(s.run('rm -r "My Documents"')), /cannot be deleted/);
    assert.match(s.text(s.run(`rm -r ${vfs.HOME_PATH}/projects`)), /cannot be deleted/);
    assert.ok(vfs.lookup(vfs.DOCUMENTS_PATH));
});

test('cp copies a portfolio file into your folder, but not a built-in picture or a folder', () => {
    const s = session();
    assert.deepEqual(s.run(`cp ${vfs.HOME_PATH}/projects/os-portfolio/stack.txt "My Documents"`).lines, []);
    assert.match(s.files()[`${DOCS}/stack.txt`].content, /^TypeScript/);
    assert.match(s.text(s.run(`cp "${vfs.SAMPLE_PICTURES_PATH}/Bliss.jpg" "My Pictures"`)), /built-in picture\. It can be viewed, not copied/);
    assert.match(s.text(s.run('cp "My Documents" copy')), /Is a directory/);
    const png = 'data:image/png;base64,iVBORw0KGgo=';
    s.ctx.writeFile(`${vfs.PICTURES_PATH}/me.png`, png);
    s.run('cp "My Pictures/me.png" "My Pictures/me2.png"');
    assert.equal(s.files()[`${vfs.PICTURES_PATH}/me2.png`].content, png, 'a picture copies as the picture, not its description');

    // -r copies a folder you made, with what is in it; cp never overwrites.
    s.run('mkdir -p Box/inner');
    s.run('echo x > Box/inner/x.txt');
    assert.deepEqual(s.run('cp -r Box "My Documents"').lines, []);
    assert.equal(s.files()[`${DOCS}/Box/inner/x.txt`].content, 'x\n');
    assert.match(s.text(s.run('cp Box/inner/x.txt "My Documents/Box/inner/x.txt"')), /already exists/);
});

test('folders from storage are kept only when they could have been made', () => {
    const kept = vfs.sanitizeFolders([
        '/home/guest/a/b',        // parent listed later, still kept: parents are checked first
        '/home/guest/a',
        '/home/guest/orphan/x',   // no parent
        `${vfs.HOME_PATH}/hack`,  // the portfolio
        '/home/guest/bad:name',
        '/home/guest/a',          // duplicate
        42,
    ]);
    assert.deepEqual(kept, ['/home/guest/a', '/home/guest/a/b']);
    assert.deepEqual(vfs.sanitizeFolders('nope'), []);
});

test('New Folder names count up the way XP did', () => {
    const tree = { files: { '/home/guest/New Folder (3)': { content: '', mime: 'text/plain', modified: 1 } }, folders: ['/home/guest/New Folder'] };
    assert.equal(vfs.nextFolderName('/home/guest', tree), 'New Folder (2)');
    tree.folders = ['/home/guest/New Folder', '/home/guest/New Folder (2)'];
    assert.equal(vfs.nextFolderName('/home/guest', tree), 'New Folder (4)');
    assert.equal(vfs.nextFolderName(vfs.DOCUMENTS_PATH, tree), 'New Folder');
});

test('a folder counts toward the quota, and a file in a missing folder is refused', () => {
    assert.equal(vfs.userFilesSize({}, ['/home/guest/abc']), '/home/guest/abc'.length);
    assert.match(vfs.validateUserPath('/home/guest/nowhere/x.txt'), /The folder \/home\/guest\/nowhere does not exist/);
    assert.match(vfs.validateUserPath('/home/guest/a/x.txt', []), /does not exist/);
    assert.equal(vfs.validateUserPath('/home/guest/a/x.txt', ['/home/guest/a']), null);
});

/* ------------------------------------------------------------------ recycle bin */

const note = (content) => ({ content, mime: 'text/plain', modified: 1 });

test('the Recycle Bin takes a folder with everything in it, and gives it all back', () => {
    const tree = {
        files: { '/home/guest/A/x.txt': note('x'), '/home/guest/A/B/y.txt': note('y'), '/home/guest/keep.txt': note('k') },
        folders: ['/home/guest/A', '/home/guest/A/B'],
    };
    const r = vfs.planRecycle(tree, '/home/guest/A');
    assert.deepEqual(Object.keys(r.tree.files), ['/home/guest/keep.txt']);
    assert.deepEqual(r.tree.folders, []);
    assert.deepEqual([...r.taken.folders].sort(), ['/home/guest/A', '/home/guest/A/B']);
    assert.ok(vfs.recycledSize([r.taken]) > 0);

    const back = vfs.planRestore(r.tree, r.taken);
    assert.deepEqual(back.folders, tree.folders);
    assert.deepEqual(Object.keys(back.files).sort(), Object.keys(tree.files).sort());
});

test('restoring makes again the folders that have gone, and never overwrites', () => {
    const tree = { files: { '/home/guest/A/B/y.txt': note('y') }, folders: ['/home/guest/A', '/home/guest/A/B'] };
    const { taken } = vfs.planRecycle(tree, '/home/guest/A/B/y.txt');

    // Its folders were deleted since: they come back with it.
    const back = vfs.planRestore({ files: {}, folders: [] }, taken);
    assert.deepEqual(back.folders, ['/home/guest/A', '/home/guest/A/B']);
    assert.equal(back.files['/home/guest/A/B/y.txt'].content, 'y');

    // Something new stands where it was: refused, with what is in the way.
    const taken2 = vfs.planRestore({ files: { '/home/guest/A/B/y.txt': note('new') }, folders: tree.folders }, taken);
    assert.match(taken2, /already a file or folder named y\.txt in \/home\/guest\/A\/B/);
    // A file now has the name of a folder on the way.
    assert.match(vfs.planRestore({ files: { '/home/guest/A': note('f') }, folders: [] }, taken), /named A in \/home\/guest/);
});

test('only the visitor\'s own files and folders go to the Recycle Bin', () => {
    const empty = { files: {}, folders: [] };
    assert.match(vfs.planRecycle(empty, `${vfs.HOME_PATH}/about.md`), /cannot be deleted/);
    assert.match(vfs.planRecycle(empty, vfs.DOCUMENTS_PATH), /cannot be deleted/);
    assert.match(vfs.planRecycle(empty, '/home/guest/nope.txt'), /Cannot find/);
});

test('df counts what the Recycle Bin holds, and says so', () => {
    const s = session();
    vfs.mountUserFiles(s.files(), s.folders(), 5000);
    assert.equal(vfs.recycledUsage(), 5000);
    assert.match(s.text(s.run('df')), /5K of that is in the Recycle Bin/);
});

/* ------------------------------------------------------------------ copy */

test('copying names the copy the way XP did when the name is taken', () => {
    const tree = { files: { '/home/guest/a.txt': note('a'), '/home/guest/Copy of a.txt': note('c') }, folders: [] };
    vfs.mountUserFiles(tree.files, tree.folders);
    assert.equal(vfs.copyName('/home/guest', 'b.txt', tree), 'b.txt');
    assert.equal(vfs.copyName('/home/guest', 'a.txt', tree), 'Copy (2) of a.txt');
    assert.equal(vfs.copyName(vfs.DOCUMENTS_PATH, 'a.txt', tree), 'a.txt');
});

test('a copy takes a folder with everything in it, and a portfolio file as text', () => {
    const tree = { files: { '/home/guest/A/x.txt': note('x') }, folders: ['/home/guest/A'] };
    vfs.mountUserFiles(tree.files, tree.folders);
    const copied = vfs.planCopy(tree, '/home/guest/A', `${vfs.DOCUMENTS_PATH}/A`);
    assert.deepEqual(copied.folders, ['/home/guest/A', `${vfs.DOCUMENTS_PATH}/A`]);
    assert.equal(copied.files[`${vfs.DOCUMENTS_PATH}/A/x.txt`].content, 'x');
    assert.equal(copied.files['/home/guest/A/x.txt'].content, 'x', 'the original stays');

    const stack = vfs.planCopy(tree, `${vfs.HOME_PATH}/projects/os-portfolio/stack.txt`, '/home/guest/stack.txt');
    assert.match(stack.files['/home/guest/stack.txt'].content, /^TypeScript/);
});

test('a copy refuses what storage cannot hold, the portfolio\'s folders, and overwriting', () => {
    const tree = { files: { '/home/guest/a.txt': note('a') }, folders: ['/home/guest/A'] };
    vfs.mountUserFiles(tree.files, tree.folders);
    assert.match(vfs.planCopy(tree, `${vfs.SAMPLE_PICTURES_PATH}/Bliss.jpg`, '/home/guest/Bliss.jpg'), /built-in picture/);
    assert.match(vfs.planCopy(tree, `${vfs.HOME_PATH}/projects`, '/home/guest/projects'), /part of the portfolio/);
    assert.match(vfs.planCopy(tree, '/home/guest/A', '/home/guest/A/inner'), /inside the folder being copied/);
    assert.match(vfs.planCopy(tree, '/home/guest/a.txt', '/home/guest/A'), /already exists/);
    assert.match(vfs.planCopy(tree, '/home/guest/a.txt', `${vfs.HOME_PATH}/a.txt`), /portfolio is read-only/);
});

# system/ — the headless runtime

The OS primitives that make this more than a skin: a virtual filesystem and a shell. Both are
plain TypeScript. Neither imports React, touches the DOM, or knows what a pixel is.

## Why headless is the whole point

- **One dataset, two front ends.** The GUI apps and the terminal both read `system/vfs`, so
  `cat ~/experience/vxo-digital.md` and the Experience window are physically incapable of
  disagreeing. That was the failure mode of the old design.
- **Testable without a browser.** These modules can be compiled to CommonJS and driven from Node
  — that is how the command set is verified. A shell that required React could not be.
- **Explainable.** "Content is a tree, the shell walks it, the renderer paints `ShellLine[]`" fits
  on a whiteboard. That matters more than any visual effect this project could add.

## Files

### `vfs.ts`

Builds a `VDir` tree from `content/` **once** at module load (content is static; rebuilding per
call would be waste). `/proc` is the exception — it is generated per call from a `ProcEntry[]` the
caller supplies, because live windows are not static and the VFS must not import the store.

```
/home/gaurav/   README.md about.md skills.md education.md contact.md resume
                experience/<role-id>.md
                projects/<project-id>/{README.md,stack.txt,links.txt}
                links/<network>
/etc/           motd  system.conf      <- the real stack, generated from the repo
/var/log/       boot.log               <- what actually happens on boot, including the honest
                                          admission that the 4.5s delay is theatre
/proc/<pid>/    status                 <- live windows
```

Key exports: `resolvePath` (handles `~`, `.`, `..`), `lookup`, `listDir`, `renderTree`,
`searchFiles`, `allPaths`.

**A file may carry `open: { appId, payload }`.** That is the hinge between shell and GUI: it lets
`open ~/projects/os-portfolio` and double-clicking an icon resolve to the same action. Set it whenever
a path has a window that represents it.

### `shell.ts`

A command table plus a parser. `runCommand(input, ctx)` returns `ShellResult` — an array of
`ShellLine` variants (`text` / `muted` / `error` / `success` / `heading` / `pair` / `entry` /
`link` / `blank`), never a string of markup. `complete(input, ctx)` powers Tab.

Side effects go through `ShellContext`, supplied by the renderer:

```ts
cwd: string
history()    -> string[]           // live; see below
processes()  -> ProcEntry[]        // live windows
appIds()     -> string[]           // registered apps
openApp(id, payload?) -> boolean   // false when unregistered, so the shell can say so
closeProcess(pid)     -> boolean
openUrl(url)
```

**Everything live is a function.** `history` was once a plain array, and the renderer memoised the
context, so the shell held a snapshot taken before any command had been typed — `history` printed
"No history yet." for an entire session while Up-arrow happily walked the same commands. If a
field can change after the context is built, it is a getter.

`COMMANDS` has a **null prototype**, and `APPS` lookups in the renderer are guarded with
`hasOwnProperty`. With a plain object literal, `COMMANDS['constructor']` returned `Object`'s
constructor, passed the truthiness guard and threw out of a React event handler, so the terminal
printed nothing at all. Any table indexed by user input needs the same treatment.

The traversal functions (`lookup`, `listDir`, `renderTree`, `searchFiles`, `allPaths`) all walk
one `rootFor(procs)` composition. They used to assemble the root separately and `renderTree`
forgot `/proc`, so `ls /` showed the process table and `tree /` did not.

### The visitor's files (`vfs.ts`)

`/home/guest` is mounted from outside: the store calls `mountUserFiles(files)` whenever its
`userFiles` change, and `rootFor` composes `/home` from the static owner's home plus that mount.
`validateUserPath` is the single rule for what may be written (only My Documents, My Pictures and the
guest root; XP's invalid characters; 64-char names); the shell's `>`, `touch`, `rm` and the store's
`writeUserFile` all go through it. Images keep their data: URL in `src` and a one-line description in
`content`, so `cat` and `grep` never print base64. `ShellContext` gained `writeFile` / `deleteFile`,
and `closeProcess(pid, 'kill' | 'exit')` so an ordinary `exit` is not logged as a forced end.

### `bus.ts`

The event bus: a closed `SystemEvent` union, an exhaustive `describe()` that turns each into an
Event Viewer row (log, level, source, category, code, message), and a bounded in-memory log with
`publish` / `subscribe` / `on` / `getLog` / `clearLog`. `getLog()` returns the same array until
something is published, which is what React's `useSyncExternalStore` needs. No imports at all.

Events describe what *happened*, never what should happen. Add a variant only when some code will
really publish it, and give it a `describe()` case in plain words.

## Rules

1. **No React, no DOM, no styling.** If you need a colour, you are in the wrong layer — add a
   `ShellLine` variant and let the renderer decide.
2. **Adding a command must not require touching `TerminalApp.tsx`.** If it does, the abstraction
   leaked.
3. **Commands report honestly.** `openApp` returns a boolean specifically so `open foo` can say
   "no app registered under that id" rather than pretending. No command may claim it did
   something it did not do.
4. **No fake commands.** Every command either reveals real data, causes a real effect, or exposes
   how the system works. Nothing exists to pad the `help` output.
5. **Paths are real.** `pwd` must print somewhere `cd` can reach. The old terminal printed
   `C:\Users\Gaurav\Desktop`, which existed nowhere.
6. **`content/` is the only data source.** Never hardcode a fact into a command. The one other
   import allowed here is `store/persistence.ts` — pure data, no React, no store — which
   `/etc/system.conf` renders so the persisted-key list cannot drift from what `partialize`
   actually saves. Importing the store itself is still forbidden.

## Verifying a change

The layers compile to CommonJS and run under Node with the `@/` alias rewritten. Drive
`runCommand` against a stub `ShellContext` and check the emitted lines — no browser needed. That
round trip is the reason to keep this directory pure.

This is committed now: `npm run test:unit` (`tests/unit/`). It compiles with
`tests/unit/tsconfig.json`, maps `@/` via `tests/unit/alias.cjs`, and runs on `node:test`. The stub
`ShellContext` rejects unknown pids on purpose — see below.

**A headless pass is not a UI pass.** The `ps`/`kill` pid defect was invisible to this probe
because the stub `closeProcess` accepted any id; only driving the real browser found it. Use both.

## Not built yet

`sudo` / root access, and the module-graph source that the future Architecture viewer will
read. `sudo` currently states plainly that it is not wired up rather than pretending to fail.

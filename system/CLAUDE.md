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
processes()  -> ProcEntry[]        // live windows
appIds()     -> string[]           // registered apps
openApp(id, payload?) -> boolean   // false when unregistered, so the shell can say so
closeProcess(pid)     -> boolean
openUrl(url)
```

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
6. **`content/` is the only data source.** Never hardcode a fact into a command.

## Verifying a change

The layers compile to CommonJS and run under Node with the `@/content` alias rewritten. Drive
`runCommand` against a stub `ShellContext` and check the emitted lines — no browser needed. That
round trip is the reason to keep this directory pure.

## Not built yet

`sudo` / root access, the event bus for app-to-app messaging, and the module-graph source that
the future Architecture viewer will read. `sudo` currently states plainly that it is not wired up
rather than pretending to fail for effect.

# Roadmap — architecture requirements

Written at the end of the P1 honesty pass, before any visual work. This is a **requirements**
document, not a plan of record: it states what each subsystem must be able to do so that the
visual phase does not have to re-architect anything underneath it.

The ordering principle: **every item below must be expressible in terms of the existing
`content/` -> `system/` -> `components/` layering.** If something needs a new source of truth, it
is wrong.

---

> **Status, 2026-09-03.** Sections 1, 2, 4 and 9 are built and verified. What remains open is
> marked below. Read this together with the decision log in `CLAUDE.md` §8.

## 0. What already exists (do not rebuild)

| Primitive | Where | Status |
| --- | --- | --- |
| Typed canonical content | `content/` | Complete for profile, roles, projects, skills, education |
| Provenance / uncertainty | `content/types.ts` `Sourced<T>` | Complete |
| Virtual filesystem | `system/vfs.ts` | Complete; `/proc` is live |
| Headless shell | `system/shell.ts` | 22 commands, returns `ShellLine[]` |
| Window manager | `store/useSystemStore.ts` | z-order bounded, clamped, minimise/maximise lossless |
| App registry | `constants/apps.ts` | **Unified.** Metadata + lazy component + surfaces + Run aliases |
| XP message boxes | `components/os/Dialog.tsx`, `utils/dialog.ts` | Complete; no native dialogs remain |
| Run dialog | `components/os/RunDialog.tsx` | Complete; resolves apps, paths and URLs |
| Task Manager | `components/apps/TaskManagerApp.tsx` | Complete; End Task and Switch To are real |
| Error boundary | `components/os/ErrorBoundary.tsx` | Complete; renders the real exception as a stop screen |
| Mobile shell | `utils/viewport.ts` + responsive chrome | Complete for phones; tablet is still the desktop model |
| Launch payloads | `WindowPayload` | Shell -> GUI works today (`open ~/projects/<id>`) |

---

## 1. Application registry — unify the split  ✅ DONE

**Problem.** An app is defined in two places: `constants/apps.ts` (metadata) and
`components/os/Window.tsx` (`APP_COMPONENTS`). Forgetting the second fails silently at runtime,
and the static import list forces all fifteen apps into the initial bundle.

**Requirement.** One registry entry per app carrying metadata *and* a lazy component reference:

```ts
interface AppDefinition {
  id: string; title: string; icon: LucideIcon; iconAsset?: string;
  window: { width: number; height: number; canResize: boolean; canMaximize: boolean };
  category: 'portfolio' | 'system' | 'tool' | 'toy';
  load: () => Promise<{ default: AppComponent }>;   // next/dynamic
  /** VFS path this app represents, so open-from-shell and open-from-icon agree. */
  path?: string;
  /** Whether the app appears in the command palette / Start menu / desktop. */
  surfaces: Array<'desktop' | 'start' | 'palette'>;
}
```

**Consequences.** Enables code splitting (P4), drives the command palette for free, and lets the
VFS derive `open` hints from the registry instead of hardcoding `appId` strings in `vfs.ts`.

---

## 2. Command palette  ✅ DONE (as the XP Run dialog)

**Requirement.** One keystroke (`Ctrl/Cmd+K`) opens a search over a single index built from:
app registry entries · every VFS path · project ids · skill names · shell command names.

**Constraints.** The index must be *derived*, never hand-maintained. Selecting a result performs
the same action the corresponding surface would (`open`), so behaviour cannot diverge.

**Why it matters.** It is the single highest-value fix for Layer A discoverability: thirteen
equally-weighted desktop icons currently give a recruiter no route to "resume" except reading
them all.

---

## 3. Application interoperability — a real event bus  ✅ DONE (consumed by the Event Viewer and `events`)

Today interop is one-directional and implicit: a caller passes a `WindowPayload`. That covers
"open X focused on Y" and nothing else.

**Requirement.** A small typed bus in `system/bus.ts`, headless like the rest:

```ts
type SystemEvent =
  | { type: 'app:opened'; appId: string; pid: string }
  | { type: 'app:closed'; pid: string }
  | { type: 'selection:project'; projectId: string }
  | { type: 'selection:skill'; skill: string }
  | { type: 'fs:read'; path: string }
  | { type: 'shell:command'; input: string };

publish(e: SystemEvent): void
subscribe<T extends SystemEvent['type']>(type: T, fn: (e: Extract<SystemEvent,{type:T}>) => void): () => void
```

**Rules.**
- Events describe *what happened*, never *what should happen*. No `{ type: 'openProjects' }`.
- Every subscription returns an unsubscribe and must be torn down on unmount.
- The bus is observable: the System Monitor renders the live event stream. That is the payoff —
  a visitor watching windows talk to each other is the clearest possible demonstration that this
  is a system rather than a set of pages.

**First three consumers.** System Monitor (renders the stream) · Projects (highlights the project
a skill selection refers to) · Terminal (echoes events as a log when a `--verbose` mode is on).

---

## 4. System Monitor  ✅ DONE (as the XP Task Manager)

**Requirement.** An app that reads *only* live state — no invented telemetry, ever:

- **Processes**: the `windows` array, projected exactly as `/proc` already does (pid, app, state,
  z-order, uptime derived from an `openedAt` field to be added to `AppWindow`).
- **Events**: the last N bus events, live.
- **Store**: the current Zustand state tree, rendered as an inspectable object.
- **Memory**: `performance.memory` where the browser exposes it, and the string "unavailable"
  where it does not. Never a fabricated bar.

**Hard rule.** If a metric cannot be read from the browser or the store, it does not appear. The
previous version of this project had a network panel reporting `867 Mbps` on a fixed string; that
class of decoration is what this app exists to disprove.

---

## 5. Filesystem explorer  ✅ DONE

**Requirement.** A GUI over `system/vfs.ts` — tree pane, file pane, breadcrumb — with the
property that **anything visible in the explorer is reachable by the same path in the shell**,
and vice versa. `open` on a node with an `open` hint launches the owning app.

**Why.** It makes the "the terminal is not a toy" claim legible to a non-technical visitor, who
will never type `ls`.

---

## 6. Project explorer — beyond the detail pane

The current Projects window is honest and complete but still fundamentally a list plus a detail
page. Phase 3 targets one *artifact* per project, chosen to fit that project rather than a
template applied to all four:

| Project | Artifact |
| --- | --- |
| Bypass-lane graph | An interactive road-graph canvas: nodes, edges, and the distance/os-portfolio features drawn on them. Synthetic geometry, clearly labelled as illustrative — it demonstrates the *idea* without disclosing employer data. |
| URL shortener | A working in-browser short-code generator showing collision handling — the algorithm is the owner's own, so it can genuinely run. |
| the desktop | The architecture viewer (§7). |
| Enterprise modules | Stays a written case study; there is nothing publishable to visualise. |

**Constraint.** Where an artifact uses invented inputs, the UI must say so on the artifact itself,
not in a footnote.

---

## 7. Architecture viewer

**Requirement.** A rendered graph of this application's own module structure —
`content/ -> system/ -> store/ -> components/os -> components/apps` — where clicking a node shows
what that module actually does and which files it contains.

**Constraint.** The graph must be **generated from the repository**, not hand-drawn, or it will
rot within two commits. A build-time script emitting `system/architecture.generated.ts` from the
import graph is the intended approach.

---

## 8. Workspaces

**Requirement.** Named window sets a visitor can switch between, e.g. "Recruiter" (Resume,
Projects, Contact) and "Engineer" (Terminal, System Monitor, Architecture). Switching preserves
each workspace's window geometry.

**Why it earns its place.** It is the mechanism that finally serves both audiences without
compromise: Layer A gets a curated arrangement on arrival, Layer B gets somewhere to go.

**Store impact.** `windows` becomes `workspaces: Record<string, AppWindow[]>` plus an
`activeWorkspace`. Persistence must remain preferences-only — workspace *contents* are session
state, workspace *definitions* are not.

---

## 9. Responsive / mobile shell  ✅ DONE for phones

**Requirement.** Not a scaled-down desktop. Three deliberate modes:

| Breakpoint | Model |
| --- | --- |
| Desktop (>=768px) | Full window manager as today |
| Phone (<768px) | **Built.** Windows open maximised and stay that way, so the taskbar is the app switcher. Icons open on a single tap. The login screen, Start menu, task panes and explorer sidebars all stack. |

The card-stack idea was rejected: it would have been a second presentation of the same content,
which §9's own constraint forbids, and it would have thrown away the XP identity on the device
where most visitors arrive. One window at a time *is* the XP answer to a small screen.

**Constraint.** All three read the same `content/` and the same registry. A mobile-only copy of
any content is a defect.

**Still open:** a genuine tablet tier between the two, and touch gestures beyond tap (long-press
opens the context menu on Android but not reliably on iOS).

---

## 10. Keeping the XP identity intact

The Windows XP look is the identity, not a placeholder. It stays.

**Requirement for every item above:** new surfaces adopt the existing XP grammar — beige `#ece9d8`
control chrome, blue `#245edb` taskbar, title-bar gradients, 3-D bevels, Tahoma. A new app must
look like it shipped with the rest of the desktop.

**What may still change:** the *scattering* of those values. Colours currently live inline in
forty components, so nothing can be adjusted consistently. Moving them into tokens does not change
how the desktop looks — it makes the XP palette a single definition instead of forty copies, and
lets the Display Properties Themes tab (removed because it drove nothing) come back as a real
control offering the genuine XP themes: Blue, Olive Green and Silver.

**Explicitly rejected:** re-skinning away from XP, replacing the wallpaper with something
non-XP, or renaming the environment. Those were explored and reversed on the owner's
instruction — see `CLAUDE.md` §8.

## 11. Design tokens (consolidation, not re-design)  ✅ DONE for the Luna chrome (`--luna-*`, three schemes)

Colour, elevation, radius, spacing and typography move out of per-component inline gradients into
CSS variables plus a Tailwind theme extension — **with exactly the values the components use
today**. The desktop looks identical afterwards; the difference is that the XP palette becomes one
definition instead of forty, which is what makes the Themes tab implementable.

## Suggested order

1. §1 registry unification (unblocks §2 and code splitting)
2. §2 command palette (biggest wayfinding win for recruiters)
3. §3 event bus + §4 System Monitor (biggest win for technical visitors)
4. §11 tokens, then the Themes tab as a real control
5. §9 mobile
6. §5–7 explorer / artifacts / architecture viewer
7. §8 workspaces

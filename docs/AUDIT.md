# Standing Audit — os-portfolio

Assessed 2026-08-19 against the working tree. Every item was read in source, not inferred.
**Updated 2026-08-20** after the P1 honesty pass — resolved items are struck through with a note;
the original finding is kept so the record of what was wrong survives.

Severity: **S1** breaks trust or function for a visitor · **S2** real defect, degraded experience ·
**S3** debt / risk that will bite later.

## Status after P1

| Section | Resolved | Open |
| --- | --- | --- |
| §2 Correctness | C1, C2, C3, C4, C5, C6, C7, C8, C9, C11, C13 | C10, C12 |
| §3 Honesty | **all** (H1–H7) | — |
| §4 Dead UI | ~25 controls removed or made real | 10 `alert()`/`confirm()` calls remain — they work, but an XP-styled dialog would fit better |
| §5 Architecture | A1, A5 (partial), A8, A11, A12 | A2, A3 (partial), A6, A7, A9, A10 |
| §6 Performance | — | P2, P3, P4, P5, P6. P1 (media size) is accepted by the owner, not a defect |
| §7–9 UX / a11y / visual | — | all open; P2 and P4 phases |

The media-licensing item (P1) is closed as **accepted by the owner** — the playlist, the XP
startup sound and the XP logo assets ship deliberately. See `CLAUDE.md` §9; do not re-open it.

---

## 1. Strengths worth preserving

| Area | Why it is good |
| --- | --- |
| Window manager | Clean separation of window *state* (store) from window *chrome* (component). Drag, resize, maximize, focus, minimize, taskbar round-trip all work. This is the load-bearing system and it is sound. |
| App registry | `constants/apps.ts` already centralises id/title/icon/size/capabilities. The right instinct, already half-built. |
| Minesweeper | Genuinely complete: first-click-safe mine placement, flood-fill reveal, flagging, win detection, timer. Correct code. |
| Calculator | Complete incl. memory, `1/x`, `sqrt`, `%`, backspace, error handling. |
| Persistence design | `partialize` deliberately persists preferences but *not* session/window state. Considered, not accidental. |
| Custom icon set | Real `.ico`/`.png` assets, not generic glyphs. This is a big part of the current charm. |
| Login screen | The most visually accomplished screen in the project — CRT grain, gradient falloff, correct proportions. |
| Recycle bin | Delete/restore/empty actually mutate real state and persist. A working simulation, not a mock. |

**Rule for the rewrite: none of the above gets thrown away.**

---

## 2. Correctness defects

| # | Sev | Where | Defect |
| --- | --- | --- | --- |
| C1 | S1 | `components/apps/ResumeApp.tsx:22` | Download links `/resume/kumar-gaurav-resume.pdf`. `public/resume/` does not exist -> 404. The single most important recruiter action fails. |
| C2 | S1 | `components/apps/ContactApp.tsx:12-21` | Form is a `setTimeout` that reports "Sent!". No transport. A visitor who writes a message believes it was delivered. |
| C3 | S1 | `components/os/BootScreen.tsx:29-42` | "Press any key or click to boot" — there is no `keydown` listener. Only click works. First interaction in the product lies. |
| C4 | S2 | `store/useSystemStore.ts:159` | `restoreWindow` sets `isMaximized: false`. Restoring a *minimized* maximized window from the taskbar silently un-maximizes it. Minimize/restore is not lossless. |
| C5 | S2 | `store/useSystemStore.ts:145-152` | `focusWindow` increments `nextZIndex` without bound; taskbar is `z-50`, windows start at `z-10`. After ~40 focus changes windows render **over** the taskbar and the OS breaks. |
| C6 | S2 | `store/useSystemStore.ts:157-162` | `restoreWindow` increments `nextZIndex` but never writes the window's own `zIndex` — restore does not reliably raise the window. |
| C7 | S2 | `components/os/Window.tsx:113` | Maximized height is `calc(100% - 40px)`; the taskbar is `h-9` (36 px). Permanent 4 px strip of desktop under every maximized window. |
| C8 | S2 | `components/os/Window.tsx` (drag), `DesktopIcon.tsx` (drag) | No viewport clamping on either. A window or icon can be dragged fully off-screen and becomes unreachable — and icon positions **persist**, so the loss survives reload. |
| C9 | S2 | `components/os/Desktop.tsx:88-103` | Konami listener does not check whether focus is in an input. Typing `b` then `a` after arrow keys inside the terminal or Notepad can fire the easter egg. |
| C10 | S3 | `components/os/Desktop.tsx:124-131` | Icon grid is laid out from `window.innerHeight` at render time with no resize listener. Resizing the browser never re-flows icons. |
| C11 | S3 | `components/apps/MusicPlayerApp.tsx:38` | `audio.play()` is a promise; unhandled rejection when autoplay is blocked, and `isPlaying` is flipped optimistically so UI and audio desync. |
| C12 | S3 | `components/apps/NotepadApp.tsx:71-77` | Built on `document.execCommand` (deprecated); `paste` is blocked by every modern browser — silently does nothing. |
| C13 | S3 | `components/os/Window.tsx:48` | The component names its prop `window`, shadowing the global. Any future `window.*` use inside this file silently resolves to the prop. |

---

## 3. Honesty defects (portfolio-specific, and the most damaging class)

| # | Sev | Where | Defect |
| --- | --- | --- | --- |
| H1 | S1 | `components/apps/SkillsApp.tsx` | Proficiency numbers are invented and contradict the resume: Figma 90 %, Blender 3D 40 %, GraphQL 70 %, "Creative" as a top-level category. None appear anywhere in the CV. A reviewer who reads both sees fabrication. |
| H2 | S1 | `AboutApp.tsx` vs `ResumeApp.tsx` | VXO Digital appears as *"Software Engineer, Aug 2025 – Present"* in About and *"Software Developer Trainee Intern, July 2025 – Current"* in the resume. Two different claims about the same job in the same product. |
| H3 | S1 | `AboutApp.tsx` | Self-describes as "Full Stack Developer & Designer" whose focus is "nostalgia, pixel art, UI/UX, Blender, Figma" — the opposite positioning to the actual CV (Java/Spring Boot, Python, geospatial, GNNs). The strongest part of the profile is invisible. |
| H4 | S1 | `ProjectsApp.tsx:24,33` | Two of three projects link `github.com/tiwarygaurav` (a profile, not a repo) with `// replace with exact repo if public`, and `demo: '#'`. Clicking "Live Demo" does nothing. |
| H5 | S2 | `AboutApp.tsx:64` | Avatar is a lucide `User` glyph, despite `public/profile.jpg` and `profile-picture-chess.png` existing and being used elsewhere. |
| H6 | S2 | `AboutApp.tsx:73` | Location "Mumbai, India" is asserted; the resume only places the *HERE internship* in Mumbai. |
| H7 | S2 | `TerminalApp.tsx:79` | `whoami` -> "Guest User (Admin)". Meaningless. |

**These matter more than any visual issue.** A recruiter who spots one fabricated number
discounts the whole document.

---

## 4. Dead UI (buttons that do nothing)

`ExplorerLayout` Back / Forward / Search / Folders / Go · `MyComputerApp` Back / Forward / Up /
Refresh / Search / Folders / Go · `SettingsApp` OK / Cancel / Apply, Screen Saver dropdown,
whole Appearance tab · `ResumeApp` "Find..." input, page counter · `CalculatorApp` Edit / View /
Help menu labels · `LoginScreen` Restart and Log Off in the turn-off dialog · `ContactApp`
Attach · `NotepadApp` View > Status Bar, File > Exit · `MyComputerApp` sidebar links firing
`alert('Not implemented')`.

Roughly **25 controls** render as affordances and do nothing. Each one teaches the visitor that
this environment is a facade — which is precisely the impression the project needs to avoid.

Native `alert()` / `confirm()` are used for icon deletion, the Konami egg, and several menu
items. They break the illusion harder than a missing feature would.

---

## 5. Architecture debt

| # | Sev | Issue |
| --- | --- | --- |
| A1 | S2 | **Content is scattered across components.** The same person's name, links, job history, and skills are hardcoded in `AboutApp`, `ResumeApp`, `SkillsApp`, `ProjectsApp`, `StartMenu`, `TerminalApp`, `ContactApp`. This is the direct cause of H1–H4. *(Addressed by `content/`.)* |
| A2 | S2 | **App definition is split in two.** `constants/apps.ts` owns metadata; `components/os/Window.tsx` owns the id -> component map. Adding an app means editing two files and forgetting one fails silently at runtime ("App not found"). |
| A3 | S2 | **Every store consumer subscribes to the whole store** (`useSystemStore()` with no selector) in 9 components, including `DesktopIcon` — so all 13 desktop icons re-render on every window open, focus, move, or volume change. |
| A4 | S2 | `lucide-react.d.ts` is a hand-written module declaration that **shadows the library's own types**. Every new icon must be added by hand or the build fails. Symptom of an original module-resolution problem that was worked around instead of fixed. |
| A5 | S2 | `any` in load-bearing contracts: `AppConfig.icon`, `AppConfig.component`, `AppWindow.icon`, `AppWindow.payload`, `openWindow(payload: any)`, `ProjectsApp` selected project, `ExplorerLayout.SidebarItem.icon`. |
| A6 | S3 | `page.tsx` renders `null` until `mounted` -> the server ships an empty body. Zero SEO content, blank first paint, no LCP element. For a portfolio that is a real cost. |
| A7 | S3 | `layout.tsx` metadata is `"Portfolio OS" / "Interactive OS Portfolio"`. The owner's name appears nowhere in `<head>`. No OG image, no favicon, no canonical URL. Sharing the link produces a blank card. |
| A8 | S3 | `AppConfig.component` field exists and is never used — a vestige of the abandoned attempt to unify A2. |
| A9 | S3 | No error boundary. One throw inside any app component blanks the entire OS. |
| A10 | S3 | `deletedAppIds` persists, so a visitor can delete the Projects icon and it stays gone across reloads with no discoverable way back except the Recycle Bin they may never open. |
| A11 | S3 | `themeColor` is written by Settings and read by nothing — dead state in a persisted store. |
| A12 | S3 | No ESLint config existed, so `npm run lint` prompted interactively and had evidently never run. |

---

## 6. Performance

| # | Sev | Issue |
| --- | --- | --- |
| P1 | S1 | **51 MB of commercial music** (`public/sounds/Eminem - *.mp3`, 4–12 MB each) is tracked in git and served from `public/`. It is 97 % of the repository (`.git` = 53 MB). It is also unlicensed third-party content on a public professional site. |
| P2 | S2 | **Desktop icons are `.ico` files up to 465 KB** rendered at 48 px. `Folder Closed.ico` 465 KB, `My Computer.ico` 416 KB, `Music.ico` 236 KB. A first desktop paint pulls roughly **2 MB of icons** for ~600 px² of pixels. |
| P3 | S2 | 15 of 16 image sites use raw `<img>`; only `LoginScreen` uses `next/image`. No sizing, no format negotiation, no lazy loading. |
| P4 | S2 | Every app component is statically imported into `Window.tsx`, so all 15 apps are in the initial bundle whether or not one is opened. First Load JS is 167 KB for a page that shows a boot screen. |
| P5 | S3 | `Bliss.jpg` and `bliss.png` are duplicate wallpapers (1.2 MB together). |
| P6 | S3 | Boot screen runs an infinite Framer loop; the login screen paints two full-viewport overlay gradients permanently. |

---

## 7. UX

- **First impression is a 4.5 s dead wait** with no skip, then a login screen requiring a second
  click. Two gates before any content. A returning visitor repeats both every reload.
- **Desktop icons open on double-click only** — no touch equivalent, and no keyboard path to
  first focus.
- **13 desktop icons of equal weight.** Resume and Projects have exactly the same visual
  priority as Minesweeper. Nothing directs a recruiter.
- The **welcome balloon** is the only wayfinding, and it advertises Minesweeper.
- **No search, no command palette.** With 15 apps and no global entry point, discovery is
  browsing-only.
- **Terminal has no history recall, no tab completion**, and its 12 commands mostly print static
  strings. `ls` lists app ids that are not paths; `pwd` prints a path that does not exist.
- **Mobile is unhandled.** Fixed 800×600 windows, drag-to-move, double-click-to-open, a taskbar
  with 140 px minimum buttons, and `overflow: hidden` on body. On a phone this is unusable —
  and a large share of portfolio links are opened on phones.

## 8. Accessibility

Desktop icons are `div`s with `onDoubleClick` — not focusable, no `role`, no keyboard activation.
No visible focus ring anywhere. Title-bar controls carry `title` but no `aria-label`. The window
layer has no `role="dialog"`, no focus trap, and no focus restoration on close. `user-select:
none` is global, so a visitor cannot select the email address to copy it. No
`prefers-reduced-motion` handling. Colour contrast is unverified — light-grey-on-white
(`text-gray-400` on white) appears in several panels.

## 9. Visual

> **Update 2026-08-20:** the first bullet was the wrong conclusion. Full XP replication is the
> deliberate identity, confirmed by the owner. The rest still stand — they are about internal
> *consistency*, not about the XP look itself.

- ~~Effectively 100 % XP replication — nothing on screen says *this* engineer built it.~~
  The XP look stays; what distinguishes the project is the real system underneath it.
- Every surface is a bespoke inline gradient; there is no token layer, so nothing can be
  re-themed and no two panels are guaranteed to match.
- Genuine style collision: XP beige chrome (`#ece9d8`, bevels) sits directly against modern
  Tailwind idiom (`rounded-lg`, `shadow-sm`, gradient text, `bg-clip-text`) inside About and
  Skills. Two eras in one window.
- Icon system is mixed — custom `.ico` on the desktop, lucide glyphs inside apps, emoji (💣 🚩
  🙂 🔧) in Minesweeper and MyComputer.
- Microsoft assets — XP logo PNGs, Bliss, the XP startup sound — ship deliberately (`CLAUDE.md` §9).
  The "Copyright (c) Microsoft Corporation" boot line is the one thing removed: homage is fine,
  claiming Microsoft authorship is not.

## 10. Missing capabilities (ranked by portfolio value)

1. Anything that demonstrates **backend / data / geospatial** work — the owner's actual strength.
2. A way to see **how the site itself is built** (architecture, processes, state).
3. Projects as **explorable artifacts** rather than three cards with a stack list.
4. A **command palette** / global search.
5. A **real resume** file.
6. A **working contact** path.
7. A **mobile** experience.
8. **Deep links** — no way to share "open the Projects window"; the app has one URL.

---

## 11. Risk register

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Licensed music + MS trademarks shipped publicly | Takedown / professional embarrassment | P1 honesty pass: strip audio from git and `public/`, remove MS branding, replace with owned assets |
| Z-index overflow (C5) | OS visibly breaks during a long visit | Normalise z-index on focus |
| Persisted `deletedAppIds` (A10) | Visitor permanently loses portfolio icons | Cap what is deletable, or add "restore desktop" |
| Content drift across components (A1) | Contradictory claims about employment | `content/` as single source, migrate every app |
| No error boundary (A9) | One bug blanks the whole portfolio | Add boundary per window + global |
| Everything client-side (A6/A7) | Invisible to search and link previews | Server-render a semantic fallback layer |

---

## 12. Verdict (2026-08-19, kept as written)

The **engineering foundation is better than the product**. The window manager, store design, and
app registry are competent; the toy apps are complete. What undermines it is that the content
layer is fabricated and scattered, roughly 25 controls are inert, the two most important
recruiter actions (download resume, send a message) do not work, and nothing on screen
communicates that the author is a backend / geospatial / ML engineer rather than a retro-UI
hobbyist.

Fixing honesty and dead UI is worth more than any redesign — and it is a precondition for one,
because a redesign built on scattered fabricated content just re-scatters it.

## 13. Verdict after P1 (2026-08-20)

**The product now tells the truth.** Every fact a visitor reads comes from `content/`; the resume
downloads; the contact form does what it says; no control renders as interactive without working;
no metric on screen is invented. The employer-confidential work — which is the owner's strongest
engineering evidence — is presented at an abstraction level that discloses nothing, with the
absence of source stated as a professional boundary rather than hidden behind a dead button.

**What is left is no longer about trust.** The open items are performance (§6), accessibility
(§8), visual consistency (§9) and mobile (§7).

**The Windows XP identity is settled and stays** — see `CLAUDE.md` §1 and §8. The remaining
visual work is consistency, not redesign: the same XP values, defined once instead of inline in
forty components, so panels match and the Themes tab can drive something real.

# 🖥️ Gaurav XP — an OS-style portfolio

An interactive Windows XP-inspired desktop, in the browser, used as a personal portfolio.

Built by **Kumar Gaurav** — software engineer working across backend services, geospatial data
pipelines and applied ML.

[github.com/tiwarygaurav](https://github.com/tiwarygaurav) ·
[linkedin.com/in/gauravtiwary21](https://linkedin.com/in/gauravtiwary21)

---

## The idea

It looks like Windows XP — the boot screen, the login, Bliss, the taskbar, the start menu, the
startup sound, the beige dialogs. That part is deliberate homage and it stays.

What makes it more than a skin is that the **OS primitives underneath it are real**:

- A **virtual filesystem** generated at load time from a single typed content layer.
- A **Command Prompt** that walks that filesystem — `ls`, `cd`, `cat`, `tree`, `grep`, `open`,
  `ps`, `kill` — none of which print canned strings.
- A **window manager** in a Zustand store, projected into `/proc` as live processes, so `ps`
  lists the windows you actually have open and `kill w2` closes one.
- **One source of truth.** The GUI windows and the shell read the same data, so
  `cat ~/experience/here-technologies.md` and the About window cannot disagree.

## Try this

Open the Command Prompt and run:

```
ls ~
tree ~/projects
cat ~/projects/os-portfolio/README.md
grep spring
ps
open ~/projects/url-shortener
sysinfo
```

`open` launches the matching window, because filesystem nodes carry the same launch hint the
desktop icons use.

## Features

**Boot & login** — animated boot sequence, XP startup sound, login screen, shutdown.
**Desktop** — Bliss wallpaper, draggable icons with persisted positions, taskbar with live clock
and system tray, start menu with All Programs.
**Window management** — open, close, minimise, maximise, restore, drag, resize, focus, z-order.
**Applications** — About, Projects, Skills, Resume, Contact, Command Prompt, My Computer, Recycle
Bin, Media Player, Notepad, Calculator, Minesweeper, Paint, Picture Viewer, Display Properties.
**Extras** — context menus, recycle bin that really deletes and restores, Konami code.

## Stack

Next.js 14 (App Router) · React 18 · TypeScript (strict) · Zustand · Framer Motion · Tailwind CSS.
No backend.

## Layout

```
content/      typed source of truth for every fact on the site — headless
system/       virtual filesystem + shell — headless, no React
store/        Zustand store and window manager
components/
  os/         shell chrome: boot, login, desktop, window, taskbar, start menu
  apps/       one component per application window
  ui/         shared primitives
constants/    the application registry
public/       icons, wallpapers, sounds, profile image, resume
docs/         standing audit and forward roadmap
```

`content/` and `system/` never import React. That is what makes the shell testable outside a
browser, and it is why the same command set can be driven from Node.

## Running it

```bash
npm install
npm run dev      # http://localhost:3000
npm run build
npm run lint
```

## Notes on content

Nothing on this site is fabricated. Where a fact is unconfirmed it is labelled as such; where a
project was built inside a company, it is described at a non-confidential level and the absence
of source code is stated explicitly rather than hidden behind a dead link.

## Attribution

The visual design is a tribute to Windows XP. This project is not affiliated with, endorsed by,
or connected to Microsoft. Windows and Windows XP are trademarks of Microsoft Corporation.

## Project context

`CLAUDE.md` carries the architecture, conventions and decision log. `docs/AUDIT.md` is the
standing technical audit. `docs/ROADMAP.md` holds the forward plan.

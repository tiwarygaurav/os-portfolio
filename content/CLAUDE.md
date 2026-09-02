# content/ — the single source of truth

Every fact a visitor can read about Kumar Gaurav lives here: profile, roles, education, projects,
skills, achievements. Nothing else in the codebase may hardcode these.

## Why this directory exists

Before it, the same facts were duplicated across `AboutApp`, `ResumeApp`, `SkillsApp`,
`ProjectsApp`, `StartMenu`, `TerminalApp` and `ContactApp`. They drifted: the About window and the
Resume window stated different job titles and start dates for the same employer, and the Skills
window showed invented proficiency percentages for tools the resume never mentions. Consolidating
here is what makes that class of bug structurally impossible.

## Hard rules

1. **No React, no JSX, no Tailwind, no DOM.** These are plain typed values. `system/` and every
   app read them; nothing here reads anything back.
2. **Never invent a fact.** No companies, metrics, clients, awards, dates or results that the
   owner did not supply. If it is unknown, model it as unknown — `Sourced<T>` with
   `from: 'needs-confirmation'`, or `ExternalLink.known: false`, or
   `Project.availability`.
3. **No proficiency numbers.** `Skill.evidence` (which role/project demonstrates it) replaced the
   percentage bars. A checkable claim beats an unfalsifiable one.
4. **Ids are stable and cross-referenced.** `Skill.evidence` holds `Role.id` / `Project.id`
   values, and the VFS builds paths from ids. Renaming an id changes URLs and shell paths —
   grep first.
5. **Prose is written for two renderers.** Everything here is displayed both in a GUI window and
   as a text file via `cat` in the shell. Keep sentences plain; no markup beyond paragraph
   splitting.

## Files

| File | Holds |
| --- | --- |
| `types.ts` | Shared shapes. `Sourced<T>` and `Provenance` express uncertainty explicitly. |
| `profile.ts` | `SYSTEM` (the system name, defined once — see the XP identity rule in CLAUDE.md §1) and `PROFILE`, `LINKS`. |
| `experience.ts` | `ROLES`, `EDUCATION`, `ACHIEVEMENTS`, `CERTIFICATIONS`. |
| `projects.ts` | `PROJECTS` + `availabilityLabel()` for explaining absent source links. |
| `skills.ts` | `SKILL_GROUPS` with evidence links. |
| `index.ts` | Barrel. Import `@/content`, not the individual files. |

## Open items carried in the data

These are marked `needs-confirmation` in code and must not be presented as settled fact:

- `ROLES.vxo-digital.title` / `.period` — About and Resume disagreed.
- `PROFILE.location` — asserted by the old About window, absent from the resume.
- `PROJECTS."os-portfolio"` has no "Live" link on purpose: the site is not deployed, and the URL it once carried belongs to someone else (see CLAUDE.md §1).

## Adding something

New project -> add to `PROJECTS` with a stable `id`, honest `availability`, and links only if the
URL is real. It appears in the Projects app **and** under `/home/gaurav/projects/<id>/` in the
shell automatically — the VFS builds from this array, so there is no second place to register it.

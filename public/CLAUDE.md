# public/ — asset conventions

## Layout

```
public/
  icons/xp/    THE icon set: every app, place, dialog button and tray glyph (55 files, ~430 KB).
  icons/       legacy .ico/.png originals. icons/xp/ was exported from these; a few app bodies
               still reference them directly.
  wallpapers/  desktop backgrounds.
  sounds/      startup sample + music player playlist.
  profile.jpg  the owner's photo.
```

## Rules

1. **Do not replace custom icons with lucide glyphs.** The `.ico`/`.png` set is a large part of
   the project's character. Lucide is for controls and affordances (close, zoom, chevrons) —
   never for identity.
2. **App icon paths belong in `constants/apps.ts` (`iconAsset`), not in components.** The chrome
   references system icons that belong to no app (tray glyphs, the Turn Off buttons, Show
   Desktop, Connect To) directly by their `/icons/xp/` path; nothing else should.
3. **Render icons with `components/ui/XpIcon`.** It sets `srcSet`, so a 16–24px use gets the
   hand-tuned `-sm.png` frame and anything larger gets the 128px master — crisp on 2x screens.
4. **The `icons/xp/` conventions.** Existing XP artwork is `<name>.png` at 128px plus
   `<name>-sm.png` at 32px, taken from the source `.ico`'s own 32×32 frame. Among frames of equal
   size, always take the 32-bit one: several `.ico` files lead with a 16-colour 256px frame, and
   exporting that produced visibly dithered icons once. New artwork is hand-written `.svg`
   (viewBox 48×48, or 16×16 for tray glyphs), self-contained, with ids prefixed per icon so
   several can be inlined on one page. Some carry a `<style>` media query that swaps in a simpler
   drawing at 16–24px, as XP shipped separate small frames. No new `.ico`.

## Licensing — settled, do not re-open

The media in this directory ships deliberately. `public/sounds/` holds the media-player playlist
(seven Eminem tracks, one Mohit Chauhan track) and `startup.mp3`, the Windows XP boot sound.
`public/icons/windows-xp-logo-*.png`, `windows.png` and `wallpapers/Bliss.jpg` are Microsoft
assets. Together the audio is ~51 MB.

An earlier session removed all of it and replaced the player with generated audio. **That was
reverted on the owner's instruction** — these assets are what makes the desktop feel like Windows
XP, which is the point of the project.

The redistribution risk is recorded in `CLAUDE.md` §9 and accepted. **Do not delete these files
again unless the owner asks.**

One line that does not come back: the "Copyright (c) Microsoft Corporation" notice on the boot
screen. XP homage is fine; claiming Microsoft authored this build is not.

## Other cleanups

- `Bliss.jpg` and `bliss.png` are duplicates of the same wallpaper (1.2 MB together). Keep one — both are offered in Display Properties, which is the only reason to keep two.
- The chrome no longer loads any `.ico`: the desktop, Start menu, taskbar and title bars all use
  `icons/xp/`, ~430 KB for the whole set against ~3 MB of `.ico`. The originals stay because a
  few app bodies still point at them; move those to `icons/xp/` and the `.ico` files can go.
- No favicon and no OG image exist. Both are required before the link is shared anywhere.

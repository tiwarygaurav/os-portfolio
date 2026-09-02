# public/ — asset conventions

## Layout

```
public/
  icons/       application + system icons. Mixed .ico (XP-sourced, large) and .png (small).
  wallpapers/  desktop backgrounds.
  sounds/      startup sample + music player playlist.
  profile.jpg  the owner's photo.
```

## Rules

1. **Do not replace custom icons with lucide glyphs.** The `.ico`/`.png` set is a large part of
   the project's character. Lucide is for controls and affordances (close, zoom, chevrons) —
   never for identity.
2. **Icon paths belong in `constants/apps.ts` (`iconAsset`), not in components.** Several
   components still hardcode `/icons/...` strings; do not add more.
3. **Every `<img>` needs a fallback.** `.ico` support varies; `StartMenuLink` already implements
   an `onError` fallback to a lucide glyph — copy that pattern.
4. **New raster assets ship as `.png`/`.webp` at the size they are displayed.** No new `.ico`.

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
- Several `.ico` files are enormous for their display size: `Folder Closed.ico` 465 KB,
  `My Computer.ico` 416 KB, `Music.ico` 236 KB — all rendered at 48 px. A first desktop paint
  pulls roughly 2 MB of icons. Re-export at 2× display size as `.png`; keep the artwork, drop
  the bytes.
- No favicon and no OG image exist. Both are required before the link is shared anywhere.

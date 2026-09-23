import type { CSSProperties } from 'react';
import { useSystemStore, WALLPAPERS } from '@/store/useSystemStore';
import { isFile, lookup } from '@/system/vfs';
import { DESKTOP_BACKGROUND_COLOUR, type WallpaperFile } from '@/constants/prefs';
import { useFsRevision } from '@/utils/fs';

/**
 * The desktop background, as CSS, for a built-in wallpaper or a picture from the filesystem.
 *
 * One function, so the desktop and every preview (Display Properties' little monitor) draw the
 * same thing. A picture wallpaper points at a file — a visitor's own from My Pictures, or one of the
 * Sample Pictures — and if that file is gone, this falls back to the built-in choice rather than
 * drawing a broken image.
 */
export function wallpaperCss(wallpaperId: string, file: WallpaperFile | null): CSSProperties {
    if (file) {
        const node = lookup(file.path);
        if (node && isFile(node) && node.src) {
            const image = `url('${node.src}')`;
            if (file.position === 'tile') {
                return { backgroundColor: DESKTOP_BACKGROUND_COLOUR, backgroundImage: image, backgroundRepeat: 'repeat', backgroundSize: 'auto' };
            }
            if (file.position === 'center') {
                return { backgroundColor: DESKTOP_BACKGROUND_COLOUR, backgroundImage: image, backgroundRepeat: 'no-repeat', backgroundPosition: 'center', backgroundSize: 'auto' };
            }
            return { backgroundColor: DESKTOP_BACKGROUND_COLOUR, backgroundImage: image, backgroundRepeat: 'no-repeat', backgroundSize: '100% 100%' };
        }
    }
    const wp = WALLPAPERS.find((w) => w.id === wallpaperId) ?? WALLPAPERS[0];
    return wp.color
        ? { backgroundColor: wp.color }
        : { backgroundImage: `url('${wp.url}')`, backgroundSize: 'cover', backgroundPosition: 'center' };
}

/** The current desktop background. Re-renders when the wallpaper or its file changes. */
export function useWallpaperStyle(): CSSProperties {
    const wallpaperId = useSystemStore((s) => s.wallpaperId);
    const file = useSystemStore((s) => s.wallpaperFile);
    useFsRevision();
    return wallpaperCss(wallpaperId, file);
}

import type { ImgHTMLAttributes } from 'react';

type XpIconProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'width' | 'height' | 'srcSet' | 'sizes'> & {
    src: string;
    /** Display size in CSS px. The icon is always square. */
    size: number;
};

/**
 * An icon at a given display size, crisp on high-DPI screens.
 *
 * The `/icons/xp/` set ships each raster icon twice: `<name>.png` at 128px for anything 24px and
 * up, and `<name>-sm.png` at 32px — taken from the artwork's hand-tuned 32×32 frame, not
 * downsampled — for title bars, the taskbar and menus. `srcSet` lets the browser choose by the
 * pixels it actually needs, so a 16px icon on a 2x screen uses the tuned frame and a 48px desktop
 * icon uses the master. Vector icons (`.svg`) are crisp at every size already, and anything
 * outside the set renders as given.
 */
export default function XpIcon({ src, size, alt = '', draggable = false, ...rest }: XpIconProps) {
    const tuned = /^(\/icons\/xp\/[^/]+)\.png$/.exec(src);
    return (
        // eslint-disable-next-line @next/next/no-img-element -- static icons, sized by the caller
        <img
            src={src}
            srcSet={tuned ? `${tuned[1]}-sm.png 32w, ${src} 128w` : undefined}
            sizes={tuned ? `${size}px` : undefined}
            width={size}
            height={size}
            alt={alt}
            draggable={draggable}
            {...rest}
        />
    );
}

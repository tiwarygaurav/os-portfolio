import { ImageResponse } from 'next/og';
import { PROFILE, SYSTEM } from '@/content';

/**
 * The link-preview card.
 *
 * Generated at build time from `content/`, so the name and title on the card cannot drift from
 * the name and title in the About window. Deliberately plain: a legible claim beats a screenshot
 * that renders as mud in a Slack thumbnail.
 */

export const runtime = 'edge';
export const alt = `${PROFILE.name} — ${PROFILE.title}`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
    return new ImageResponse(
        (
            <div
                style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    background: 'linear-gradient(160deg, #245edb 0%, #1941a5 100%)',
                    fontFamily: 'sans-serif',
                    color: 'white',
                    padding: 72,
                    justifyContent: 'space-between',
                }}
            >
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <div style={{ fontSize: 30, opacity: 0.75, letterSpacing: 1 }}>{SYSTEM.name}</div>
                    <div style={{ fontSize: 86, fontWeight: 700, marginTop: 16, lineHeight: 1.05 }}>
                        {PROFILE.name}
                    </div>
                    <div style={{ fontSize: 40, marginTop: 12, opacity: 0.9 }}>{PROFILE.title}</div>
                </div>

                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        borderTop: '2px solid rgba(255,255,255,0.28)',
                        paddingTop: 28,
                        fontSize: 27,
                        opacity: 0.92,
                        lineHeight: 1.4,
                    }}
                >
                    <div>A Windows XP desktop rebuilt in the browser.</div>
                    <div style={{ opacity: 0.75, marginTop: 8 }}>
                        The filesystem, the shell and the process table are real.
                    </div>
                </div>
            </div>
        ),
        size,
    );
}

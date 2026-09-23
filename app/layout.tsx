import type { Metadata, Viewport } from 'next';
import { PROFILE, SYSTEM, LINKS } from '@/content';
// Luna first: its component classes then sit below Tailwind's utilities, so an app body can still
// override one with a utility, while Preflight's element resets cannot flatten them.
import './luna.css';
import './globals.css';

/**
 * Page metadata, read from `content/` like everything else a visitor can see.
 *
 * This is the first thing a recruiter meets: the browser tab, and the card that appears when the
 * link is pasted into Slack or LinkedIn. Before this, the tab said "Portfolio OS" and the link
 * previewed as "Interactive OS Portfolio" with no image and no name attached to it.
 */

const description =
    `${PROFILE.name} — ${PROFILE.title}. A Windows XP desktop rebuilt in the browser, where the ` +
    'OS primitives are real: a virtual filesystem the shell and the windows both read, and a ' +
    'window manager whose windows are the process table.';

/**
 * Absolute-URL base for the Open Graph card.
 *
 * Set `NEXT_PUBLIC_SITE_URL` at build time on whatever host this is deployed to; without it Next
 * falls back to `http://localhost:3000`, which produces a link preview no one else can load.
 * There is no default baked in here because this project is not deployed anywhere yet, and a
 * guessed domain would be exactly the kind of unverified claim the rest of the site avoids.
 */
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

export const metadata: Metadata = {
    ...(siteUrl ? { metadataBase: new URL(siteUrl) } : {}),
    title: {
        default: `${PROFILE.name} — ${PROFILE.title}`,
        template: `%s — ${PROFILE.name}`,
    },
    description,
    applicationName: SYSTEM.name,
    authors: [{ name: PROFILE.name, url: LINKS.find((l) => l.label === 'GitHub' && l.known)?.url }],
    keywords: [
        PROFILE.name,
        'software engineer',
        'portfolio',
        'Windows XP',
        'TypeScript',
        'Next.js',
        'backend',
        'geospatial',
    ],
    openGraph: {
        type: 'website',
        title: `${PROFILE.name} — ${PROFILE.title}`,
        description,
        siteName: SYSTEM.name,
    },
    twitter: {
        card: 'summary_large_image',
        title: `${PROFILE.name} — ${PROFILE.title}`,
        description,
    },
    // A visitor whose browser blocks scripts still gets a readable answer; see globals.css.
    robots: { index: true, follow: true },
};

export const viewport: Viewport = {
    themeColor: '#245edb',
    width: 'device-width',
    initialScale: 1,
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en">
            <body>
                {children}
                {/*
                  * Without JavaScript the desktop cannot run at all, so say what this is and give
                  * the two links that matter rather than rendering an empty black page.
                  */}
                <noscript>
                    <div style={{ padding: '2rem', fontFamily: 'Tahoma, Verdana, sans-serif', color: '#000', background: '#ece9d8' }}>
                        <h1 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>
                            {PROFILE.name} — {PROFILE.title}
                        </h1>
                        <p style={{ maxWidth: '38rem', lineHeight: 1.6 }}>{description}</p>
                        <p style={{ marginTop: '1rem' }}>
                            This desktop needs JavaScript to run. In the meantime:{' '}
                            {LINKS.filter((l) => l.known).map((l, i) => (
                                <span key={l.url}>
                                    {i > 0 && ' · '}
                                    <a href={l.url}>{l.label}</a>
                                </span>
                            ))}
                        </p>
                    </div>
                </noscript>
            </body>
        </html>
    );
}

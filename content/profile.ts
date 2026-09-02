import type { ExternalLink, Sourced } from './types';

/**
 * Identity of the environment itself.
 *
 * The XP identity is deliberate and stays. This is a Windows XP-style desktop, and it should feel
 * like one — the naming, the chrome, the sounds and the icons are all part of that.
 *
 * The name lives here and nowhere else, so every surface (boot screen, login, shutdown dialog,
 * shell prompt, system info, welcome balloon) stays in sync from one edit.
 */
export const SYSTEM = {
    name: 'Gaurav XP',
    /** Shown on the boot screen next to the wordmark. */
    version: 'Professional',
    codename: 'Build 2600',
    tagline: 'A Windows XP desktop, rebuilt in the browser.',
    /** The release this interface is modelled on. */
    ancestor: 'Windows XP, 2001',
    /** Shell prompt user@host, matching the original terminal. */
    shellUser: 'guest',
    shellHost: 'portfolio',
} as const;

export const PROFILE = {
    name: 'Kumar Gaurav',
    shortName: 'Gaurav',
    /** Unix account name used across the VFS, the shell prompt and `/home`. */
    handle: 'gaurav',
    title: 'Software Engineer',
    /** What he actually builds, in his own resume's terms. */
    focus: [
        'Backend engineering (Java / Spring Boot, Node.js)',
        'Geospatial data pipelines and graph modelling',
        'Applied machine learning on spatial data',
    ],
    /**
     * Positioning line. Deliberately not "full-stack developer & designer" — that was the old
     * About window's claim and it contradicted the resume.
     */
    summary:
        'Software engineer working across backend services and geospatial data. Builds REST APIs ' +
        'and enterprise modules in Java/Spring Boot and Angular, and Python pipelines that turn ' +
        'road-network data into graph features for machine-learning models.',
    /**
     * Location: the resume places the HERE internship in Mumbai and the university in Ranchi, but
     * never states a current base. The previous About window asserted "Mumbai, India" with no
     * source, so it is recorded here as unconfirmed rather than repeated as fact.
     */
    location: {
        value: 'Mumbai, India',
        from: 'needs-confirmation',
        note: 'Asserted by the old About window; not stated in the resume. Confirm current base.',
    } as Sourced<string>,
    availability: 'Open to opportunities',
    email: 'gauravt.nic@gmail.com',
    /**
     * Already published in the repo's resume component. Kept for parity, flagged because a public
     * portfolio is a scraping target — consider removing it from the rendered resume.
     */
    phone: {
        value: '6200421041',
        from: 'resume',
        note: 'Publicly rendered today. Privacy call for the owner.',
    } as Sourced<string>,
    avatar: '/profile.jpg',
    avatarAlt: '/icons/profile-picture-chess.png',
} as const;

/**
 * Canonical resume reference. The only place the PDF path is written.
 *
 * The file is the owner's real resume (PDF author: "Gaurav Tiwary"), copied into the repository
 * from `~/Downloads/Kumar_Gaurav_Resume.pdf` on 2026-08-20 and stored at a deterministic path.
 *
 * `asOf` records what the PDF itself contains: it was generated on 2026-02-04 and therefore
 * predates the CaratSense AI role. The Resume window states this rather than implying the PDF
 * is current.
 */
export const RESUME = {
    /** Served from `public/`. Must exist — the app verifies it at runtime rather than assuming. */
    path: '/resume/kumar-gaurav-resume.pdf',
    /** Filename offered to the browser on download. */
    downloadName: 'Kumar_Gaurav_Resume.pdf',
    asOf: 'February 2026',
    staleness:
        'This PDF predates the CaratSense AI LLP role listed below. The on-screen resume is ' +
        'generated from live content and is the more current of the two.',
} as const;

export const LINKS: ExternalLink[] = [
    { label: 'GitHub', url: 'https://github.com/tiwarygaurav', known: true },
    { label: 'LinkedIn', url: 'https://linkedin.com/in/gauravtiwary21', known: true },
    { label: 'Twitter', url: 'https://twitter.com/GauravI970936', known: true },
    { label: 'Instagram', url: 'https://instagram.com/gauravtewaryy', known: true },
    { label: 'Email', url: `mailto:${PROFILE.email}`, known: true },
];

export const linkByLabel = (label: string): ExternalLink | undefined =>
    LINKS.find((l) => l.label.toLowerCase() === label.toLowerCase());

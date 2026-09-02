/**
 * Shared shapes for every portfolio fact.
 *
 * Rule of this directory: a value that is not known is modelled as *unknown*, never guessed.
 * `Sourced<T>` exists so the UI can render "source not public" instead of a dead link, and so a
 * future session can tell a verified claim from one that still needs the owner's confirmation.
 */

/** How much we trust a fact, and where it came from. */
export type Provenance =
    /** Taken verbatim from the owner's resume content in this repo. */
    | 'resume'
    /** Observable in this repository / on a public profile. */
    | 'repo'
    /** Written by the owner in an app component before `content/` existed. */
    | 'legacy-component'
    /** Conflicting or missing source — must be confirmed before it is presented as fact. */
    | 'needs-confirmation';

/** A value plus where it came from. Use for anything a reader could challenge. */
export interface Sourced<T> {
    value: T;
    from: Provenance;
    /** Shown in developer surfaces (shell, system info) when `from` is not authoritative. */
    note?: string;
}

export interface ExternalLink {
    label: string;
    url: string;
    /** `false` means: we know the target exists but not its address. Render as unavailable. */
    known: boolean;
}

export type ProjectKind = 'system' | 'backend' | 'geospatial' | 'ml' | 'web';

/** Whether the source of a project can be shown at all. */
export type SourceAvailability =
    | 'public'
    /** Built inside a company; code is not the owner's to publish. */
    | 'employer-confidential'
    /** Owner has it, but no public URL is recorded here yet. */
    | 'unpublished';

export interface Project {
    id: string;
    name: string;
    /** One line. Shown in lists and in `ls`. */
    summary: string;
    /** Paragraphs. Shown in the detail view and by `cat`. */
    description: string[];
    kind: ProjectKind;
    /** Where it was built. `null` for personal work. */
    context: string | null;
    period: string;
    role: string;
    stack: string[];
    /** Concrete things that were built. No metrics unless the owner supplied them. */
    highlights: string[];
    availability: SourceAvailability;
    links: ExternalLink[];
    provenance: Provenance;

    /* ---- Disclosure-safe framing -------------------------------------------------------
     * Work done inside a company is real portfolio material, but its implementation cannot be
     * shown. Rather than hiding it or leaving a dead "Source" button, these three fields carry
     * the story at an abstraction level that discloses nothing proprietary:
     * the problem, the approach, and what this engineer personally contributed.
     * Required for anything not `availability: 'public'`.
     */

    /** The problem domain, stated without internal specifics. */
    problem?: string;
    /** The high-level technical approach. No internal architecture, datasets or identifiers. */
    approach?: string;
    /** This engineer's own contribution, at a non-confidential level. */
    contribution?: string[];
}

export interface Role {
    id: string;
    company: string;
    title: Sourced<string>;
    period: Sourced<string>;
    location: Sourced<string>;
    /** `true` for the current position. Exactly one role should carry this. */
    current: boolean;
    /**
     * Empty is a legitimate, meaningful state: the role is real but no details have been
     * supplied yet. Renderers must show "details pending", never filler.
     */
    highlights: string[];
    /** Technologies actually named for this role. Empty when none are confirmed. */
    stack: string[];
}

export interface Education {
    id: string;
    institution: string;
    qualification: string;
    location: string;
    period: string;
    coursework: string[];
}

export interface Achievement {
    id: string;
    title: string;
    detail: string;
    year: string;
}

export interface Certification {
    id: string;
    name: string;
    issuer: string;
    status: 'completed' | 'in-progress';
}

/**
 * Skills carry no numeric proficiency on purpose.
 *
 * The previous implementation displayed invented percentages that contradicted the resume.
 * `evidence` replaces them: where the skill was actually used. A claim you can check beats a
 * bar chart you cannot.
 */
export interface Skill {
    name: string;
    /** ids of roles/projects that demonstrate it. Empty means: claimed, not yet evidenced here. */
    evidence: string[];
    level: 'working' | 'proficient' | 'familiar';
}

export interface SkillGroup {
    id: string;
    label: string;
    skills: Skill[];
}

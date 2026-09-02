import type { Project } from './types';

/**
 * Real projects only.
 *
 * The previous implementation pointed two of three "Source" links at the GitHub *profile* rather
 * than a repository, and gave every project `demo: '#'`. Here, a source that is not public is
 * modelled as such (`availability`) so the UI can say why instead of rendering a dead link.
 *
 * No metrics appear below because none were supplied. Do not add "40% faster" style numbers
 * unless the owner provides them.
 */
export const PROJECTS: Project[] = [
    {
        id: 'os-portfolio',
        name: 'OS Portfolio — this desktop',
        summary: 'A Windows XP desktop in the browser, where the OS primitives are real rather than faked.',
        description: [
            'The portfolio you are currently inside: a Windows XP-style desktop with a boot sequence, ' +
            'login, draggable icons, a taskbar, a start menu and floating windows.',
            'The interesting part is not the window chrome — it is that the OS primitives underneath it ' +
            'are real. A virtual filesystem is built from a typed content layer at module load; the GUI ' +
            'apps and the Command Prompt read the same tree, so ' +
            '`cat /home/gaurav/experience/here-technologies.md` and the About window cannot disagree ' +
            'with each other. `ps` lists the windows actually open, and `kill` closes one.',
            'Window state (position, size, z-order, focus, minimise/maximise) lives in a Zustand store ' +
            'that acts as the window manager; components are pure renderers of that state.',
        ],
        kind: 'system',
        context: null,
        period: '2026 — ongoing',
        role: 'Sole author',
        stack: ['TypeScript', 'Next.js 14', 'React 18', 'Zustand', 'Framer Motion', 'Tailwind CSS'],
        highlights: [
            'Headless shell layer that returns structured output, with no React or DOM dependency.',
            'Virtual filesystem generated from typed content — one source of truth for every fact on the site.',
            'Store-driven window manager: focus, z-order, drag, resize, minimise/maximise, taskbar.',
            'Synthesised UI audio via WebAudio oscillators rather than shipped sound files.',
        ],
        availability: 'public',
        links: [
            { label: 'Source', url: 'https://github.com/tiwarygaurav/os-portfolio', known: true },
            { label: 'Live', url: 'https://os-portfolio.vercel.app', known: false },
        ],
        provenance: 'repo',
    },
    {
        id: 'url-shortener',
        name: 'URL Shortener & Analytics',
        summary: 'A Bitly-style shortening service in Spring Boot with collision handling and click analytics.',
        description: [
            'A URL shortening service built with Java and Spring Boot over a relational database.',
            'Short-code generation handles collisions, and the redirect path is kept deliberately cheap ' +
            'because it is the only hot path in the system. JPA/Hibernate persists original URLs, short ' +
            'codes and access metadata; basic analytics track click counts and usage.',
        ],
        kind: 'backend',
        context: null,
        period: '2025 — ongoing',
        role: 'Sole author',
        stack: ['Java', 'Spring Boot', 'JPA / Hibernate', 'SQL', 'REST'],
        highlights: [
            'Short-URL generation with collision handling.',
            'Backend design covering link creation, retrieval and redirection.',
            'JPA/Hibernate persistence for URLs, short codes and access metadata.',
            'Click-count and usage tracking.',
        ],
        availability: 'unpublished',
        links: [],
        provenance: 'resume',
    },
    {
        id: 'bypass-lane-graph',
        name: 'Bypass Lane Detection (graph ML)',
        summary: 'Heterogeneous graph modelling of road topology to detect bypass lanes from geospatial features.',
        description: [
            'Work carried out during the HERE Technologies internship: Python pipelines that read ' +
            'geospatial road data and detect bypass lanes.',
            'Road networks were modelled as heterogeneous graphs, with node and edge features derived ' +
            'from the geometry itself — notably distance and bearing between connected nodes — so that a ' +
            'graph neural network could reason about lane-level structure rather than raw coordinates.',
            'Backend support was added for the edge features, and an internal Node.js visualisation tool ' +
            'was extended to link road topology with traffic elements.',
        ],
        kind: 'geospatial',
        context: 'HERE Technologies',
        period: 'January 2025 — July 2025',
        role: 'Data Engineering Intern',
        stack: ['Python', 'PyTorch Geometric', 'GeoPandas', 'GeoJSON', 'Node.js'],
        highlights: [
            'Custom node and edge features including distance and bearing for lane-level modelling.',
            'Graph-based spatial ML workflow over large road-network datasets.',
            'Backend support for serving engineered edge features.',
            'Extended an internal visualisation tool to join topology with traffic elements.',
        ],
        problem:
            'A bypass lane is a short parallel stretch of road that lets traffic avoid an ' +
            'intersection. Identifying them reliably across a road network is hard because the ' +
            'signal is structural rather than visual — it lives in how road segments connect to ' +
            'each other and in the geometry between them, not in any single attribute.',
        approach:
            'Model the road network as a heterogeneous graph rather than a table of segments. ' +
            'Nodes and edges carry features derived from the geometry itself — notably distance ' +
            'and bearing between connected nodes — so a graph neural network can reason about ' +
            'local road structure instead of raw coordinates.',
        contribution: [
            'Built the Python pipelines that read geospatial road data and produced graph inputs.',
            'Engineered the node and edge feature set, including the distance and bearing features.',
            'Added backend support for serving those engineered features to the modelling stage.',
            'Extended an internal Node.js visualisation tool to link road topology with traffic elements.',
        ],
        availability: 'employer-confidential',
        links: [],
        provenance: 'resume',
    },
    {
        id: 'enterprise-modules',
        name: 'Enterprise Platform Modules',
        summary: 'Angular + Spring Boot modules (Orders, Opportunities, MOM) with REST APIs and role-aware access.',
        description: [
            'Work carried out at VXO Digital: full-stack feature development across enterprise modules ' +
            'including Orders, Opportunities and Minutes of Meeting.',
            'The work spanned Angular on the front end and Spring Boot services behind it, with REST APIs ' +
            'handling multi-entity data flows, validation and error handling, plus SQL for CRUD and ' +
            'transaction workflows.',
        ],
        kind: 'web',
        context: 'VXO Digital',
        period: 'July 2025 — present',
        role: 'Software Developer Trainee Intern',
        stack: ['Angular', 'Spring Boot', 'Java', 'SQL', 'REST APIs'],
        highlights: [
            'Full-stack features across Orders, Opportunities and MOM modules.',
            'REST APIs with validation and error handling over complex data flows.',
            'SQL for CRUD operations and transaction workflows.',
            'An AI-powered resume parser for automated candidate profiling.',
        ],
        problem:
            'Enterprise platform modules — Orders, Opportunities and Minutes of Meeting — where ' +
            'records span several related entities and the same data has to stay consistent ' +
            'across the UI, the service layer and the database.',
        approach:
            'Angular on the front end against Spring Boot services, with REST APIs shaped around ' +
            'the multi-entity data flows rather than around individual tables, and validation and ' +
            'error handling applied at the service boundary.',
        contribution: [
            'Developed and maintained full-stack features across the Orders, Opportunities and MOM modules.',
            'Implemented REST endpoints covering complex data flows, validation and error handling.',
            'Wrote SQL for CRUD operations and transaction workflows.',
            'Built an AI-powered resume parser for automated candidate profiling.',
        ],
        availability: 'employer-confidential',
        links: [],
        provenance: 'resume',
    },
];

/**
 * Why a project's implementation cannot be shown. Rendered next to confidential work so the
 * absence of a source link reads as a deliberate professional boundary rather than a broken
 * button. Public projects return `null` — there is nothing to explain.
 */
export const disclosureNote = (p: Project): string | null => {
    switch (p.availability) {
        case 'public':
            return null;
        case 'employer-confidential':
            return (
                `Proprietary project${p.context ? ` built at ${p.context}` : ''} — implementation and ` +
                'source code cannot be publicly disclosed. The problem, approach and contribution ' +
                'described here are deliberately kept at a non-confidential level.'
            );
        case 'unpublished':
            return 'Personal project — source is not published yet.';
    }
};

/** True when a project should be presented with the confidential treatment. */
export const isConfidential = (p: Project): boolean => p.availability === 'employer-confidential';

export const projectById = (id: string): Project | undefined => PROJECTS.find((p) => p.id === id);

export const projectsByKind = (kind: Project['kind']): Project[] =>
    PROJECTS.filter((p) => p.kind === kind);

/** Human label for why a source link is absent. Used by both the GUI and the shell. */
export const availabilityLabel = (a: Project['availability']): string => {
    switch (a) {
        case 'public':
            return 'Source is public';
        case 'employer-confidential':
            return 'Built at work — source belongs to the employer, not publishable';
        case 'unpublished':
            return 'Source not published yet';
    }
};

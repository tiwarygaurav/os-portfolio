import type { Achievement, Certification, Education, Role } from './types';

/**
 * Employment history. Every bullet below is taken from the resume content already in this repo.
 *
 * Known conflict, deliberately surfaced rather than silently resolved: the old About window said
 * "Software Engineer · Aug 2025 – Present" while the resume said "Software Developer Trainee
 * Intern · July 2025 – Current". The resume is treated as authoritative and the field is marked
 * `needs-confirmation` so the shell and system surfaces can show it as unconfirmed.
 */
export const ROLES: Role[] = [
    {
        id: 'caratsense-ai',
        company: 'CaratSense AI LLP',
        title: { value: 'Software Developer', from: 'resume' },
        period: {
            value: 'May 2026 — present',
            from: 'resume',
            note: 'Start date confirmed by the owner: 1 May 2026. No end date — current role.',
        },
        location: {
            value: 'Not confirmed',
            from: 'needs-confirmation',
            note: 'Work location not supplied yet.',
        },
        current: true,
        /**
         * Deliberately empty. No responsibilities, technologies or achievements have been
         * supplied for this role, and none are inferred from the company name. The UI renders
         * an explicit "details pending" state rather than filler.
         */
        stack: [],
        highlights: [],
    },
    {
        id: 'vxo-digital',
        company: 'VXO Digital',
        title: {
            value: 'Software Developer Trainee Intern',
            from: 'needs-confirmation',
            note: 'Resume says "Software Developer Trainee Intern"; the old About window said "Software Engineer". Owner will correct this entry later — do not rewrite it in the meantime.',
        },
        period: {
            value: 'July 2025 — present',
            from: 'needs-confirmation',
            note: 'Kept verbatim at the owner’s instruction. The trailing "present" now conflicts with the CaratSense AI start date (May 2026); no end date has been invented to resolve it.',
        },
        location: { value: 'Remote', from: 'resume' },
        /**
         * `false` only because CaratSense AI is the current role. Every other VXO field is
         * preserved exactly as it was, pending the owner's correction.
         */
        current: false,
        stack: ['Angular', 'Spring Boot', 'Java', 'SQL', 'REST APIs', 'Git'],
        highlights: [
            'Developed and maintained full-stack features using Angular and Spring Boot for enterprise modules (Orders, Opportunities, MOM).',
            'Implemented RESTful APIs handling complex data flows, validations and error handling.',
            'Built an AI-powered resume parser for automated candidate profiling.',
            'Wrote SQL for CRUD operations and transaction workflows.',
            'Worked in an agile team with Git-based code review and feature rollout.',
        ],
    },
    {
        id: 'here-technologies',
        company: 'HERE Technologies',
        title: { value: 'Data Engineering Intern', from: 'resume' },
        period: { value: 'January 2025 — July 2025', from: 'resume' },
        location: { value: 'Mumbai, Maharashtra', from: 'resume' },
        current: false,
        stack: ['Python', 'GeoPandas', 'PyTorch Geometric', 'Node.js', 'GeoJSON'],
        highlights: [
            'Developed Python data pipelines to detect bypass lanes from geospatial features.',
            'Engineered graph-based spatial ML workflows and integrated backend support for edge features.',
            'Enhanced an internal Node.js visualisation tool by linking road topology with traffic elements.',
            'Collaborated on scalable pipeline design for large-scale geospatial datasets.',
        ],
    },
];

export const EDUCATION: Education[] = [
    {
        id: 'bit-mesra',
        institution: 'Birla Institute of Technology, Mesra',
        qualification: 'B.Tech, Computer Science',
        location: 'Ranchi, Jharkhand',
        period: '2021 — 2025',
        coursework: [
            'Data Structures & Algorithms',
            'Software Engineering',
            'Computer Networks',
            'Cryptography',
            'AI / ML',
            'Operating Systems',
            'DBMS',
        ],
    },
];

export const ACHIEVEMENTS: Achievement[] = [
    {
        id: 'tata-imagination-2024',
        title: 'Tata Imagination Challenge 2024',
        detail: 'Advanced to Round 3 — top 0.6% of roughly 1M participants.',
        year: '2024',
    },
    {
        id: 'luminous-technox-2024',
        title: 'Luminous Techno-X Techathon 2024',
        detail: 'Advanced to Round 2 — top 2% of roughly 95k participants.',
        year: '2024',
    },
];

export const CERTIFICATIONS: Certification[] = [
    {
        id: 'aws-cloud-practitioner',
        name: 'AWS Cloud Practitioner Essentials',
        issuer: 'Amazon Web Services',
        status: 'in-progress',
    },
];

export const roleById = (id: string): Role | undefined => ROLES.find((r) => r.id === id);
export const currentRole = (): Role | undefined => ROLES.find((r) => r.current);

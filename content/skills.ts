import type { SkillGroup } from './types';

/**
 * Skills, with evidence instead of percentages.
 *
 * The previous Skills window rendered invented proficiency bars (Figma 90%, Blender 40%,
 * GraphQL 70%) for tools that appear nowhere in the resume. Those are gone. Each entry here is
 * either named in the resume or demonstrated by code in this repository, and `evidence` points at
 * the role or project ids that back it up — which is also what makes a "show me where you used
 * this" interaction possible.
 *
 * `level` is a self-assessment in three honest bands, mirroring the resume's own hedging
 * ("Angular (basic)", "Docker (basic)"):
 *   proficient — used to build the substantial parts of a shipped system
 *   working    — used productively on real tasks
 *   familiar   — used, but not deeply; the resume itself marks these as basic
 */
export const SKILL_GROUPS: SkillGroup[] = [
    {
        id: 'languages',
        label: 'Languages',
        skills: [
            { name: 'Python', level: 'proficient', evidence: ['here-technologies', 'bypass-lane-graph'] },
            { name: 'Java', level: 'proficient', evidence: ['vxo-digital', 'url-shortener', 'enterprise-modules'] },
            { name: 'JavaScript / TypeScript', level: 'proficient', evidence: ['os-portfolio', 'here-technologies'] },
            { name: 'SQL', level: 'working', evidence: ['vxo-digital', 'url-shortener'] },
            { name: 'HTML / CSS', level: 'working', evidence: ['os-portfolio'] },
        ],
    },
    {
        id: 'backend',
        label: 'Backend',
        skills: [
            { name: 'Spring Boot', level: 'proficient', evidence: ['vxo-digital', 'url-shortener', 'enterprise-modules'] },
            { name: 'REST API design', level: 'proficient', evidence: ['vxo-digital', 'enterprise-modules'] },
            { name: 'JPA / Hibernate', level: 'working', evidence: ['url-shortener'] },
            { name: 'Node.js', level: 'working', evidence: ['here-technologies'] },
        ],
    },
    {
        id: 'geospatial-ml',
        label: 'Geospatial & ML',
        skills: [
            { name: 'Graph neural networks', level: 'working', evidence: ['bypass-lane-graph'] },
            { name: 'PyTorch / PyTorch Geometric', level: 'working', evidence: ['bypass-lane-graph'] },
            { name: 'GeoPandas / GeoJSON', level: 'working', evidence: ['here-technologies', 'bypass-lane-graph'] },
            { name: 'Road topology & spatial features', level: 'working', evidence: ['bypass-lane-graph'] },
            { name: 'NumPy / Pandas', level: 'working', evidence: ['here-technologies'] },
        ],
    },
    {
        id: 'frontend',
        label: 'Frontend',
        skills: [
            { name: 'React / Next.js', level: 'proficient', evidence: ['os-portfolio'] },
            { name: 'Tailwind CSS', level: 'working', evidence: ['os-portfolio'] },
            { name: 'Angular', level: 'familiar', evidence: ['vxo-digital', 'enterprise-modules'] },
        ],
    },
    {
        id: 'tools',
        label: 'Tools & Platform',
        skills: [
            { name: 'Git', level: 'working', evidence: ['vxo-digital', 'os-portfolio'] },
            { name: 'Postman', level: 'working', evidence: ['vxo-digital'] },
            { name: 'AWS EC2', level: 'familiar', evidence: [] },
            { name: 'GitHub Actions', level: 'familiar', evidence: [] },
            { name: 'Docker', level: 'familiar', evidence: [] },
        ],
    },
];

export const allSkills = () => SKILL_GROUPS.flatMap((g) => g.skills);

export const skillsForEvidence = (id: string) =>
    allSkills().filter((s) => s.evidence.includes(id));

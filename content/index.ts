/**
 * Single source of truth for every portfolio fact.
 *
 * Import from `@/content` — never reach into a component for data, and never hardcode a name,
 * job title, link or stack list inside a component again. See `content/CLAUDE.md`.
 */

export * from './types';
export * from './profile';
export * from './experience';
export * from './projects';
export * from './skills';

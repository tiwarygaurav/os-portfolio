/**
 * The module graph, loaded and mounted at /usr/src.
 *
 * Importing this module is what mounts it: the Command Prompt, Explorer and System Information import
 * it, and they are all loaded only when first opened, so the graph (generated at build time by
 * `scripts/gen-architecture.mjs`) never weighs on the first page load. Anything else that wants
 * `/usr/src` imports this too.
 */
import { ARCHITECTURE } from './architecture.generated';
import { mountSource, type SourceMap } from './vfs';

export const SOURCE: SourceMap = ARCHITECTURE;

mountSource(SOURCE);

/**
 * Resolve the `@/` import alias against the compiled output, the way the bundler resolves it
 * against the source. Loaded with `node --require` before the tests run.
 */
const path = require('path');
const Module = require('module');

const OUT = path.resolve(__dirname, '../../.test-out');
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
    if (request.startsWith('@/')) return resolve.call(this, path.join(OUT, request.slice(2)), ...rest);
    return resolve.call(this, request, ...rest);
};

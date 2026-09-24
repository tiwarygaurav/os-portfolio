/**
 * The analysis behind `scripts/gen-architecture.mjs`, on the TypeScript compiler's own parser: what
 * each module imports, what it says about itself, and whether the headless layers stay headless.
 *
 * A library, so the unit tests can hand it small made-up trees and check that it catches what it
 * must — the generated graph cannot be its own proof. It used regular expressions over the source;
 * those read an "import" inside a string or a comment as a real one and missed chains through a
 * third module. Parsing is exact, and the rule is checked through every chain.
 */
import ts from 'typescript';

/** Layers that must stay headless: no UI, no store, no npm package unless allowed below. */
const HEADLESS = ['content', 'system'];
/** npm packages a headless module may use. None today; adding one is a decision, made here. */
const HEADLESS_PACKAGES = new Set([]);
/** The one module of the store a headless module may read: pure data, no imports. */
const PURE_STORE_MODULE = 'store/persistence.ts';

/** The layer a module belongs to, in CLAUDE.md's terms. */
export function layerOf(path) {
    for (const prefix of ['components/os', 'components/apps', 'components/ui']) if (path.startsWith(`${prefix}/`)) return prefix;
    return path.split('/')[0];
}

const packageName = (spec) => (spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]);

/** A specifier resolved to a module we know, null for a package, undefined for anything else (CSS). */
function resolve(spec, from, known) {
    let base;
    if (spec.startsWith('@/')) base = spec.slice(2);
    else if (spec.startsWith('./') || spec.startsWith('../')) {
        const parts = from.split('/').slice(0, -1);
        for (const seg of spec.split('/')) {
            if (seg === '..') parts.pop();
            else if (seg !== '.') parts.push(seg);
        }
        base = parts.join('/');
    } else return null;
    for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
        if (known.has(candidate)) return candidate;
    }
    return undefined;
}

/** The paragraphs of a /** comment, as written. */
function paragraphsOf(raw) {
    return raw
        .replace(/^\/\*\*/, '')
        .replace(/\*\/$/, '')
        .split('\n')
        .map((l) => l.replace(/^\s*\*\s?/, ''))
        .join('\n')
        .trim()
        .split(/\n\s*\n/)
        .map((p) => p.replace(/\s+/g, ' ').trim())
        .filter(Boolean);
}

/** A comment's first paragraph, as a summary. */
function docText(raw) {
    const text = paragraphsOf(raw)[0];
    if (!text) return null;
    return text.length > 320 ? `${text.slice(0, 317).replace(/\s+\S*$/, '')}...` : text;
}

const isDirective = (s) => ts.isExpressionStatement(s) && ts.isStringLiteral(s.expression);
const isDefaultExport = (s) =>
    ts.isExportAssignment(s) ||
    ((ts.isFunctionDeclaration(s) || ts.isClassDeclaration(s)) &&
        (ts.getModifiers(s) ?? []).some((m) => m.kind === ts.SyntaxKind.DefaultKeyword));

/**
 * What the module says about itself, and which rule found it. In the file's opening, a /** comment
 * among the imports (nobody documents an import), or one standing on its own before the first real
 * statement, is the file's. Failing that, the comment on the default export; failing that, an
 * overview of several paragraphs on the module's first statement when it opens the file or that
 * statement is exported, which is how many files here begin. A one-paragraph comment on a
 * declaration, or any on a private helper after the imports, describes that thing and not the file.
 * Taking the first comment anywhere labelled the store "Launch argument passed to an app...".
 */
function summaryOf(sf, text) {
    const docs = (node) =>
        (ts.getLeadingCommentRanges(text, node.getFullStart()) ?? [])
            .filter((c) => c.kind === ts.SyntaxKind.MultiLineCommentTrivia && text.startsWith('/**', c.pos))
            .map((c) => ({
                raw: text.slice(c.pos, c.end),
                attached: !/\n[ \t]*\r?\n/.test(text.slice(c.end, node.getStart(sf))),
                first: text.slice(0, c.pos).trim() === '',
            }));

    let first;
    for (const statement of sf.statements) {
        const opening = ts.isImportDeclaration(statement) || isDirective(statement);
        const found = docs(statement);
        const own = opening ? found[0] : found.find((d) => !d.attached);
        if (own) return { text: docText(own.raw), rule: opening ? 'opening' : 'standalone' };
        if (!opening) {
            first = statement;
            break;
        }
    }
    const main = sf.statements.find(isDefaultExport);
    const onMain = main ? docs(main).filter((d) => d.attached).pop() : undefined;
    if (onMain) return { text: docText(onMain.raw), rule: 'default export' };
    // An overview that opens the file, or sits on the first thing it exports. After the imports, on a
    // private helper, it is the helper's.
    const exported = first && (ts.getModifiers(first) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    const overview = first ? docs(first).find((d) => d.attached && (exported || d.first) && paragraphsOf(d.raw).length > 1) : undefined;
    return overview ? { text: docText(overview.raw), rule: 'overview' } : { text: null, rule: 'none' };
}

/** Everything one file imports, and whether it draws JSX. */
function scan(file, known) {
    const kind = file.path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const sf = ts.createSourceFile(file.path, file.source, ts.ScriptTarget.Latest, true, kind);
    const imports = new Map();
    const packages = new Set();
    let jsx = false;
    let unresolvable = 0;

    const note = (spec, how) => {
        const target = resolve(spec, file.path, known);
        if (target === null) {
            packages.add(packageName(spec));
            return;
        }
        if (target === undefined) return;
        const prev = imports.get(target);
        // A module imported several ways is as strong as its strongest import.
        imports.set(target, {
            typeOnly: (prev ? prev.typeOnly : true) && how.typeOnly,
            lazy: (prev ? prev.lazy : true) && how.lazy,
        });
    };

    const visit = (node) => {
        if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
            const clause = node.importClause;
            const named = clause?.namedBindings && ts.isNamedImports(clause.namedBindings) ? clause.namedBindings.elements : [];
            const typeOnly =
                !!clause && (clause.isTypeOnly || (!clause.name && named.length > 0 && named.every((e) => e.isTypeOnly)));
            note(node.moduleSpecifier.text, { typeOnly, lazy: false });
        } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
            const named = node.exportClause && ts.isNamedExports(node.exportClause) ? node.exportClause.elements : [];
            const typeOnly = node.isTypeOnly || (named.length > 0 && named.every((e) => e.isTypeOnly));
            note(node.moduleSpecifier.text, { typeOnly, lazy: false });
        } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
            const arg = node.arguments[0];
            if (arg && (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg))) note(arg.text, { typeOnly: false, lazy: true });
            else unresolvable++;
        } else if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) {
            jsx = true;
        }
        ts.forEachChild(node, visit);
    };
    visit(sf);

    const text = file.source;
    const summary = summaryOf(sf, text);
    return {
        path: file.path,
        layer: layerOf(file.path),
        // Lines as an editor counts them: a trailing newline does not start another.
        lines: text.split('\n').length - (text.endsWith('\n') ? 1 : 0),
        summary: summary.text,
        summaryFrom: summary.rule,
        imports: [...imports.entries()].map(([to, how]) => ({ to, typeOnly: how.typeOnly, lazy: how.lazy })),
        packages: [...packages].sort(),
        jsx,
        unresolvable,
    };
}

/** Why a module reached from a headless one breaks the rule, or null. */
function breaks(m) {
    if (m.path.startsWith('components/') || m.path.startsWith('app/')) return `imports ${m.path.split('/')[0]}/`;
    if (m.path.startsWith('store/') && m.path !== PURE_STORE_MODULE) return 'imports the store';
    const pkg = m.packages.find((p) => !HEADLESS_PACKAGES.has(p));
    if (pkg) return `uses the npm package ${pkg}`;
    if (m.jsx) return 'draws JSX';
    if (m.unresolvable) return 'has an import() whose target cannot be known';
    return null;
}

/** Analyse a tree: `files` are its modules, as { path, source } with paths relative to the root. */
export function analyse(files) {
    const known = new Set(files.map((f) => f.path));
    const scanned = files.map((f) => scan(f, known));
    const byPath = new Map(scanned.map((m) => [m.path, m]));

    /*
     * CLAUDE.md's rule, through every chain: a content/ or system/ module, and every module its
     * runtime imports reach (type-only imports are erased and do not count), must not import
     * components/, app/ or the store (bar its pure-data persistence list), use an npm package, or
     * draw JSX. The regex scanner only looked one import deep.
     */
    const violations = [];
    const checkedImports = new Set();
    const checkedModules = new Set();
    for (const start of scanned.filter((m) => HEADLESS.includes(m.layer))) {
        const seen = new Set([start.path]);
        const queue = [[start.path]];
        while (queue.length) {
            const chain = queue.shift();
            const m = byPath.get(chain[chain.length - 1]);
            if (!m) continue;
            checkedModules.add(m.path);
            const why = breaks(m);
            if (why) {
                violations.push({ from: start.path, to: m.path, rule: `${start.layer}/ must stay headless: ${chain.join(' -> ')} ${why}` });
                continue;
            }
            for (const i of m.imports) {
                if (i.typeOnly) continue;
                checkedImports.add(`${m.path} ${i.to}`);
                if (seen.has(i.to)) continue;
                seen.add(i.to);
                queue.push([...chain, i.to]);
            }
        }
    }

    // eslint-disable-next-line no-unused-vars -- the rule's working, not part of the graph
    const modules = scanned.map(({ jsx, unresolvable, summaryFrom, ...m }) => m).sort((a, b) => a.path.localeCompare(b.path));
    /** Which rule found each summary: 'opening', 'standalone', 'overview', 'default export' or 'none'. */
    const summaryFrom = Object.fromEntries(scanned.map((m) => [m.path, m.summaryFrom]));
    return { modules, violations, checked: { modules: checkedModules.size, imports: checkedImports.size }, summaryFrom };
}

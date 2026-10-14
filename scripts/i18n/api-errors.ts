/**
 * Inventory of the error codes and messages the evaluation API can send to a
 * person (launch L-23b, spec P-45): every `new EvalError(code, status,
 * message)` in the server code, the message tables behind them, the helpers
 * that forward a message to one, and the `{ error: { code, message } }`
 * bodies written by routes outside the `api()` envelope.
 *
 * The app shows these in the reader's language (`localizeApiError` in
 * `lib/evals/messages/api-errors.ts`): a known sentence by its Spanish entry,
 * otherwise the code's own message. `tests/i18n/api-errors.test.ts` and
 * `npm run i18n:check-parity` fail when an emitted code or sentence has no
 * entry in both languages, or when a message is built at run time somewhere
 * that is not listed in {@link DYNAMIC_SITES}.
 *
 * Static analysis with the TypeScript parser, no type checker: literals,
 * conditionals, `??`/`||`, template literals (kept as patterns), consts and
 * object tables in the same file or imported, spreads of `[status, message]`
 * tuples, and parameters forwarded by local helpers.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

export type Site = { file: string; line: number };
export type Inventory = {
  /** Every code (first argument of an EvalError, or `error.code` in a route body). */
  codes: Map<string, Site[]>;
  /** Every fixed sentence. */
  messages: Map<string, Site[]>;
  /** Template literals as patterns: `Choose at most {} pages.` */
  patterns: Map<string, Site[]>;
  /** Messages or codes the parser cannot resolve, as `code|message: file expression`. */
  dynamic: Map<string, Site>;
  files: number;
};

/** Where the API's error text lives. Tests and fixtures are skipped. */
export const API_ERROR_ROOTS = ["lib/evals", "lib/billing", "lib/legal", "lib/analytics", "lib/workspace", "lib/public", "lib/publication", "app/api"];

/**
 * Error classes whose message reaches the API through a mapper
 * (`throw new EvalError(code, status, error.detail)`): constructor argument
 * index of the text, and of the code when it is passed.
 */
const FORWARDING_CLASSES: Record<string, { message?: number; code?: number; fallback?: string }> = {
  // The constructor's default message (lib/evals/domain/errors.ts).
  EvalError: { code: 0, message: 2, fallback: "This action is not available." },
  // Run estimates (lib/billing/estimate.ts), mapped by billingApiError.
  EstimateError: { code: 0, message: 1 },
};

/** `super(…)` inside a class that extends EvalError. */
function extendsEvalError(node: ts.Node): boolean {
  let scope: ts.Node | undefined = node.parent;
  while (scope && !ts.isClassLike(scope)) scope = scope.parent;
  return !!scope && !!(scope as ts.ClassLikeDeclaration).heritageClauses?.some((clause) => clause.types.some((type) => type.expression.getText() === "EvalError"));
}

/** The object table behind `TABLE[x][n]`, `known[n]` or a destructured `message`. */
function messageTable(expression: ts.Expression, source: ts.SourceFile): ts.Expression | null {
  const node = unwrap(expression);
  if (ts.isIdentifier(node)) {
    const bound = findLocal(node, node.text);
    if (bound && bound.index !== null) {
      let init = unwrap(bound.init);
      while (ts.isBinaryExpression(init) && [ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(init.operatorToken.kind)) init = unwrap(init.left);
      return tableAccess(init, source)?.init ?? null;
    }
    return null;
  }
  return tableAccess(node, source)?.init ?? null;
}

const ERROR_KEYS = new Set(["error"]);

/**
 * Migrations whose RAISE EXCEPTION text an API mapper sends as the message
 * (`lib/evals/sector-packs/store.ts` and `refresh.ts` pass these SQLSTATEs through).
 */
const DATABASE_MESSAGE_SOURCES = [
  { file: "db/migrations/100_evals_sector_packs.sql", codes: ["42501", "55000", "23514", "22023", "22007", "22P02"] },
];

/**
 * Results (not errors) whose `message`/`detail` sentences the app shows: the
 * platform admin's connection and web-search tests and the model list.
 * Values the parser cannot follow are the provider's own words, which the
 * app quotes as such.
 */
const RESULT_MESSAGE_SOURCES = [
  { file: "lib/evals/repositories/engine-settings.ts", functions: ["testConnection", "testWebSearch", "listConnectionModels"], properties: ["message", "detail"] },
];

/** Lists of problem sentences that the API joins into one message. */
const JOINED_PROBLEM_SOURCES = [{ file: "lib/evals/sector-packs/schema.ts", list: "problems" }];

type Value = { kind: "text"; text: string } | { kind: "pattern"; text: string } | { kind: "dynamic"; text: string };

const cache = new Map<string, ts.SourceFile | null>();
function parse(file: string): ts.SourceFile | null {
  if (cache.has(file)) return cache.get(file)!;
  const source = existsSync(file)
    ? ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
    : null;
  cache.set(file, source);
  return source;
}

function resolveModule(from: string, specifier: string): string | null {
  const base = specifier.startsWith("@/") ? path.join(ROOT, specifier.slice(2)) : specifier.startsWith(".") ? path.resolve(path.dirname(from), specifier) : null;
  if (!base) return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) if (existsSync(candidate) && candidate.match(/\.tsx?$/)) return candidate;
  return null;
}

let ROOT = process.cwd();

/** The initializer of a top-level (or enclosing) const named `name`, following imports. */
function findConst(source: ts.SourceFile, name: string, depth = 0): { init: ts.Expression; source: ts.SourceFile } | null {
  if (depth > 4) return null;
  for (const statement of source.statements) {
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.name.text === name && declaration.initializer) return { init: declaration.initializer, source };
      }
    }
    if (ts.isImportDeclaration(statement) && statement.importClause?.namedBindings && ts.isNamedImports(statement.importClause.namedBindings)) {
      for (const element of statement.importClause.namedBindings.elements) {
        if (element.name.text !== name) continue;
        const target = resolveModule(source.fileName, (statement.moduleSpecifier as ts.StringLiteral).text);
        const parsed = target ? parse(target) : null;
        if (parsed) return findConst(parsed, (element.propertyName ?? element.name).text, depth + 1);
      }
    }
  }
  return null;
}

/** Local const in the enclosing blocks of `node`. */
function findLocalConst(node: ts.Node, name: string): ts.Expression | null {
  return findLocal(node, name)?.init ?? null;
}

/**
 * A const in the enclosing blocks of `node`; `index` is set for a name bound
 * by array destructuring (`const [status, message] = TABLE[code]`).
 */
function findLocal(node: ts.Node, name: string): { init: ts.Expression; index: number | null } | null {
  let scope: ts.Node | undefined = node.parent;
  while (scope) {
    if (ts.isBlock(scope) || ts.isSourceFile(scope) || ts.isModuleBlock(scope)) {
      for (const statement of (scope as ts.Block).statements) {
        if (!ts.isVariableStatement(statement)) continue;
        for (const declaration of statement.declarationList.declarations) {
          if (!declaration.initializer) continue;
          if (ts.isIdentifier(declaration.name) && declaration.name.text === name) return { init: declaration.initializer, index: null };
          if (ts.isArrayBindingPattern(declaration.name)) {
            const index = declaration.name.elements.findIndex((element) => ts.isBindingElement(element) && ts.isIdentifier(element.name) && element.name.text === name);
            if (index >= 0) return { init: declaration.initializer, index };
          }
        }
      }
    }
    scope = scope.parent;
  }
  return null;
}

function unwrap(node: ts.Expression): ts.Expression {
  while (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isNonNullExpression(node) || ts.isTypeAssertionExpression(node)) node = node.expression;
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "freeze" && node.arguments[0]) return unwrap(node.arguments[0]);
  return node;
}

/** Every string leaf of an object/array literal, optionally only tuple element `index`. */
function leaves(node: ts.Expression, source: ts.SourceFile, index: number | null, out: Value[], seen: Set<ts.Node>) {
  node = unwrap(node);
  if (ts.isObjectLiteralExpression(node)) {
    for (const property of node.properties) if (ts.isPropertyAssignment(property)) leaves(property.initializer, source, index, out, seen);
    return;
  }
  if (ts.isArrayLiteralExpression(node)) {
    if (index !== null && node.elements.every((element) => !ts.isArrayLiteralExpression(unwrap(element as ts.Expression)) && !ts.isObjectLiteralExpression(unwrap(element as ts.Expression)))) {
      const element = node.elements[index];
      if (element) out.push(...values(element as ts.Expression, source, seen));
      return;
    }
    for (const element of node.elements) leaves(element as ts.Expression, source, index, out, seen);
    return;
  }
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node) || ts.isConditionalExpression(node)) out.push(...values(node, source, seen));
}

function templatePattern(node: ts.TemplateExpression): string {
  return node.head.text + node.templateSpans.map((span) => `{}${span.literal.text}`).join("");
}

/** `file expression`, without the line, so the allowlist survives edits around it. */
const describe = (node: ts.Node, source: ts.SourceFile) =>
  `${path.relative(ROOT, source.fileName)} ${node.getText(source).replace(/\s+/g, " ").slice(0, 120)}`;

/** The values an expression can take, as far as the parser can tell. */
function values(expression: ts.Expression, source: ts.SourceFile, seen = new Set<ts.Node>()): Value[] {
  const node = unwrap(expression);
  if (seen.has(node)) return [];
  seen.add(node);
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [{ kind: "text", text: node.text }];
  if (ts.isTemplateExpression(node)) return [{ kind: "pattern", text: templatePattern(node) }];
  if (ts.isConditionalExpression(node)) return [...values(node.whenTrue, source, seen), ...values(node.whenFalse, source, seen)];
  if (ts.isBinaryExpression(node) && [ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(node.operatorToken.kind)) {
    return [...values(node.left, source, seen), ...values(node.right, source, seen)];
  }
  if (ts.isIdentifier(node)) {
    const bound = findLocal(node, node.text);
    if (bound && bound.index !== null) {
      const out = boundValues(bound.init, bound.index, source, seen);
      return out.length ? out : [{ kind: "dynamic", text: describe(node, source) }];
    }
    const local = bound?.init ?? findConst(source, node.text)?.init;
    if (local) return values(local, source, seen);
    return [{ kind: "dynamic", text: describe(node, source) }];
  }
  // TABLE[key], TABLE[key][1], TABLE.key, TABLE.key[1]
  const access = tableAccess(node, source);
  if (access) {
    const out: Value[] = [];
    leaves(access.init, access.source, access.index, out, seen);
    return out.length ? out : [{ kind: "dynamic", text: describe(node, source) }];
  }
  return [{ kind: "dynamic", text: describe(node, source) }];
}

/** Element `index` of what `const [a, b] = init` destructures: a table row, a tuple, or either side of `??`. */
function boundValues(init: ts.Expression, index: number, source: ts.SourceFile, seen: Set<ts.Node>): Value[] {
  const node = unwrap(init);
  if (ts.isBinaryExpression(node) && [ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(node.operatorToken.kind)) {
    return [...boundValues(node.left, index, source, seen), ...boundValues(node.right, index, source, seen)];
  }
  if (ts.isArrayLiteralExpression(node)) return node.elements[index] ? values(node.elements[index] as ts.Expression, source, seen) : [];
  const access = tableAccess(node, source);
  if (!access) return [];
  const out: Value[] = [];
  leaves(access.init, access.source, (access.index ?? 0) + index, out, seen);
  return out;
}

/** Resolves `TABLE[x]`, `TABLE[x][n]`, `TABLE.x`, `TABLE.x[n]` and `known[n]` (where `const known = TABLE[x]`). */
function tableAccess(node: ts.Expression, source: ts.SourceFile): { init: ts.Expression; source: ts.SourceFile; index: number | null } | null {
  let index: number | null = null;
  let target = node;
  if (ts.isElementAccessExpression(target) && ts.isNumericLiteral(target.argumentExpression)) {
    index = Number(target.argumentExpression.text);
    target = unwrap(target.expression);
  }
  let base: ts.Expression | null = null;
  let key: string | null = null;
  if (ts.isElementAccessExpression(target)) base = unwrap(target.expression);
  else if (ts.isPropertyAccessExpression(target)) {
    base = unwrap(target.expression);
    key = target.name.text;
  } else if (ts.isIdentifier(target) && index !== null) base = target;
  if (!base || !ts.isIdentifier(base)) return null;
  const local = findLocalConst(base, base.text);
  if (local) {
    const inner = unwrap(local);
    if (ts.isObjectLiteralExpression(inner) || ts.isArrayLiteralExpression(inner)) return { init: inner, source, index };
    const nested = tableAccess(inner, source);
    if (nested) return { ...nested, index: index ?? nested.index };
    return null;
  }
  const found = findConst(source, base.text);
  if (!found) return null;
  let init = unwrap(found.init);
  if (key && ts.isObjectLiteralExpression(init)) {
    const property = init.properties.find((entry) => ts.isPropertyAssignment(entry) && entry.name.getText(found.source).replace(/["']/g, "") === key) as ts.PropertyAssignment | undefined;
    if (property) init = unwrap(property.initializer);
  }
  return { init, source: found.source, index };
}

/** The enclosing function and its parameter index, when `name` is one of its parameters. */
function parameterOf(node: ts.Node, name: string): { fn: ts.SignatureDeclaration; index: number } | null {
  let scope: ts.Node | undefined = node.parent;
  while (scope) {
    if (ts.isFunctionLike(scope)) {
      const index = scope.parameters.findIndex((parameter) => ts.isIdentifier(parameter.name) && parameter.name.text === name);
      if (index >= 0) return { fn: scope, index };
    }
    scope = scope.parent;
  }
  return null;
}

function functionName(fn: ts.SignatureDeclaration): string | null {
  if (ts.isFunctionDeclaration(fn) && fn.name) return fn.name.text;
  if ((ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) && ts.isVariableDeclaration(fn.parent) && ts.isIdentifier(fn.parent.name)) return fn.parent.name.text;
  if (ts.isMethodDeclaration(fn) && ts.isIdentifier(fn.name)) return fn.name.text;
  if (ts.isConstructorDeclaration(fn) && fn.parent.name) return fn.parent.name.text;
  return null;
}

function walk(dir: string, files: string[]) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules" && !entry.name.startsWith(".") && entry.name !== "__fixtures__") walk(full, files);
    } else if (/\.tsx?$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name) && !entry.name.endsWith(".d.ts")) files.push(full);
  }
}

export function collectApiErrors(root = process.cwd()): Inventory {
  ROOT = root;
  cache.clear();
  const inventory: Inventory = { codes: new Map(), messages: new Map(), patterns: new Map(), dynamic: new Map(), files: 0 };
  const files: string[] = [];
  for (const dir of API_ERROR_ROOTS) walk(path.join(root, dir), files);
  inventory.files = files.length;

  const add = (map: Map<string, Site[]>, key: string, site: Site) => {
    const list = map.get(key) ?? [];
    list.push(site);
    map.set(key, list);
  };

  const record = (list: Value[], site: Site, kind: "code" | "message") => {
    for (const value of list) {
      if (value.kind === "dynamic") inventory.dynamic.set(`${kind}: ${value.text}`, site);
      else if (kind === "code") {
        if (value.kind === "text") add(inventory.codes, value.text, site);
        else inventory.dynamic.set(`code: ${value.text}`, site);
      } else if (value.kind === "text") add(inventory.messages, value.text.trim(), site);
      else add(inventory.patterns, value.text.trim(), site);
    }
  };

  /** Call sites of a local helper whose parameter becomes the message. */
  const forwarded = (fn: ts.SignatureDeclaration, index: number, source: ts.SourceFile, kind: "code" | "message", depth = 0) => {
    const name = functionName(fn);
    if (!name || depth > 3) return false;
    let found = false;
    const owner = ts.isConstructorDeclaration(fn) ? fn.parent : fn;
    const exported = !!ts.getCombinedModifierFlags(owner as ts.Declaration) && (ts.getCombinedModifierFlags(owner as ts.Declaration) & ts.ModifierFlags.Export) !== 0;
    const search = (file: ts.SourceFile) => {
      const visit = (node: ts.Node) => {
        if ((ts.isCallExpression(node) || ts.isNewExpression(node)) && ts.isIdentifier(node.expression) && node.expression.text === name) {
          found = true;
          const site = siteOf(node, file);
          const argument = node.arguments?.[index];
          if (argument) resolveArgument(argument, file, site, kind, depth + 1);
          else if (fn.parameters[index]?.initializer) record(values(fn.parameters[index].initializer!, source), site, kind);
        }
        ts.forEachChild(node, visit);
      };
      visit(file);
    };
    search(source);
    if (exported) for (const other of files) if (other !== source.fileName && readFileSync(other, "utf8").includes(name)) { const parsed = parse(other); if (parsed) search(parsed); }
    // Default value of the parameter also counts.
    if (fn.parameters[index]?.initializer) record(values(fn.parameters[index].initializer!, source), siteOf(fn, source), kind);
    return found;
  };

  const resolveArgument = (argument: ts.Expression, source: ts.SourceFile, site: Site, kind: "code" | "message", depth = 0) => {
    const node = unwrap(argument);
    if (ts.isIdentifier(node) && !findLocalConst(node, node.text) && !findConst(source, node.text)) {
      const parameter = parameterOf(node, node.text);
      if (parameter && forwarded(parameter.fn, parameter.index, source, kind, depth)) return;
    }
    record(values(argument, source), site, kind);
  };

  const siteOf = (node: ts.Node, source: ts.SourceFile): Site => ({
    file: path.relative(root, source.fileName),
    line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
  });

  for (const file of files) {
    const source = parse(file);
    if (!source) continue;
    const text = source.text;
    const visit = (node: ts.Node) => {
      // new EvalError(code, status, message), super(…) in its subclasses, and the forwarding classes.
      const callee = ts.isNewExpression(node) && ts.isIdentifier(node.expression) ? node.expression.text
        : ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.SuperKeyword && extendsEvalError(node) ? "EvalError" : null;
      if (callee && FORWARDING_CLASSES[callee]) {
        const shape = FORWARDING_CLASSES[callee];
        const args = (node as ts.NewExpression | ts.CallExpression).arguments ?? [];
        const site = siteOf(node, source);
        const spread = args.findIndex((argument) => ts.isSpreadElement(argument));
        const before = new Set(inventory.dynamic.keys());
        if (shape.code !== undefined && args[shape.code] && !ts.isSpreadElement(args[shape.code])) resolveArgument(args[shape.code], source, site, "code");
        const dynamicCode = [...inventory.dynamic.keys()].filter((key) => !before.has(key) && key.startsWith("code: "));
        let table: ts.Expression | null = null;
        if (shape.message !== undefined) {
          if (spread >= 0 && spread <= shape.message) {
            // new EvalError(code, ...TABLE[x]) — the tuple fills status and message.
            const tuple = (args[spread] as ts.SpreadElement).expression;
            const access = tableAccess(unwrap(tuple), source);
            const offset = shape.message - spread;
            if (access) {
              table = access.init;
              const out: Value[] = [];
              leaves(access.init, access.source, (access.index ?? 0) + offset, out, new Set());
              record(out.length ? out : [{ kind: "dynamic", text: describe(tuple, source) }], site, "message");
            } else record([{ kind: "dynamic", text: describe(tuple, source) }], site, "message");
          } else if (args[shape.message]) {
            table = messageTable(args[shape.message] as ts.Expression, source);
            resolveArgument(args[shape.message] as ts.Expression, source, site, "message");
          } else if (shape.fallback) record([{ kind: "text", text: shape.fallback }], site, "message");
        }
        // A code taken from the error being mapped, with its message from a
        // table keyed by code: the table's keys are the codes.
        if (dynamicCode.length && table && ts.isObjectLiteralExpression(table)) {
          const keys = table.properties.filter(ts.isPropertyAssignment).map((property) => property.name.getText().replace(/["']/g, "")).filter((key) => /^[A-Z][A-Z0-9_]+$/.test(key));
          if (keys.length) {
            for (const key of keys) add(inventory.codes, key, site);
            for (const key of dynamicCode) inventory.dynamic.delete(key);
          }
        }
      }
      // Route bodies outside the api() envelope: { error: { code, message } }.
      if (ts.isPropertyAssignment(node) && ERROR_KEYS.has(node.name.getText(source)) && ts.isObjectLiteralExpression(unwrap(node.initializer))) {
        const body = unwrap(node.initializer) as ts.ObjectLiteralExpression;
        const site = siteOf(node, source);
        for (const property of body.properties) {
          const value = ts.isPropertyAssignment(property) ? property.initializer : ts.isShorthandPropertyAssignment(property) ? property.name : null;
          if (!value || !property.name) continue;
          const key = property.name.getText(source);
          if (key === "code") resolveArgument(value, source, site, "code");
          if (key === "message") resolveArgument(value, source, site, "message");
        }
      }
      ts.forEachChild(node, visit);
    };
    if (/EvalError|error\s*:/.test(text)) visit(source);
  }
  // Database messages a mapper passes through as the API message.
  for (const { file, codes } of DATABASE_MESSAGE_SOURCES) {
    const text = readFileSync(path.join(root, file), "utf8");
    for (const match of text.matchAll(/RAISE EXCEPTION '((?:[^']|'')*)'[^;]*?ERRCODE = '(\w+)'/g)) {
      if (!codes.includes(match[2])) continue;
      const message = match[1].replace(/''/g, "'");
      const line = text.slice(0, match.index).split("\n").length;
      if (message.includes("%")) add(inventory.patterns, message.replace(/%/g, "{}"), { file, line });
      else add(inventory.messages, message, { file, line });
    }
  }

  // Sentences in results the app shows.
  for (const { file, functions, properties } of RESULT_MESSAGE_SOURCES) {
    const source = parse(path.join(root, file));
    if (!source) continue;
    const collect = (expression: ts.Expression, site: Site) => {
      const node = unwrap(expression);
      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
        collect(node.left, site);
        collect(node.right, site);
        return;
      }
      for (const value of values(node, source)) if (value.kind !== "dynamic") record([value], site, "message");
    };
    const visit = (node: ts.Node, inside: boolean) => {
      const name = ts.isFunctionLike(node) ? functionName(node as ts.SignatureDeclaration) : null;
      const within = inside || (!!name && functions.includes(name));
      if (within && ts.isPropertyAssignment(node) && properties.includes(node.name.getText(source)) && ts.isObjectLiteralExpression(node.parent)) collect(node.initializer, siteOf(node, source));
      ts.forEachChild(node, (child) => visit(child, within));
    };
    visit(source, false);
  }

  // Problem sentences joined into one message (sector pack items).
  for (const { file, list } of JOINED_PROBLEM_SOURCES) {
    const source = parse(path.join(root, file));
    if (!source) continue;
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "push" && node.expression.expression.getText(source) === list) {
        const site = siteOf(node, source);
        for (const argument of node.arguments) {
          const target = unwrap(argument);
          const message = ts.isObjectLiteralExpression(target)
            ? (target.properties.find((property) => ts.isPropertyAssignment(property) && property.name.getText(source) === "message") as ts.PropertyAssignment | undefined)?.initializer
            : target;
          if (!message) continue;
          for (const value of values(message, source)) {
            // Validator output (`path: issue`) has no wording of its own.
            if (value.kind === "pattern" && !/[A-Za-z]{3}/.test(value.text.replace(/\{\}/g, ""))) continue;
            if (value.kind !== "dynamic") record([value], site, "message");
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return inventory;
}

/**
 * Codes and messages built at run time that the parser cannot follow, each
 * checked by hand. A new one fails the check until it is listed here with
 * the reason it reaches the reader in Spanish anyway (or made a literal).
 */
export const DYNAMIC_SITES: Record<string, string> = {
  // The envelopes forward an EvalError's code and message, collected where it is thrown.
  "code: lib/evals/domain/http.ts error.code": "api() envelope",
  "message: lib/evals/domain/http.ts error.message": "api() envelope",
  "code: lib/evals/monitoring/tokens.ts error.code": "token API envelope (integrations, English by contract)",
  "message: lib/evals/monitoring/tokens.ts error.message": "token API envelope (integrations, English by contract)",
  "code: lib/evals/private-runner/http.ts error.code": "private runner envelope (CLI, not the app)",
  "message: lib/evals/private-runner/http.ts error.message": "private runner envelope (CLI, not the app)",
  "code: app/api/evals/v1/billing/estimates/route.ts error.code": "token estimate envelope (integrations)",
  "message: app/api/evals/v1/billing/estimates/route.ts error.message": "token estimate envelope (integrations)",
  "code: app/api/evals/v1/integrations/[resource]/route.ts error.code": "token API envelope (integrations)",
  "code: app/api/evals/v1/integrations/ci/[id]/route.ts error.code": "token API envelope (integrations)",
  "code: app/api/evals/v1/runner/pair/route.ts error.code": "runner pairing envelope (CLI)",
  "message: app/api/evals/v1/runner/pair/route.ts error.message": "runner pairing envelope (CLI)",
  // Run-estimate errors: the detail is the message of a `new EstimateError(code, detail)`, collected above.
  "message: lib/billing/api.ts error.detail": "EstimateError detail",
  // Database messages of the sector pack functions (DATABASE_MESSAGE_SOURCES).
  "message: lib/evals/sector-packs/store.ts error.message": "sector pack database message",
  "message: lib/evals/sector-packs/refresh.ts error.message": "sector pack database message",
  // Item problems joined with spaces (JOINED_PROBLEM_SOURCES); the app translates each sentence.
  "message: lib/evals/sector-packs/store.ts problems.join(\" \")": "sector pack item problems",
};

export type ApiErrorCatalogue = {
  /** Spanish for a fixed sentence, or null. */
  spanish(message: string): string | null;
  /** Spanish patterns by their English key (`{}` per run-time part). */
  patterns: Record<string, unknown>;
  /** Messages per code, both languages. */
  codes: Record<string, { en: string; es: string }>;
  /** Spanish tables written for the API, to find entries nothing sends any more. */
  owned: Record<string, string>;
};

/** Everything missing or stale, as readable lines; empty when the API speaks both languages. */
export function apiErrorProblems(inventory: Inventory, catalogue: ApiErrorCatalogue): { kind: string; items: string[] }[] {
  const where = (sites: Site[]) => `${sites[0].file}:${sites[0].line}${sites.length > 1 ? ` (+${sites.length - 1})` : ""}`;
  const codes = [...inventory.codes].filter(([code]) => code !== "");
  const messages = [...inventory.messages].filter(([message]) => message.trim() !== "");
  const slots = (template: string) => (template.match(/\{\}/g) ?? []).length;
  const problems = [
    {
      kind: "error codes without a message in API_CODES (lib/evals/messages/api-errors.ts)",
      items: codes.filter(([code]) => !Object.hasOwn(catalogue.codes, code) || !catalogue.codes[code].en.trim() || !catalogue.codes[code].es.trim()).map(([code, sites]) => `${code} (${where(sites)})`),
    },
    {
      kind: "error codes whose Spanish is the English",
      items: codes.filter(([code]) => Object.hasOwn(catalogue.codes, code) && catalogue.codes[code].en === catalogue.codes[code].es).map(([code]) => code),
    },
    {
      kind: "API messages without Spanish (API_MESSAGES_ES)",
      items: messages.filter(([message]) => catalogue.spanish(message) === null).map(([message, sites]) => `“${message}” (${where(sites)})`),
    },
    {
      kind: "API messages whose Spanish is the English",
      items: messages.filter(([message]) => catalogue.spanish(message) === message).map(([message]) => `“${message}”`),
    },
    {
      kind: "API message patterns without Spanish (API_PATTERNS_ES)",
      items: [...inventory.patterns].filter(([pattern]) => !Object.hasOwn(catalogue.patterns, pattern)).map(([pattern, sites]) => `“${pattern}” (${where(sites)})`),
    },
    {
      kind: "Spanish patterns that use a part the English does not have",
      items: Object.entries(catalogue.patterns)
        .filter(([english, spanish]) => typeof spanish === "string" && [...spanish.matchAll(/\{(\d+)\}/g)].some((match) => Number(match[1]) >= slots(english)))
        .map(([english]) => `“${english}”`),
    },
    {
      kind: "messages or codes built at run time and not reviewed (DYNAMIC_SITES in scripts/i18n/api-errors.ts)",
      items: [...inventory.dynamic.keys()].filter((key) => !Object.hasOwn(DYNAMIC_SITES, key)),
    },
    {
      kind: "DYNAMIC_SITES entries that no longer match the code",
      items: Object.keys(DYNAMIC_SITES).filter((key) => !inventory.dynamic.has(key)),
    },
    {
      kind: "Spanish entries for API messages nothing sends any more",
      items: [
        ...Object.keys(catalogue.owned).filter((message) => !inventory.messages.has(message)),
        ...Object.keys(catalogue.patterns).filter((pattern) => !inventory.patterns.has(pattern)),
      ].map((message) => `“${message}”`),
    },
  ];
  return problems.filter((problem) => problem.items.length);
}

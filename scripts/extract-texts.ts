import fs from "fs";
import path from "path";
import ts from "typescript";

const projectRoot = process.cwd();
const excludeDirs = new Set([
  "node_modules",
  ".next",
  ".git",
  "dist",
  "build",
  "out",
  "coverage",
  "scripts",
]);
const textAttributes = new Set([
  "aria-label",
  "aria-description",
  "aria-roledescription",
  "aria-valuetext",
  "aria-placeholder",
  "placeholder",
  "alt",
  "title",
]);
const textualKeywords = [
  "label",
  "title",
  "description",
  "text",
  "message",
  "name",
  "heading",
  "subtitle",
  "note",
  "copy",
  "question",
  "answer",
  "placeholder",
  "role",
  "category",
  "dataset",
  "plan",
  "value",
  "type",
  "item",
  "option",
  "badge",
  "caption",
  "empty",
  "stat",
  "section",
  "link",
  "menu",
  "navigation",
  "summary",
  "tooltip",
  "helper",
  "cta",
  "status",
  "step",
  "goal",
  "benefit",
  "feature",
  "metric",
  "quote",
  "testimonial",
  "highlight",
  "instruction",
  "error",
  "success",
  "warning",
  "field",
  "tagline",
  "prompt",
  "button",
  "ctaText",
  "ctaLabel",
  "ctaTitle",
  "ctaDescription",
  "hero",
  "callout",
  "card",
  "toast",
  "alert",
  "tooltip",
];
const skipNames = new Set(["className", "href", "src", "id", "type", "value", "width", "height", "viewBox"]);
const textualCallees = ["toast", "alert", "confirm", "notify", "error", "success"];

const files: string[] = [];

function walk(dir: string) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (excludeDirs.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
    } else if (
      entry.isFile() &&
      (entry.name.endsWith(".tsx") || entry.name.endsWith(".ts"))
    ) {
      files.push(fullPath);
    }
  }
}

walk(projectRoot);

const texts = new Set<string>();

function addText(value: string | undefined) {
  if (!value) return;
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return;
  texts.add(normalized);
}

function nameMatches(name: string | undefined) {
  if (!name) return false;
  if (skipNames.has(name)) return false;
  const lower = name.toLowerCase();
  return textualKeywords.some((keyword) => lower === keyword || lower.endsWith(keyword));
}

function isTextualVariable(node: ts.VariableDeclaration | undefined) {
  if (!node || !node.name) return false;
  if (ts.isIdentifier(node.name)) {
    return nameMatches(node.name.text) || /copy|text|label|title|message|content|list|menu|nav|options|links|items|stats|data/i.test(node.name.text);
  }
  return false;
}

function collectFromNode(node: ts.Node) {
  if (ts.isJsxText(node)) {
    addText(node.getText());
  } else if (ts.isJsxExpression(node)) {
    const expression = node.expression;
    if (expression && ts.isStringLiteralLike(expression)) {
      addText(expression.text);
    }
  } else if (ts.isJsxAttribute(node)) {
    const attrName = node.name.getText();
    if (textAttributes.has(attrName) && node.initializer) {
      if (ts.isStringLiteralLike(node.initializer)) {
        addText(node.initializer.text);
      } else if (
        ts.isJsxExpression(node.initializer) &&
        node.initializer.expression &&
        ts.isStringLiteralLike(node.initializer.expression)
      ) {
        addText(node.initializer.expression.text);
      }
    }
  } else if (ts.isStringLiteralLike(node)) {
    const parent = node.parent;
    if (ts.isPropertyAssignment(parent) && parent.initializer === node) {
      const name = parent.name && ts.isIdentifier(parent.name) ? parent.name.text : undefined;
      if (nameMatches(name)) {
        addText(node.text);
      }
    } else if (ts.isArrayLiteralExpression(parent)) {
      let current: ts.Node | undefined = parent.parent;
      let added = false;
      while (current && !added) {
        if (ts.isVariableDeclaration(current) && isTextualVariable(current)) {
          addText(node.text);
          added = true;
        } else if (ts.isPropertyAssignment(current)) {
          const propName = current.name && ts.isIdentifier(current.name) ? current.name.text : undefined;
          if (nameMatches(propName)) {
            addText(node.text);
            added = true;
          }
          break;
        } else {
          current = current.parent;
        }
      }
    } else if (ts.isCallExpression(parent)) {
      const expression = parent.expression;
      let callee: string | undefined;
      if (ts.isIdentifier(expression)) {
        callee = expression.text;
      } else if (ts.isPropertyAccessExpression(expression) && ts.isIdentifier(expression.name)) {
        callee = expression.name.text;
      }
      if (callee && textualCallees.some((name) => callee!.includes(name))) {
        addText(node.text);
      }
    }
  }

  node.forEachChild(collectFromNode);
}

for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  const scriptKind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, scriptKind);
  sourceFile.forEachChild(collectFromNode);
}

const sorted = Array.from(texts).sort((a, b) => a.localeCompare(b));
fs.writeFileSync(path.join(projectRoot, "translations-source.json"), JSON.stringify(sorted, null, 2));
console.log(`Extracted ${sorted.length} unique text entries to translations-source.json`);

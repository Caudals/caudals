import { cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { type Translator } from "./create-translator";

const TEXT_ATTRIBUTES = [
  "aria-label",
  "aria-description",
  "aria-roledescription",
  "aria-valuetext",
  "aria-placeholder",
  "placeholder",
  "title",
  "alt",
] as const;

function translateText(value: string, translator: Translator) {
  if (!value.trim()) {
    return value;
  }

  const leadingWhitespace = value.match(/^\s+/)?.[0] ?? "";
  const trailingWhitespace = value.match(/\s+$/)?.[0] ?? "";
  const core = value.slice(
    leadingWhitespace.length,
    value.length - trailingWhitespace.length,
  );
  const translated = translator(core);
  return `${leadingWhitespace}${translated}${trailingWhitespace}`;
}

function translateArray(children: ReactNode[], translator: Translator) {
  let changed = false;
  const nextChildren = children.map((child) => {
    const translated = translateReactNode(child, translator);
    if (translated !== child) {
      changed = true;
    }
    return translated;
  });

  return changed ? nextChildren : children;
}

function translateElement(
  element: ReactElement,
  translator: Translator,
): ReactElement {
  const props: Record<string, unknown> = {};
  let changed = false;
  const elementProps = element.props as {
    children?: ReactNode;
    [key: string]: unknown;
  };

  if (elementProps?.children !== undefined) {
    const translatedChildren = translateReactNode(
      elementProps.children,
      translator,
    );
    if (translatedChildren !== elementProps.children) {
      props.children = translatedChildren;
      changed = true;
    }
  }

  for (const attr of TEXT_ATTRIBUTES) {
    const value = elementProps?.[attr];
    if (typeof value === "string") {
      const translated = translateText(value, translator);
      if (translated !== value) {
        props[attr] = translated;
        changed = true;
      }
    }
  }

  return changed ? cloneElement(element, props) : element;
}

export function translateReactNode(
  node: ReactNode,
  translator: Translator,
): ReactNode {
  if (typeof node === "string") {
    return translateText(node, translator);
  }

  if (Array.isArray(node)) {
    return translateArray(node, translator);
  }

  return isValidElement(node) ? translateElement(node, translator) : node;
}

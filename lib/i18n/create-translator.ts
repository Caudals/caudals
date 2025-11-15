import { defaultLocale, type Locale } from "./config";
import { type PlaceholderDefinition } from "./placeholder-translations";

export type TranslationValues = Record<string, string | number>;

export type Translator = (message: string, values?: TranslationValues) => string;

const PLACEHOLDER_REGEX = /\{\{(.*?)\}\}/g;
const PLACEHOLDER_TOKEN = /\{\{\s*(.+?)\s*\}\}/g;

type CompiledPlaceholder = {
  regex: RegExp;
  placeholders: string[];
  translation: string;
};

function applyValues(template: string, values?: TranslationValues) {
  if (!values) return template;

  return template.replace(PLACEHOLDER_REGEX, (_, key: string) => {
    const resolved = values[key.trim()];
    return resolved === undefined ? "" : String(resolved);
  });
}

function escapeRegex(value: string) {
  return value.replace(/[-[\]/{}()*+?.\\^$|]/g, "\\$&");
}

function compilePlaceholders(
  definitions: PlaceholderDefinition[],
) {
  const compiled = definitions.map((definition) => {
    const placeholders: string[] = [];
    const pattern = escapeRegex(definition.key).replace(
      PLACEHOLDER_TOKEN,
      (_, token: string) => {
        const name = token.trim();
        placeholders.push(name);
        return "(.+?)";
      },
    );

    return {
      regex: new RegExp(`^${pattern}$`),
      placeholders,
      translation: definition.translation,
    };
  });

  const templateMap = new Map<string, string>();
  definitions.forEach((definition) => {
    templateMap.set(definition.key, definition.translation);
  });

  return { compiled, templateMap };
}

function translateWithPlaceholders(
  message: string,
  compiled: CompiledPlaceholder[],
) {
  for (const entry of compiled) {
    const match = entry.regex.exec(message);
    if (!match) continue;

    let output = entry.translation;
    entry.placeholders.forEach((placeholder, index) => {
      const value = match[index + 1] ?? "";
      output = output.replace(`{{${placeholder}}}`, value);
    });

    return output;
  }

  return null;
}

export function createTranslator(
  locale: Locale,
  dictionary: Record<string, string>,
  placeholderDefinitions?: PlaceholderDefinition[],
): Translator {
  const placeholderData = compilePlaceholders(placeholderDefinitions ?? []);

  return (message, values) => {
    if (locale === defaultLocale) {
      return applyValues(message, values);
    }

    const template = dictionary[message];
    if (template !== undefined) {
      return applyValues(template, values);
    }

    if (placeholderData?.templateMap.has(message)) {
      const templateTranslation = placeholderData.templateMap.get(message)!;
      return applyValues(templateTranslation, values);
    }

    if (placeholderData.compiled.length) {
      const matched = translateWithPlaceholders(message, placeholderData.compiled);
      if (matched) {
        return matched;
      }
    }

    return applyValues(message, values);
  };
}

export function splitFullName(
  input?: string | null
): { firstName?: string; lastName?: string } {
  if (!input) {
    return {};
  }

  const parts = input
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0);

  if (parts.length === 0) {
    return {};
  }

  const [firstName, ...rest] = parts;
  const lastName = rest.length ? rest.join(" ") : undefined;

  return { firstName, lastName };
}


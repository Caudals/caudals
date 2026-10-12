import type { ExampleBundle } from "./bundle";

/** The committed form of a fixture: stable key order from the builder, two-space indent, trailing newline. */
export function serializeExampleBundle(bundle: ExampleBundle): string {
  return `${JSON.stringify(bundle, null, 2)}\n`;
}

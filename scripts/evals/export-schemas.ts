import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { exportJsonSchemas } from "../../lib/evals/contracts/json-schema";

async function main() {
  const directory = resolve(process.argv[2] ?? "lib/evals/contracts/schemas");
  await mkdir(directory, { recursive: true });
  for (const [name, schema] of Object.entries(exportJsonSchemas())) await writeFile(resolve(directory, `${name}.schema.json`), `${JSON.stringify(schema, null, 2)}\n`);
  process.stdout.write(`Exported CEF 1.0 draft 2020-12 schemas to ${directory}\n`);
}
main().catch((error: unknown) => { process.stderr.write(`${error instanceof Error ? error.message : "Schema export failed"}\n`); process.exitCode = 1; });

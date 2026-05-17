import { runCaudalsCli } from "@/lib/cli/caudals";

runCaudalsCli(process.argv.slice(2))
  .then((exitCode) => {
    process.exitCode = exitCode;
  })
  .catch((error: unknown) => {
    console.error((error as Error).message);
    process.exitCode = 1;
  });

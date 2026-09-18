import { readFile,writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";
import { reportSnapshotSchema } from "../../lib/evals/reports/contracts";
import { renderReportPdf } from "../../lib/evals/reports/render";

const [inputPath,outputPath]=process.argv.slice(2);
if(!inputPath||!outputPath)throw new Error("usage: render-report <snapshot.json> <report.pdf>");
const snapshot=reportSnapshotSchema.parse(JSON.parse(await readFile(inputPath,"utf8")));
const bytes=await renderReportPdf(snapshot,async()=>{const browser=await chromium.launch({headless:true});const page=await browser.newPage();return {page,close:()=>browser.close()};});
await writeFile(outputPath,bytes,{flag:"wx",mode:0o600});

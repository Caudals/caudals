import { readFile,writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";
import { reportSnapshotSchema } from "../../lib/evals/reports/contracts";
import { renderReportPdf } from "../../lib/evals/reports/render";

// usage: render-report <snapshot.json> <report.pdf> [--locale es] [--sample]
const args=process.argv.slice(2),flags=new Set(args.filter(arg=>arg.startsWith("--")));
const localeIndex=args.indexOf("--locale"),locale=localeIndex>=0&&args[localeIndex+1]==="es"?"es":"en";
const [inputPath,outputPath]=args.filter((arg,index)=>!arg.startsWith("--")&&args[index-1]!=="--locale");
if(!inputPath||!outputPath)throw new Error("usage: render-report <snapshot.json> <report.pdf> [--locale es] [--sample]");
const snapshot=reportSnapshotSchema.parse(JSON.parse(await readFile(inputPath,"utf8")));
const bytes=await renderReportPdf(snapshot,async()=>{const browser=await chromium.launch({headless:true});const page=await browser.newPage();return {page,close:()=>browser.close()};},locale,new Set(),{sample:flags.has("--sample")});
await writeFile(outputPath,bytes,{flag:"wx",mode:0o600});

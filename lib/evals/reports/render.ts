import { reportSnapshotSchema, type ReportSnapshot } from "./contracts";
import { spreadsheetSafe } from "../imports/structured";
import { caseSchema } from "../contracts/cases";
import { assessmentSchema,observationSchema } from "../contracts/results";
import { canonicalJson,sha256 } from "../contracts/hashing";
import { renderReportDocument, reportFooterTemplate } from "./document";
import type { ReportLocale } from "./i18n";

/** The client report document; see ./document.ts. */
export function renderReportHtml(raw:ReportSnapshot,locale:ReportLocale="en"):string{return renderReportDocument(reportSnapshotSchema.parse(raw),locale);}

function csvCell(value:string):string {const safe=spreadsheetSafe(value);return /[",\r\n]/.test(safe)?`"${safe.replaceAll('"','""')}"`:safe;}
export function renderResultsCsv(raw:ReportSnapshot):string {const report=reportSnapshotSchema.parse(raw);const header=["case_revision_id","title","topic","severity","outcome","assessment_id","observation_id","input","output","rationale","review_status","source_refs"];const lines=[header.join(",")];for(const item of report.results)lines.push(header.map(key=>csvCell(key==="source_refs"?item.source_refs.map(ref=>`${ref.source_revision_id}#${ref.anchor}`).join(";"):String(item[key as keyof typeof item]??""))).join(","));return lines.join("\r\n")+"\r\n";}
export function renderReportJson(raw:ReportSnapshot):string{return JSON.stringify(reportSnapshotSchema.parse(raw))+"\n";}

export function renderCefJsonl(raw:{report:ReportSnapshot;cases:unknown[];observations:unknown[];assessments:unknown[]}):string {
 const report=reportSnapshotSchema.parse(raw.report),cases=raw.cases.map(value=>caseSchema.parse(value)),observations=raw.observations.map(value=>observationSchema.parse(value)),assessments=raw.assessments.map(value=>assessmentSchema.parse(value));
 const documents=[...cases.map(document=>({record_type:"case" as const,content_hash:document.content_hash,document})),...observations.map(document=>({record_type:"observation" as const,content_hash:document.content_hash,document})),...assessments.map(document=>({record_type:"assessment" as const,content_hash:document.content_hash,document}))];
 const manifest={record_type:"manifest",schema_version:"1.0",cef_version:"1.0",report_revision_id:report.report_revision_id,report_content_hash:report.content_hash,record_count:documents.length,records_sha256:sha256(canonicalJson(documents.map(item=>({record_type:item.record_type,content_hash:item.content_hash}))))};
 return [manifest,...documents].map(value=>canonicalJson(value)).join("\n")+"\n";
}

export interface PdfPage {setContent(html:string,options:{waitUntil:"load"}):Promise<void>;pdf(options:{format:"A4";printBackground:true;displayHeaderFooter:boolean;headerTemplate:string;footerTemplate:string;preferCSSPageSize:true}):Promise<Uint8Array>}
export async function renderReportPdf(raw:ReportSnapshot,createPage:()=>Promise<{page:PdfPage;close:()=>Promise<void>}>,locale:ReportLocale="en"):Promise<Uint8Array>{
 const report=reportSnapshotSchema.parse(raw),owned=await createPage();
 try{
  await owned.page.setContent(renderReportDocument(report,locale),{waitUntil:"load"});
  // Footer on every page: document identity and page numbers (spec §15.3).
  return await owned.page.pdf({format:"A4",printBackground:true,displayHeaderFooter:true,headerTemplate:"<span></span>",footerTemplate:reportFooterTemplate(report,locale),preferCSSPageSize:true});
 }finally{await owned.close();}
}

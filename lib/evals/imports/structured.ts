import JSZip from "jszip";
import { z } from "zod";
import { parseJsonBytes } from "../contracts/bundle";

export const importIntentSchema=z.enum(["questions","questions_with_references","recorded_answers","manual_answers"]);
export const columnMappingSchema=z.strictObject({case_id:z.string().min(1),input:z.string().min(1),reference_answer:z.string().min(1).optional(),system_answer:z.string().min(1).optional(),source:z.string().min(1).optional(),topic:z.string().min(1).optional(),conversation_id:z.string().min(1).optional(),turn_index:z.string().min(1).optional(),expected_tool_calls:z.string().min(1).optional(),suite_version_id:z.string().min(1).optional(),case_revision_id:z.string().min(1).optional()});
export type ColumnMapping=z.infer<typeof columnMappingSchema>;
export type ImportRow={rowNumber:number;original:Record<string,string>;normalized?:Record<string,unknown>;errors:string[]};
export type ImportPreview={headers:string[];rows:ImportRow[];acceptedCount:number;rejectedCount:number;truncated:boolean};

function csvRows(text:string):string[][] {
  const rows:string[][]=[];let row:string[]=[],field="",quoted=false;
  for(let i=0;i<text.length;i++) {const char=text[i];
    if(quoted){if(char==='"'&&text[i+1]==='"'){field+='"';i++;}else if(char==='"')quoted=false;else field+=char;}
    else if(char==='"'){if(field)throw new Error("csv_quote_invalid");quoted=true;}
    else if(char===','){row.push(field);field="";}
    else if(char==='\n'){row.push(field.replace(/\r$/,""));rows.push(row);row=[];field="";}
    else field+=char;
  }
  if(quoted)throw new Error("csv_quote_unclosed");
  if(field||row.length){row.push(field.replace(/\r$/,""));rows.push(row);} return rows;
}
function xmlText(input:string):string{return input.replace(/<[^>]+>/g,"").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,"&");}
function columnIndex(reference:string):number {let value=0;for(const char of reference.match(/^[A-Z]+/)?.[0]??"")value=value*26+char.charCodeAt(0)-64;return value-1;}
async function xlsxRows(bytes:Uint8Array):Promise<string[][]>{
  const zip=await JSZip.loadAsync(bytes,{checkCRC32:true});const names=Object.keys(zip.files);
  if(names.length>256||names.some(name=>name.includes("..")||name.startsWith("/")))throw new Error("xlsx_invalid");
  if(names.some(name=>/vbaProject|externalLink|embeddings\//i.test(name)))throw new Error("xlsx_unsafe_content");
  const sheet=zip.file("xl/worksheets/sheet1.xml");if(!sheet)throw new Error("xlsx_sheet_missing");
  const sharedFile=zip.file("xl/sharedStrings.xml");const shared=sharedFile?[...(await sharedFile.async("string")).matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map(match=>xmlText(match[1])):[];
  const xml=await sheet.async("string");if(xml.length>10_000_000)throw new Error("xlsx_too_large");
  const rows:string[][]=[];
  for(const rowMatch of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {const row:string[]=[];
    for(const cell of rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)){const ref=/\br="([A-Z]+\d+)"/.exec(cell[1])?.[1];if(!ref)continue;const index=columnIndex(ref);if(index>1000)throw new Error("xlsx_too_wide");const formula=/<f\b/.test(cell[2]);const value=/<v\b[^>]*>([\s\S]*?)<\/v>/.exec(cell[2])?.[1];const inline=/<is\b[^>]*>([\s\S]*?)<\/is>/.exec(cell[2])?.[1];if(formula&&value===undefined)throw new Error("xlsx_formula_without_cached_value");let text=value??(inline?xmlText(inline):"");if(/\bt="s"/.test(cell[1]))text=shared[Number(text)]??"";else text=xmlText(text);row[index]=text;}
    rows.push(Array.from({length:row.length},(_,index)=>row[index]??""));
  }
  return rows;
}
function records(rows:string[][]):{headers:string[];records:Record<string,string>[]} {const headers=(rows.shift()??[]).map(x=>x.trim());if(!headers.length||new Set(headers).size!==headers.length||headers.some(x=>!x))throw new Error("headers_invalid");return {headers,records:rows.filter(row=>row.some(Boolean)).map(row=>Object.fromEntries(headers.map((header,index)=>[header,row[index]??""])))};}
function mapRows(headers:string[],records:Record<string,string>[],mapping:ColumnMapping,intent:z.infer<typeof importIntentSchema>,limit:number):ImportPreview {
  const needed=[mapping.case_id,mapping.input,...(intent==="questions_with_references"?[mapping.reference_answer]:[]),...(intent==="recorded_answers"||intent==="manual_answers"?[mapping.system_answer]:[])];
  if(needed.some(name=>!name||!headers.includes(name)))throw new Error("mapping_column_missing");
  const ids=new Set<string>();const turns=new Map<string,number>();
  const all=records.map((original,index)=>{const errors:string[]=[];const caseId=original[mapping.case_id]?.trim(),input=original[mapping.input]??"";if(!caseId)errors.push("case_id_required");if(!input)errors.push("input_required");if(caseId&&ids.has(caseId)&&!mapping.conversation_id)errors.push("duplicate_case_id");if(caseId)ids.add(caseId);
    const conversation=mapping.conversation_id?original[mapping.conversation_id]?.trim():undefined;const turn=mapping.turn_index&&original[mapping.turn_index]!==""?Number(original[mapping.turn_index]):undefined;if(turn!==undefined&&(!Number.isSafeInteger(turn)||turn<0))errors.push("turn_index_invalid");if(conversation&&turn!==undefined){const previous=turns.get(conversation);if(previous!==undefined&&turn<=previous)errors.push("turn_order_conflict");turns.set(conversation,turn);}
    let tools:unknown=undefined;if(mapping.expected_tool_calls&&original[mapping.expected_tool_calls])try{tools=JSON.parse(original[mapping.expected_tool_calls]);}catch{errors.push("expected_tool_calls_invalid_json");}
    const normalized={case_id:caseId,input,reference_answer:mapping.reference_answer?original[mapping.reference_answer]||null:undefined,system_answer:mapping.system_answer?original[mapping.system_answer]||null:undefined,source:mapping.source?original[mapping.source]||null:undefined,topic:mapping.topic?original[mapping.topic]||null:undefined,conversation_id:conversation||null,turn_index:turn??null,expected_tool_calls:tools,suite_version_id:mapping.suite_version_id?original[mapping.suite_version_id]||null:undefined,case_revision_id:mapping.case_revision_id?original[mapping.case_revision_id]||null:undefined};return {rowNumber:index+2,original,normalized,errors};});
  return {headers,rows:all.slice(0,limit),acceptedCount:all.filter(row=>!row.errors.length).length,rejectedCount:all.filter(row=>row.errors.length).length,truncated:all.length>limit};
}
export async function previewImport(bytes:Uint8Array,format:"csv"|"xlsx"|"jsonl",mapping:ColumnMapping,intent:z.infer<typeof importIntentSchema>,previewLimit=10):Promise<ImportPreview>{
  if(bytes.byteLength>25_000_000)throw new Error("import_too_large");let parsed:{headers:string[];records:Record<string,string>[]};
  if(format==="xlsx")parsed=records(await xlsxRows(bytes));else if(format==="csv")parsed=records(csvRows(new TextDecoder("utf-8",{fatal:true}).decode(bytes).replace(/^\uFEFF/,"")));else {const text=new TextDecoder("utf-8",{fatal:true}).decode(bytes);const values=text.split(/\r?\n/).filter(Boolean).map(line=>parseJsonBytes(Buffer.from(line)));if(values.some(value=>!value||typeof value!=="object"||Array.isArray(value)))throw new Error("jsonl_object_required");const headers=[...new Set(values.flatMap(value=>Object.keys(value as object)))];parsed={headers,records:values.map(value=>Object.fromEntries(Object.entries(value as Record<string,unknown>).map(([key,item])=>[key,typeof item==="string"?item:JSON.stringify(item)])))};}
  return mapRows(parsed.headers,parsed.records,columnMappingSchema.parse(mapping),importIntentSchema.parse(intent),previewLimit);
}

export function spreadsheetSafe(value:string):string{return /^[=+\-@\t\r]/.test(value)?`'${value}`:value;}
function csvCell(value:string):string {const safe=spreadsheetSafe(value);return /[",\r\n]/.test(safe)?`"${safe.replaceAll('"','""')}"`:safe;}
export function candidateAnswerTemplate(args:{suiteVersionId:string;cases:Array<{caseId:string;caseRevisionId:string;input:string}>},format:"csv"|"jsonl") {
  const rows=args.cases.map(item=>({suite_version_id:args.suiteVersionId,case_id:item.caseId,case_revision_id:item.caseRevisionId,input:item.input,system_answer:""}));
  if(format==="jsonl")return rows.map(row=>JSON.stringify(row)).join("\n")+"\n";
  const headers=Object.keys(rows[0]??{suite_version_id:"",case_id:"",case_revision_id:"",input:"",system_answer:""});return [headers.join(","),...rows.map(row=>headers.map(header=>csvCell(row[header as keyof typeof row])).join(","))].join("\r\n")+"\r\n";
}
export function matchManualAnswers(rows:ImportRow[],expected:{suiteVersionId:string;caseRevisionIds:string[]}) {
  const allowed=new Set(expected.caseRevisionIds),frequency=new Map<string,number>();const accepted:Array<{caseRevisionId:string;answer:string}>=[],errors:Array<{rowNumber:number;errors:string[]}>=[];
  for(const row of rows){const revision=String(row.normalized?.case_revision_id??"");if(revision)frequency.set(revision,(frequency.get(revision)??0)+1);}
  for(const row of rows){const value=row.normalized??{},current=[...row.errors];if(value.suite_version_id!==expected.suiteVersionId)current.push("suite_version_mismatch");const revision=String(value.case_revision_id??"");if(!allowed.has(revision))current.push("case_revision_mismatch");if((frequency.get(revision)??0)>1)current.push("duplicate_case_revision");const answer=value.system_answer;if(typeof answer!=="string"||!answer)current.push("system_answer_required");if(current.length)errors.push({rowNumber:row.rowNumber,errors:current});else accepted.push({caseRevisionId:revision,answer:String(answer)});}
  const acceptedIds=new Set(accepted.map(item=>item.caseRevisionId));
  return {accepted,errors,missing:expected.caseRevisionIds.filter(id=>!acceptedIds.has(id)),complete:errors.length===0&&acceptedIds.size===allowed.size};
}

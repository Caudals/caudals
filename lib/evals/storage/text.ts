import { spawn } from "node:child_process";
import { DOCX_TYPE, extractDocx } from "./docx";
import { extractTabularText } from "../imports/structured";

export const MAX_SOURCE_BYTES = 25_000_000;
export const MAX_SOURCE_EXTRACTED_CHARS = 1_000_000;
export const CSV_TYPE = "text/csv";
export const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const PDF_TYPE = "application/pdf";
export const TEXT_TYPES = ["text/plain", "text/markdown", DOCX_TYPE, CSV_TYPE, XLSX_TYPE, PDF_TYPE] as const;

function runPoppler(command:string,args:string[],input:Buffer,maxOutput:number,timeoutMs:number):Promise<Buffer>{
  return new Promise((resolve,reject)=>{
    const child=spawn(command,args,{shell:false,windowsHide:true,env:{PATH:"/usr/bin:/bin",HOME:"/tmp",LANG:"C.UTF-8",NODE_ENV:"production"},stdio:"pipe"});
    const output:Buffer[]=[];let size=0;let stderr="";let settled=false;
    const finish=(error?:Error,result?:Buffer)=>{if(settled)return;settled=true;clearTimeout(timer);if(error){child.kill("SIGKILL");reject(error);}else resolve(result??Buffer.alloc(0));};
    const timer=setTimeout(()=>finish(new Error("pdf_extraction_timeout")),timeoutMs);
    child.on("error",()=>finish(new Error("pdf_extractor_unavailable")));
    child.stdout.on("data",(chunk:Buffer)=>{size+=chunk.length;if(size>maxOutput){finish(new Error("pdf_extraction_limit"));return;}output.push(Buffer.from(chunk));});
    child.stderr.on("data",(chunk:Buffer)=>{stderr=(stderr+chunk.toString("utf8")).slice(-2048);});
    child.on("close",(code)=>{if(code!==0)finish(new Error(stderr.includes("Syntax Error")?"pdf_malformed":"pdf_extraction_failed"));else finish(undefined,Buffer.concat(output));});
    child.stdin.on("error",()=>finish(new Error("pdf_input_failed")));
    child.stdin.end(input);
  });
}

async function extractPdf(bytes:Buffer):Promise<string>{
  const metadata=(await runPoppler("pdfinfo",["-"],bytes,32_000,10_000)).toString("utf8");
  const pageCount=Number(/^Pages:\s+(\d+)$/m.exec(metadata)?.[1]);
  if(!Number.isInteger(pageCount)||pageCount<1||pageCount>500)throw new Error("pdf_page_limit");
  const text=(await runPoppler("pdftotext",["-layout","-enc","UTF-8","-"],bytes,MAX_SOURCE_EXTRACTED_CHARS*4,20_000)).toString("utf8");
  const pages=text.split("\f");
  if(pages.length>pageCount+1)throw new Error("pdf_page_count_mismatch");
  const normalized=pages.slice(0,pageCount).map((page,index)=>"Page "+(index+1)+":\n"+page.trim()).filter((page)=>page.endsWith(":\n")===false).join("\n\n");
  if(!normalized.trim())throw new Error("pdf_no_extractable_text");
  return normalized;
}

/** Source extraction runs in the resource-limited document worker. */
export async function extractText(bytes: Uint8Array, mediaType: string):Promise<{extractionVersion:string;chunks:Array<{ordinal:number;excerpt:string;anchor:{kind:"character_range";start:number;end:number;unit:"utf16_code_unit"}}>}> {
  if (!TEXT_TYPES.includes(mediaType as typeof TEXT_TYPES[number])) throw new Error("unsupported_source_type");
  if (!bytes.length || bytes.length > MAX_SOURCE_BYTES) throw new Error("source_size_out_of_bounds");
  let text:string,extractionVersion:string;
  if(mediaType===DOCX_TYPE){text=extractDocx(bytes);extractionVersion="docx-text-v1";}
  else if(mediaType===CSV_TYPE){text=await extractTabularText(bytes,"csv");extractionVersion="csv-table-v1";}
  else if(mediaType===XLSX_TYPE){text=await extractTabularText(bytes,"xlsx");extractionVersion="xlsx-table-v1";}
  else if(mediaType===PDF_TYPE){text=await extractPdf(Buffer.from(bytes));extractionVersion="pdf-text-v1";}
  else{text=new TextDecoder("utf-8",{fatal:true,ignoreBOM:true}).decode(bytes);extractionVersion="utf8-text-v1";}
  if(text.length>MAX_SOURCE_EXTRACTED_CHARS||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text)||/<\s*(?:!doctype|html|script|iframe)\b/i.test(text))throw new Error("source_text_unsupported_or_too_large");
  const chunks=[];
  for(let offset=0;offset<text.length;){
    let end=Math.min(offset+4096,text.length);
    if(end<text.length&&/[\uD800-\uDBFF]/.test(text[end-1]))end--;
    chunks.push({ordinal:chunks.length,excerpt:text.slice(offset,end),anchor:{kind:"character_range" as const,start:offset,end,unit:"utf16_code_unit" as const}});
    offset=end;
  }
  if(!chunks.length)throw new Error("source_text_empty");
  return {extractionVersion,chunks};
}

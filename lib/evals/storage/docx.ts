import { inflateRawSync } from 'node:zlib';
const MAX_XML = 4 * 1024 * 1024;
const MAX_ENTRIES = 128;
export const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Read only bounded ZIP entries. Never inflate the complete archive or invoke Office. */
function entries(bytes: Buffer) {
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (bytes.readUInt32LE(i) === 0x06054b50 && i + 22 + bytes.readUInt16LE(i + 20) === bytes.length) { end = i; break; }
  }
  if (end < 0 || bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6)) throw new Error('Invalid or multi-volume DOCX ZIP');
  const count = bytes.readUInt16LE(end + 10), size = bytes.readUInt32LE(end + 12), start = bytes.readUInt32LE(end + 16);
  if (!count || count > MAX_ENTRIES || count !== bytes.readUInt16LE(end + 8) || start + size !== end) throw new Error('Unsupported DOCX archive bounds');
  const result = new Map<string, {offset:number;compressed:number;expanded:number;method:number}>();
  let pos=start, total=0;
  for (let i=0;i<count;i++) {
    if(pos+46>end || bytes.readUInt32LE(pos)!==0x02014b50) throw new Error('Invalid ZIP directory');
    const flags=bytes.readUInt16LE(pos+8),method=bytes.readUInt16LE(pos+10),compressed=bytes.readUInt32LE(pos+20),expanded=bytes.readUInt32LE(pos+24);
    const length=bytes.readUInt16LE(pos+28),extra=bytes.readUInt16LE(pos+30),comment=bytes.readUInt16LE(pos+32),offset=bytes.readUInt32LE(pos+42);
    if(pos+46+length+extra+comment>end) throw new Error('Truncated ZIP directory');
    const name=new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(pos+46,pos+46+length));
    if(flags & 1 || ![0,8].includes(method) || expanded>MAX_XML || compressed>bytes.length || offset>=start || bytes.readUInt16LE(pos+34) || /(?:^|\/)\.\.(?:\/|$)|\\|^\/|vba|macro|activex|embeddings/i.test(name) || result.has(name)) throw new Error('Unsafe DOCX entry');
    total+=expanded;if(total>8*MAX_XML || expanded>Math.max(1024,compressed*200)) throw new Error('DOCX expansion limit');
    result.set(name,{offset,compressed,expanded,method});pos+=46+length+extra+comment;
  }
  if(pos!==end) throw new Error('Invalid directory size');
  return (name:string) => {
    const e=result.get(name);if(!e) throw new Error('Missing DOCX document part');
    const p=e.offset;
    if(p+30>start || bytes.readUInt32LE(p)!==0x04034b50 || bytes.readUInt16LE(p+8)!==e.method || bytes.readUInt16LE(p+6)&1) throw new Error('Invalid local ZIP header');
    const filenameLength=bytes.readUInt16LE(p+26),data=p+30+filenameLength+bytes.readUInt16LE(p+28);
    if(data+e.compressed>start || bytes.subarray(p+30,p+30+filenameLength).toString('utf8')!==name) throw new Error('Invalid local ZIP bounds');
    const compressed=bytes.subarray(data,data+e.compressed);
    const out=e.method===0?compressed:inflateRawSync(compressed,{maxOutputLength:MAX_XML});
    if(out.length!==e.expanded) throw new Error('DOCX size mismatch');
    return new TextDecoder('utf-8',{fatal:true}).decode(out);
  };
}
function decodeEntities(text:string) {
  return text.replace(/&([^;]{1,32});/g,(_,entity:string)=>{
    const named:Record<string,string>={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"};
    if(named[entity]) return named[entity];
    if(!/^#(?:[0-9]+|x[0-9a-f]+)$/i.test(entity)) throw new Error('Unsupported XML entity');
    const code=entity[1]==='x'?parseInt(entity.slice(2),16):Number(entity.slice(1));
    if(!code || code>0x10ffff || (code>=0xd800&&code<=0xdfff)) throw new Error('Invalid XML character');
    return String.fromCodePoint(code);
  });
}
export function extractDocx(bytes:Uint8Array):string {
  const read=entries(Buffer.from(bytes));
  const types=read('[Content_Types].xml');
  if(/<!|macroEnabled|vbaProject/i.test(types) || !types.includes('wordprocessingml.document.main+xml')) throw new Error('Unsupported Office document');
  const xml=read('word/document.xml');
  if(/<!|encoding\s*=\s*['"](?!utf-8['"])/i.test(xml)) throw new Error('Unsupported XML declarations');
  const stack:string[]=[];const output:string[]=[];let size=0,last=0,root=false;
  const append=(text:string)=>{size+=text.length;if(size>1024*1024) throw new Error('Extracted text limit');output.push(text);};
  while(last<xml.length) {
    const start=xml.indexOf('<',last);if(start<0) break;
    const end=xml.indexOf('>',start);if(end<0) throw new Error('Unterminated XML tag');
    const text=xml.slice(last,start),token=xml.slice(start,end+1);last=end+1;
    if(text.includes('<') || /&(?!(?:amp|lt|gt|quot|apos|#[0-9]+|#x[0-9a-f]+);)/i.test(text)) throw new Error('Malformed XML text');
    if(stack.at(-1)==='w:t') append(decodeEntities(text));
    if(/^<\?xml\s[^?]*\?>$/.test(token) && !root) continue;
    const tag=/^<(\/)?([A-Za-z_][\w:.-]*)(?:\s[^<>]*)?(\/?)>$/.exec(token);
    if(!tag) throw new Error('Malformed DOCX XML');
    const closing=!!tag[1],name=tag[2],self=token.endsWith('/>');
    if(closing) {if(stack.pop()!==name) throw new Error('Mismatched XML tags');if(name==='w:p') append('\n');}
    else {root=true;if(name==='w:tab') append('\t');if(name==='w:br') append('\n');if(!self) stack.push(name);}
    if(stack.length>128) throw new Error('XML nesting limit');
  }
  if(stack.length || !root || xml.slice(last).trim()) throw new Error('Incomplete DOCX XML');
  const text=output.join('');if(Buffer.byteLength(text)>1024*1024 || !text.trim()) throw new Error('Extracted text empty or oversized');return text;
}

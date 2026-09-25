import { describe, expect, it } from 'vitest';
import { CSV_TYPE, extractText, MAX_SOURCE_BYTES, XLSX_TYPE } from '@/lib/evals/storage/text';
import { objectKey } from '@/lib/evals/storage/private';
describe('bounded initial text extraction', () => {
 it('anchors reconstruct UTF-8 source using declared UTF-16 offsets', async () => {
  const text = 'A🙂 paragraph\n'.repeat(500);
  const result = await extractText(Buffer.from(text),'text/plain');
  expect(result.chunks.map(c=>c.excerpt).join('')).toBe(text);
  for (const c of result.chunks) expect(text.slice(c.anchor.start,c.anchor.end)).toBe(c.excerpt);
 });
 it('rejects invalid, oversized, binary, HTML and unsupported documents', async () => {
  for (const [bytes,type] of [[Buffer.from([255]),'text/plain'],[Buffer.alloc(MAX_SOURCE_BYTES+1),'text/plain'],[Buffer.from('PK\0'),'text/plain'],[Buffer.from('<script>alert(1)</script>'),'text/plain'],[Buffer.from('%PDF'),'application/pdf'],[Buffer.from(''),'text/plain']] as const) await expect(extractText(bytes,type)).rejects.toThrow();
 });
 it('scopes random object paths without user filenames', () => {
  const org='11111111-1111-4111-8111-111111111111', id='22222222-2222-4222-8222-222222222222';
  expect(objectKey(org,id)).toMatch(new RegExp(`^evals/${org}/${id}/upload/`));
  expect(objectKey(org,id,true)).toContain('/sealed/');
  expect(()=>objectKey('../other',id)).toThrow();
 });
});

import JSZip from 'jszip';
import { DOCX_TYPE } from '@/lib/evals/storage/docx';
async function docx(xml:string, extra?:[string,string]) {
 const zip=new JSZip();zip.file('[Content_Types].xml','<Types><Override ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
 zip.file('word/document.xml',xml);if(extra) zip.file(...extra);
 return zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'});
}
describe('bounded DOCX extraction',()=>{
 it('extracts text, paragraph and entities with traceable extracted-text offsets',async()=>{
  const result=await extractText(await docx('<w:document><w:body><w:p><w:r><w:t>A &amp; B &#x1f642;</w:t></w:r></w:p></w:body></w:document>'),DOCX_TYPE);
  expect(result.extractionVersion).toBe('docx-text-v1');expect(result.chunks[0].excerpt).toBe('A & B 🙂\n');
 });
 it('rejects macros, DTDs, excessive decompression, nesting and malformed XML',async()=>{
  for(const bytes of [await docx('<w:document/>',['word/vbaProject.bin','macro']),await docx('<!DOCTYPE w [<!ENTITY x SYSTEM "file:///etc/passwd">]><w:document/>'),await docx('<w:t>'+ 'x'.repeat(5*1024*1024)+'</w:t>'),await docx('<w:p>'.repeat(129)+'</w:p>'.repeat(129)),await docx('<w:p><w:t>broken</w:p>'),await docx('<'.repeat(100000))]) await expect(extractText(bytes,DOCX_TYPE)).rejects.toThrow();
 });
 it('bounds actual inflation even if the ZIP directory lies about expanded size',async()=>{
  const bytes=await docx('<w:t>'+'x'.repeat(5*1024*1024)+'</w:t>');
  for(let i=0;i<bytes.length-46;i++) if(bytes.readUInt32LE(i)===0x02014b50 && bytes.subarray(i+46,i+46+bytes.readUInt16LE(i+28)).toString()==='word/document.xml') bytes.writeUInt32LE(1,i+24);
  await expect(extractText(bytes,DOCX_TYPE)).rejects.toThrow();
 });
});

describe('bounded tabular source extraction',()=>{
 it('preserves CSV headers, quoted cells and row context',async()=>{
  const result=await extractText(Buffer.from('topic,rule\nbilling,"Due, within 30 days"\n'),CSV_TYPE);
  expect(result.extractionVersion).toBe('csv-table-v1');
  expect(result.chunks.map(chunk=>chunk.excerpt).join('')).toContain('rule: Due, within 30 days');
 });
 it('extracts XLSX inline strings and rejects formulas without cached values',async()=>{
  const zip=new JSZip();
  zip.file('xl/worksheets/sheet1.xml','<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>topic</t></is></c><c r="B1" t="inlineStr"><is><t>rule</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>billing</t></is></c><c r="B2" t="inlineStr"><is><t>invoice due in 30 days</t></is></c></row></sheetData></worksheet>');
  const result=await extractText(await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'}),XLSX_TYPE);
  expect(result.extractionVersion).toBe('xlsx-table-v1');
  expect(result.chunks.map(chunk=>chunk.excerpt).join('')).toContain('invoice due in 30 days');
  const unsafe=new JSZip();
  unsafe.file('xl/worksheets/sheet1.xml','<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>topic</t></is></c></row><row r="2"><c r="A2"><f>1+1</f></c></row></sheetData></worksheet>');
  await expect(extractText(await unsafe.generateAsync({type:'nodebuffer',compression:'DEFLATE'}),XLSX_TYPE)).rejects.toThrow();
 });
});

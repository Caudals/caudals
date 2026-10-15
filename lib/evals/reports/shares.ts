import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { DisclosureResult } from "../scoring/disclosure";
import { sharedDisclosure } from "./disclosure";
export function createShareToken(){const token=randomBytes(32).toString("base64url");return {token,hash:hashShareToken(token)};}
export function hashShareToken(token:string):string{if(!/^[A-Za-z0-9_-]{43}$/.test(token))throw new Error("share_token_invalid");return createHash("sha256").update(token).digest("hex");}
export function equalShareHash(a:string,b:string):boolean{return /^[a-f0-9]{64}$/.test(a)&&/^[a-f0-9]{64}$/.test(b)&&timingSafeEqual(Buffer.from(a,"hex"),Buffer.from(b,"hex"));}
/**
 * A shared copy: the identity fields and the sections the link allows. The
 * expert-review label (launch L-26) travels with the scope section, like the
 * review status it qualifies. The AI-disclosure check (launch L-29, gap G3)
 * travels with the findings, its quote and conversation only with the
 * results, and only while AI_DISCLOSURE_CHECK is on (`disclosure`).
 */
export function projectSharedReport(report:Record<string,unknown>,permittedFields:unknown,options:{disclosure?:boolean}={}):Record<string,unknown>{if(!Array.isArray(permittedFields)||permittedFields.some(field=>typeof field!=="string"||!/^[a-z_]+$/.test(field)))throw new Error("share_projection_invalid");const mandatory=new Set(["schema_version","report_revision_id","run_id","created_at","content_hash"]);const projected=Object.fromEntries(Object.entries(report).filter(([key])=>key!=="ai_disclosure"&&(mandatory.has(key)||permittedFields.includes(key)||(key==="expert_review"&&permittedFields.includes("scope")))));const disclosure=options.disclosure?sharedDisclosure(report.ai_disclosure as DisclosureResult|undefined,permittedFields as string[]):undefined;return disclosure?{...projected,ai_disclosure:disclosure}:projected;}

import { createHmac, timingSafeEqual } from "node:crypto";

/** Receivers should persist a delivery ID for longer than the five-minute clock window. */
export function createWebhookSignature(secret:Buffer,deliveryId:string,timestamp:string,body:string):string{
  return `v1=${createHmac("sha256",secret).update(`${deliveryId}.${timestamp}.${body}`,"utf8").digest("hex")}`;
}
export async function verifyWebhookSignature(secret:Buffer,args:{id:string;timestamp:string;body:string;signature:string;
  now?:number;accept:(deliveryId:string)=>boolean|Promise<boolean>}):Promise<boolean>{
  const moment=Date.parse(args.timestamp),now=args.now??Date.now();
  if(!Number.isFinite(moment)||Math.abs(now-moment)>5*60_000||!/^[0-9a-f-]{36}$/i.test(args.id))return false;
  const expected=createWebhookSignature(secret,args.id,args.timestamp,args.body),actual=Buffer.from(args.signature),reference=Buffer.from(expected);
  if(actual.length!==reference.length||!timingSafeEqual(actual,reference))return false;
  return args.accept(args.id);
}

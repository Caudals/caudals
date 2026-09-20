import { z } from "zod";

export const scheduleConfigSchema=z.strictObject({
  timezone:z.string().min(1).max(100),cadence:z.enum(["daily","weekly","monthly"]),
  localTime:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(?::00)?$/),
  weekday:z.int().min(1).max(7).nullable(),dayOfMonth:z.int().min(1).max(31).nullable(),
}).superRefine((value,ctx)=>{
  if((value.cadence==="daily"&&(value.weekday!==null||value.dayOfMonth!==null))||
    (value.cadence==="weekly"&&(value.weekday===null||value.dayOfMonth!==null))||
    (value.cadence==="monthly"&&(value.dayOfMonth===null||value.weekday!==null)))
    ctx.addIssue({code:"custom",message:"Cadence fields disagree"});
  try{new Intl.DateTimeFormat("en-US",{timeZone:value.timezone});}
  catch{ctx.addIssue({code:"custom",message:"Unknown IANA timezone"});}
});
export type ScheduleConfig=z.infer<typeof scheduleConfigSchema>;
export type ScheduleSlot={scheduledFor:string;localSlotKey:string};
function parts(instant:number,timezone:string){
  const format=new Intl.DateTimeFormat("en-CA",{timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit",
    hour:"2-digit",minute:"2-digit",hourCycle:"h23"});
  const mapped=Object.fromEntries(format.formatToParts(new Date(instant)).filter(item=>item.type!=="literal").map(item=>[item.type,Number(item.value)]));
  return {year:mapped.year,month:mapped.month,day:mapped.day,hour:mapped.hour,minute:mapped.minute};
}
function key(year:number,month:number,day:number,hour:number,minute:number){
  return `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}T${String(hour).padStart(2,"0")}:${String(minute).padStart(2,"0")}`;
}
function offsetAt(instant:number,timezone:string){const p=parts(instant,timezone);return Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute)-Math.floor(instant/60000)*60000;}
function instantsFor(year:number,month:number,day:number,hour:number,minute:number,timezone:string){
  const naive=Date.UTC(year,month-1,day,hour,minute),candidates=new Set<number>();
  for(const probe of [naive-86400000,naive,naive+86400000]){
    const candidate=naive-offsetAt(probe,timezone),actual=parts(candidate,timezone);
    if(actual.year===year&&actual.month===month&&actual.day===day&&actual.hour===hour&&actual.minute===minute)candidates.add(candidate);
  }
  return [...candidates].sort((a,b)=>a-b);
}
/** DST gaps are skipped. A repeated local time picks its first occurrence. */
export function nextScheduleSlot(raw:ScheduleConfig,afterExclusive:string|Date,skipSlotKey?:string):ScheduleSlot{
  const config=scheduleConfigSchema.parse(raw),after=new Date(afterExclusive).getTime();
  if(!Number.isFinite(after))throw new Error("Invalid schedule cursor");
  const local=parts(after,config.timezone),base=Date.UTC(local.year,local.month-1,local.day),
    [hour,minute]=config.localTime.split(":").map(Number);
  for(let offset=0;offset<370;offset++){
    const day=new Date(base+offset*86400000),year=day.getUTCFullYear(),month=day.getUTCMonth()+1,date=day.getUTCDate();
    if(config.cadence==="weekly"&&((day.getUTCDay()+6)%7+1)!==config.weekday)continue;
    if(config.cadence==="monthly"&&date!==config.dayOfMonth)continue;
    const localSlotKey=key(year,month,date,hour,minute);
    if(localSlotKey===skipSlotKey)continue;
    const candidates=instantsFor(year,month,date,hour,minute,config.timezone);
    // A fall-back fold is one local slot; prefer the first occurrence even when
    // the cursor lands between the two UTC instants.
    if(candidates.length&&candidates[0]>after)return {scheduledFor:new Date(candidates[0]).toISOString(),localSlotKey};
  }
  throw new Error("No schedule slot in the next 370 local days");
}
export function latestDueSlot(raw:ScheduleConfig,firstDue:string,now:string):{
  latest:ScheduleSlot|null;next:ScheduleSlot;missedCount:number
}{
  const config=scheduleConfigSchema.parse(raw),deadline=Date.parse(now);
  let slot={scheduledFor:new Date(firstDue).toISOString(),localSlotKey:(()=>{const p=parts(Date.parse(firstDue),config.timezone);return key(p.year,p.month,p.day,p.hour,p.minute);})()};
  let latest:ScheduleSlot|null=null,count=0;
  while(Date.parse(slot.scheduledFor)<=deadline){
    latest=slot;count++;
    if(count>3700)throw new Error("Schedule catch-up exceeds the supported window");
    slot=nextScheduleSlot(config,slot.scheduledFor,slot.localSlotKey);
  }
  return {latest,next:slot,missedCount:Math.max(0,count-1)};
}

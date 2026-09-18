import { z } from 'zod';
import { api, requireWorkspace, EvalError } from '@/lib/evals/domain/http';
import { uploadArtifact } from '@/lib/evals/repositories/evidence';
import { MAX_SOURCE_BYTES } from '@/lib/evals/storage/text';
export const runtime='nodejs';
export const PUT=api(async(request,identity)=>{
 const url=new URL(request.url),orgId=z.uuid().parse(url.searchParams.get('orgId')),id=z.uuid().parse(url.pathname.split('/').at(-2));
 await requireWorkspace(identity,orgId,'write');
 const reader=request.body?.getReader();if(!reader) throw new EvalError('INPUT_INVALID',400);
 const chunks:Uint8Array[]=[];let size=0;
 try {while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_SOURCE_BYTES){await reader.cancel();throw new EvalError('INPUT_INVALID',413,'Upload too large');}chunks.push(value);}}
 finally{reader.releaseLock();}
 return uploadArtifact({orgId,actorId:identity.user.id},id,Buffer.concat(chunks));
});

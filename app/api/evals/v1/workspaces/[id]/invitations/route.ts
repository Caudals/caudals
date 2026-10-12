import { z } from 'zod';
import { api,jsonBody,requireWorkspace } from '@/lib/evals/domain/http';
import { createInvitation } from '@/lib/evals/repositories/identity';
import { withTenant } from '@/lib/evals/repositories/db';
import { brandedEmailsEnabled } from '@/lib/email/links';
import { resolveInterfaceLocale } from '@/lib/evals/interface-locale';
import { sendInvitationEmail } from '@/lib/evals/invitation-email';
const org=(request:Request)=>z.uuid().parse(new URL(request.url).pathname.split('/').at(-2));
export const GET=api(async(request,identity)=>{
 const orgId=org(request);await requireWorkspace(identity,orgId,'manage');
 return withTenant({orgId,actorId:identity.user.id},async client=>(await client.query('SELECT id,email,role,expires_at,revoked_at,accepted_at FROM evals.invitation WHERE org_id=$1 ORDER BY created_at DESC,id LIMIT 100',[orgId])).rows);
});
export const POST=api(async(request,identity)=>{
 const {email,role}=z.object({email:z.email().max(254),role:z.enum(['owner','editor','viewer'])}).strict().parse(await jsonBody(request));
 const orgId=org(request);
 const invitation=await createInvitation(identity,orgId,email.toLowerCase(),role,request.headers.get('idempotency-key'));
 // Branded email (launch L-07): a new invitation is also emailed to the invitee,
 // in the inviter's language. The link stays in the response either way.
 if(!invitation.token||!brandedEmailsEnabled()) return invitation;
 const cookie=request.headers.get('cookie')?.match(/(?:^|;\s*)caudals_locale=(en|es)(?:;|$)/)?.[1];
 const emailed=await sendInvitationEmail({orgId,actorId:identity.user.id,invitationId:invitation.id,email:invitation.email,role,token:invitation.token,
   inviter:identity.user.name,locale:resolveInterfaceLocale(cookie,request.headers.get('accept-language')),expiresAt:invitation.expires_at})
   .then(()=>true,()=>{console.error('invitation_email_failed',{invitation_id:invitation.id});return false;});
 return {...invitation,emailed};
});

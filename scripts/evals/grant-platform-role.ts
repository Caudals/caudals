import { Pool } from 'pg';
import { getSecretEnvValue } from '../../lib/env/secrets';
async function main(){
 const [userId,role,apply]=process.argv.slice(2);
 if(!/^au_[0-9A-HJKMNP-TV-Z]{26}$/.test(userId??'')||!['platform_admin','operator'].includes(role??''))throw new Error('Usage: evals:grant-role <existing-auth-user-id> <platform_admin|operator> [--apply]');
 const connectionString=getSecretEnvValue('EVALS_MIGRATION_DATABASE_URL');if(!connectionString)throw new Error('Migration owner connection required.');
 const pool=new Pool({connectionString,max:1});
 try{
  const found=await pool.query('SELECT id FROM public.auth_user WHERE id=$1 AND "emailVerified"=true',[userId]);if(!found.rowCount)throw new Error('Verified identity not found.');
  if(apply!=='--apply'){console.log('Verified identity eligible. No grant written; use --apply.');return;}
  const c=await pool.connect();try{await c.query('BEGIN');await c.query('INSERT INTO evals.platform_role(user_id,role) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET role=EXCLUDED.role',[userId,role]);await c.query("INSERT INTO evals.audit_event(actor_id,action,subject_id) VALUES($1,'platform_role.granted',$2)",[userId,role]);await c.query('COMMIT');}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
  console.log('Explicit platform grant recorded.');
 }finally{await pool.end();}
}
main().catch(()=>{console.error('Platform grant failed. Check the explicit verified identity and owner access.');process.exitCode=1;});

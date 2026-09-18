import { Pool } from 'pg';
import { hashPassword } from 'better-auth/crypto';
import { createBetterAuthId } from '../../lib/auth/better-auth-ids';
async function main(){
 const value=process.env.EVALS_TEST_DATABASE_URL;if(!value)throw new Error('Disposable test URL required');
 const url=new URL(value);if(!['localhost','127.0.0.1'].includes(url.hostname)||!url.pathname.endsWith('_test'))throw new Error('Refusing non-test database');
 const pool=new Pool({connectionString:value,max:1});
 try{
  for(const role of ['operator','viewer']){
   const email=`${role}-evals@example.test`,id=createBetterAuthId({model:'user'});
   const exists=await pool.query('SELECT id FROM auth_user WHERE email=$1',[email]);if(exists.rowCount)continue;
   const password=await hashPassword('Foundation-test-only-123!');
   const c=await pool.connect();try{await c.query('BEGIN');await c.query('INSERT INTO auth_user(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$2,$3,true,now(),now())',[id,`Fixture ${role}`,email]);await c.query('INSERT INTO auth_account(id,"accountId","providerId","userId",password,"createdAt","updatedAt") VALUES($1,$2,\'credential\',$2,$3,now(),now())',[createBetterAuthId({model:'account'}),id,password]);if(role==='operator')await c.query("INSERT INTO evals.platform_role(user_id,role) VALUES($1,'operator')",[id]);await c.query('COMMIT');}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
  }
  console.log('Synthetic operator/viewer ready; no production identities copied.');
 }finally{await pool.end();}
}
main().catch(()=>{console.error('Fixture seed failed');process.exitCode=1;});

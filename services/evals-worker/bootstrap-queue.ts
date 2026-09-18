import { createBoss,startBoss } from '../../lib/evals/queue/boss';
/** Explicit offline queue setup. Grant CREATE on the dedicated queue DB only for
 * bootstrap, then revoke it before starting runtime. Never use the domain login. */
async function main() {
 const boss=createBoss(process.env,{bootstrap:true});
 boss.on('error',()=>console.error(JSON.stringify({event:'queue_bootstrap_error'})));
 try{await startBoss(boss);console.info(JSON.stringify({event:'queue_bootstrap_complete'}));}finally{await boss.stop({graceful:true});}
}
main().catch(()=>{console.error(JSON.stringify({event:'queue_bootstrap_failed'}));process.exitCode=1;});

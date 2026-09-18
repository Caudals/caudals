import { test,expect,type APIRequestContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';
const origin=process.env.EVALS_E2E_URL??'http://127.0.0.1:4188';
async function login(api:APIRequestContext,email:string){
 const response=await api.post('/api/auth/sign-in/email',{headers:{origin},data:{email,password:'Foundation-test-only-123!'}});expect(response.status()).toBe(200);
}
async function create(api:APIRequestContext,path:string,data:unknown){
 const response=await api.post(`/api/evals/v1${path}`,{headers:{origin,'Idempotency-Key':randomUUID()},data});expect(response.status()).toBe(200);return (await response.json()).data;
}
test('real auth, isolated clients, direct API denial, enrollment, expired session and responsive shell',async({browser,playwright})=>{
 const op=await browser.newContext({baseURL:origin});const view=await browser.newContext({baseURL:origin});
 try{
  await login(op.request,'operator-evals@example.test');
  const a=await create(op.request,'/workspaces',{name:`Runtime client A ${randomUUID().slice(0,8)}`});
  const b=await create(op.request,'/workspaces',{name:`Runtime client B ${randomUUID().slice(0,8)}`});
  const invite=await create(op.request,`/workspaces/${a.id}/invitations`,{email:'viewer-evals@example.test',role:'viewer'});
  await login(view.request,'viewer-evals@example.test');
  await create(view.request,'/invitations/accept',{token:invite.token});
  const identity=await view.request.get('/api/evals/v1/identity');expect(identity.status()).toBe(200);
  const data=(await identity.json()).data;expect(data.workspaces.some((w:{id:string})=>w.id===a.id)).toBe(true);expect(data.workspaces.some((w:{id:string})=>w.id===b.id)).toBe(false);
  const denied=await view.request.post('/api/evals/v1/workspaces',{headers:{origin,'Idempotency-Key':randomUUID()},data:{name:'Forbidden'}});expect(denied.status()).toBe(403);
  const guessed=await view.request.get(`/api/evals/v1/projects?orgId=${b.id}`);expect(guessed.status()).toBe(404);
  const noOrigin=await op.request.post('/api/evals/v1/workspaces',{headers:{'Idempotency-Key':randomUUID()},data:{name:'CSRF'}});expect(noOrigin.status()).toBe(403);
  const page=await view.newPage();await page.goto(`/workspace/evaluations?orgId=${a.id}`);await expect(page.locator('html')).toHaveAttribute('lang','en');await expect(page.getByRole('heading',{name:'Evaluations',exact:true})).toBeVisible();
  for(const width of [390,768,1440]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`docs/evals/design/runtime-workspace-${width}.png`,fullPage:true});}
  const ops=await op.newPage();await ops.goto('/ops');await expect(ops.getByText(a.name,{exact:true}).first()).toBeVisible();await expect(ops.getByText(b.name,{exact:true}).first()).toBeVisible();await ops.screenshot({path:'docs/evals/design/runtime-operator.png',fullPage:true});
  const enrollmentEmail=`enrolled-${randomUUID()}@example.test`;
  const enrollment=await create(op.request,`/workspaces/${b.id}/invitations`,{email:enrollmentEmail,role:'viewer'});
  const guest=await playwright.request.newContext({baseURL:origin});
  const enrolled=await guest.post('/api/evals/v1/invitations/enroll',{headers:{origin},data:{token:enrollment.token,name:'New invited member',password:'Foundation-test-only-123!'}});expect(enrolled.status()).toBe(200);
  await login(guest,enrollmentEmail);const enrolledData=(await (await guest.get('/api/evals/v1/identity')).json()).data;expect(enrolledData.workspaces.map((w:{id:string})=>w.id)).toEqual([b.id]);await guest.dispose();
  await view.clearCookies();await page.goto('/workspace/evaluations');await expect(page).toHaveURL(/sign-in/);
 }finally{await op.close();await view.close();}
});

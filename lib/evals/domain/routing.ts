/** Host is read from Host only; forwarded host is never an authority. */
export function hostname(value: string | null) {
  if (!value || /[\\\s/@?#]/.test(value)) return "";
  try { return new URL(`http://${value}`).hostname.toLowerCase(); } catch { return ""; }
}
export function isEvaluationHost(value: string | null) {
  const host=hostname(value);
  const configured=(process.env.NEXT_PUBLIC_APP_HOSTNAMES ?? 'app.caudals.com,app.localhost').split(',').map(x=>hostname(x.trim()));
  return !!host && (configured.includes(host) || (process.env.NODE_ENV!=='production' && ['localhost','127.0.0.1'].includes(host)));
}
export function isKnownHost(value: string | null) {
  const host=hostname(value);
  return isEvaluationHost(value) || (process.env.NEXT_PUBLIC_MARKETING_HOSTNAMES ?? 'caudals.com,www.caudals.com').split(',').map(x=>hostname(x.trim())).includes(host);
}
export function isEvaluationPath(path: string) {
  return ['/ops','/workspace','/review','/share','/api/evals','/evaluation-entry'].some(x=>path===x||path.startsWith(`${x}/`));
}
export function safeRedirectPath(value: string | null, fallback='/evaluation-entry') {
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\r\n\x00]/.test(value)) return fallback;
  const parsed=new URL(value,'https://app.caudals.com');
  if (parsed.origin!=='https://app.caudals.com' || !(['/admin','/auth','/ops','/workspace','/evaluation-entry'].some(x=>parsed.pathname===x||parsed.pathname.startsWith(`${x}/`)))) return fallback;
  return parsed.pathname+parsed.search;
}

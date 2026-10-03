/** The entry site can hand off to its app, never to an unrelated SSO provider. */
export function websiteAppNavigation(entry: string, destination: string) {
  const from = new URL(entry), to = new URL(destination);
  if (to.protocol !== "https:" || to.username || to.password) return false;
  if (from.origin === to.origin) return true;
  // Deliberately bounded aliases, rather than treating all subdomains (or
  // tenants of a shared hosting domain) as interchangeable systems.
  const host = (value: string) => value.replace(/^(www|app)\./, "");
  return from.port === to.port && host(from.hostname) === host(to.hostname)
    && (/^(www|app)\./.test(from.hostname) || /^(www|app)\./.test(to.hostname));
}

export function cleanWebsiteNavigation(raw: string) {
  const url = new URL(raw);
  url.search = "";
  if (!/^#!?\/[A-Za-z0-9/_~.-]{0,200}$/.test(url.hash)) url.hash = "";
  return url.toString();
}

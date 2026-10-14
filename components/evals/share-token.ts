/**
 * The share token arrives in the URL fragment and is removed from the address
 * bar as soon as it is read. It is kept for this tab only (sessionStorage), so
 * changing the language, which reloads the page, keeps the report open. The
 * shared report (`/share`) and the vendor's fix list (`/share/fixes`, launch
 * P-54) read it the same way.
 */
const SHARE_TOKEN_KEY = "caudals:share-token";
let shareToken: string | null = null;

export function readShareToken() {
  const fresh = new URLSearchParams(location.hash.slice(1)).get("token");
  if (fresh && fresh !== shareToken) {
    shareToken = fresh;
    try {
      sessionStorage.setItem(SHARE_TOKEN_KEY, fresh);
    } catch {
      // Storage blocked: the link still works until the page reloads.
    }
  }
  if (!shareToken) {
    try {
      shareToken = sessionStorage.getItem(SHARE_TOKEN_KEY);
    } catch {
      shareToken = null;
    }
  }
  return shareToken;
}

/** A link opened on the other share page (a fix list on `/share`, a report on `/share/fixes`) moves there with its token. */
export function openSharePage(path: "/share" | "/share/fixes", token: string) {
  location.replace(`${path}#token=${encodeURIComponent(token)}`);
}

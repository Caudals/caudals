import type { MessagePath } from "./translate";

/**
 * Messages every public page sends its client components (launch L-24b): the
 * header and language switcher (`nav`), the footer (`footer`, sector names),
 * the cookie notice and the 404 view, which the public layout keeps ready on
 * every page. A page adds what its own client components read with
 * `ClientMessages`; a client component that reads another namespace must be
 * given it there, or it renders the key.
 */
export const PUBLIC_SHELL_MESSAGES = [
  "nav",
  "footer",
  "sectors.names",
  "cookies",
  "notFound",
  "hero.demoCta",
  "hero.demoCtaDetail",
] as const satisfies readonly MessagePath[];

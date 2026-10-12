import { registrable } from "@/lib/demo/web";

/**
 * Which addresses may open a free workspace through direct sign-up
 * (launch L-05, spec v2 §6.15). Personal free-mail and disposable domains
 * are refused; everything else counts as a work email.
 *
 * Ops adjust the lists at runtime without a release (the values live in the
 * app credentials, `scripts/set-app-credentials.sh`):
 * - `SELF_SERVE_SIGNUP_EXCEPTIONS`: comma-separated addresses or domains that
 *   may sign up even on a listed domain. An exception also lifts the
 *   one-workspace-per-domain rule for that address or domain.
 * - `SELF_SERVE_SIGNUP_BLOCKED_DOMAINS`: extra disposable domains to refuse.
 * Entries that are neither an address nor a domain (for example `none`) are
 * ignored, so `none` clears a list.
 */

/** Personal mailbox providers: people there should use their company address. */
export const FREE_MAIL_DOMAINS: ReadonlySet<string> = new Set([
  // Google, Microsoft, Apple, Yahoo, AOL
  "gmail.com", "googlemail.com",
  "outlook.com", "outlook.es", "outlook.fr", "outlook.de", "outlook.it", "outlook.com.ar", "outlook.com.br",
  "hotmail.com", "hotmail.es", "hotmail.fr", "hotmail.de", "hotmail.it", "hotmail.co.uk", "hotmail.com.ar", "hotmail.com.mx", "hotmail.com.br",
  "live.com", "live.es", "live.fr", "live.de", "live.it", "live.co.uk", "live.com.mx", "live.com.ar",
  "msn.com", "msn.es", "passport.com",
  "icloud.com", "me.com", "mac.com",
  "yahoo.com", "yahoo.es", "yahoo.fr", "yahoo.de", "yahoo.it", "yahoo.co.uk", "yahoo.com.ar", "yahoo.com.mx", "yahoo.com.br", "ymail.com", "rocketmail.com",
  "aol.com", "aim.com",
  // Privacy-focused and independent providers
  "proton.me", "protonmail.com", "protonmail.ch", "pm.me",
  "tutanota.com", "tutanota.de", "tuta.io", "tutamail.com", "tuta.com",
  "fastmail.com", "fastmail.fm", "hey.com", "mailbox.org", "posteo.de", "posteo.net", "zoho.com", "zohomail.com", "zohomail.eu",
  // GMX, Web.de, mail.com
  "gmx.com", "gmx.es", "gmx.de", "gmx.net", "gmx.at", "gmx.ch", "gmx.fr", "web.de", "mail.com", "email.com", "usa.com",
  // Spain and Latin America
  "telefonica.net", "movistar.es", "terra.es", "terra.com", "terra.com.br", "orange.es", "wanadoo.es", "ono.com", "jazztel.es", "euskaltel.net", "yahoo.com.co",
  "uol.com.br", "bol.com.br", "ig.com.br", "prodigy.net.mx", "speedy.com.ar", "fibertel.com.ar", "arnet.com.ar",
  // Rest of Europe
  "orange.fr", "wanadoo.fr", "free.fr", "laposte.net", "sfr.fr", "neuf.fr", "bbox.fr",
  "libero.it", "virgilio.it", "tiscali.it", "alice.it", "tin.it",
  "t-online.de", "freenet.de", "arcor.de",
  "btinternet.com", "sky.com", "virginmedia.com", "talktalk.net", "ntlworld.com",
  "bluewin.ch", "seznam.cz", "wp.pl", "o2.pl", "interia.pl", "onet.pl", "abv.bg", "ukr.net",
  "yandex.com", "yandex.ru", "ya.ru", "mail.ru", "bk.ru", "list.ru", "inbox.ru", "rambler.ru",
  "sapo.pt", "clix.pt",
  // North America and Asia
  "comcast.net", "verizon.net", "att.net", "sbcglobal.net", "bellsouth.net", "cox.net", "charter.net", "earthlink.net", "shaw.ca", "rogers.com", "sympatico.ca",
  "qq.com", "163.com", "126.com", "sina.com", "sohu.com", "yeah.net", "naver.com", "hanmail.net", "daum.net", "rediffmail.com",
  "inbox.com", "gmx.us",
]);

/** Throwaway inboxes. Extend at runtime with SELF_SERVE_SIGNUP_BLOCKED_DOMAINS. */
export const DISPOSABLE_DOMAINS: ReadonlySet<string> = new Set([
  "mailinator.com", "mailinator.net", "mailinator2.com",
  "guerrillamail.com", "guerrillamail.net", "guerrillamail.org", "guerrillamail.biz", "guerrillamailblock.com", "sharklasers.com", "grr.la", "pokemail.net", "spam4.me",
  "10minutemail.com", "10minutemail.net", "10minutemail.co.uk", "10mail.org", "minuteinbox.com",
  "temp-mail.org", "temp-mail.io", "tempmail.com", "tempmail.net", "tempmailo.com", "tempmail.dev", "tempail.com", "tempr.email", "tempinbox.com", "tmpmail.org", "tmpmail.net", "tmail.ws",
  "throwawaymail.com", "yopmail.com", "yopmail.fr", "yopmail.net", "cool.fr.nf", "jetable.fr.nf", "courriel.fr.nf",
  "trashmail.com", "trashmail.de", "trashmail.net", "trashmail.me", "wegwerfmail.de", "einrot.com",
  "getnada.com", "nada.email", "dispostable.com", "maildrop.cc", "mailnesia.com", "mintemail.com", "mohmal.com", "mytemp.email",
  "fakeinbox.com", "emailondeck.com", "spamgourmet.com", "mailcatch.com", "inboxkitten.com", "burnermail.io", "moakt.com",
  "discard.email", "discardmail.com", "spambox.us", "getairmail.com", "mailpoof.com", "harakirimail.com",
  "mail.tm", "emailfake.com", "fakemail.net", "crazymailing.com", "mail7.io", "mailsac.com", "linshiyouxiang.net",
  "1secmail.com", "1secmail.net", "1secmail.org", "emlpro.com", "emltmp.com", "dropmail.me", "spamdecoy.net", "mvrht.net",
  "33mail.com", "mailforspam.com", "trbvm.com", "byom.de", "tempm.com", "fakemailgenerator.com", "armyspy.com", "cuvox.de", "dayrep.com", "einrot.de",
  "fleckens.hu", "gustr.com", "jourrapide.com", "rhyta.com", "superrito.com", "teleworm.us",
]);

/**
 * Shared mail hosts where each company is its own subdomain (Microsoft 365's
 * default tenant domains). The tenant label is part of the company domain, so
 * unrelated tenants never share the one-workspace-per-domain slot.
 */
const TENANT_SUFFIXES = ["mail.onmicrosoft.com", "onmicrosoft.com"];

/** The company domain of a mail host: its registrable domain, or the tenant on a shared host. */
export function companyDomain(host: string) {
  for (const suffix of TENANT_SUFFIXES) {
    if (host.endsWith(`.${suffix}`)) return `${host.slice(0, -suffix.length - 1).split(".").at(-1)}.${suffix}`;
  }
  return registrable(host);
}

/** Domains that can never receive mail (RFC 2606/6761). */
const RESERVED_TLDS = new Set(["test", "example", "invalid", "localhost", "local", "internal", "lan", "home", "corp"]);
const RESERVED_DOMAINS = new Set(["example.com", "example.net", "example.org"]);

const EMAIL = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+)$/;

export type SignupEmailKind = "work" | "free_mail" | "disposable" | "invalid";
export type SignupEmailCheck = {
  /** Lower-cased, trimmed address. */
  email: string;
  /** The address's host. */
  host: string;
  /** Its registrable domain: the unit of the one-workspace-per-domain rule. */
  domain: string;
  kind: SignupEmailKind;
  /** On the ops exception list: allowed on any domain and exempt from the domain rule. */
  exception: boolean;
};

function list(value: string | undefined) {
  return (value ?? "").split(",").map((entry) => entry.trim().toLowerCase()).filter(Boolean);
}

/** Classifies an address for direct sign-up. Pure: reads only the given environment. */
export function checkSignupEmail(raw: string, env: Record<string, string | undefined> = process.env): SignupEmailCheck {
  const email = raw.trim().toLowerCase();
  const match = email.length <= 254 ? EMAIL.exec(email) : null;
  const host = match?.[1] ?? "";
  const tld = host.split(".").at(-1) ?? "";
  if (!match || !/^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/.test(tld) || RESERVED_TLDS.has(tld)) {
    return { email, host, domain: host, kind: "invalid", exception: false };
  }
  const domain = companyDomain(host);
  if (RESERVED_DOMAINS.has(domain)) return { email, host, domain, kind: "invalid", exception: false };
  const listed = (set: ReadonlySet<string> | string[]) =>
    Array.isArray(set) ? set.includes(host) || set.includes(domain) : set.has(host) || set.has(domain);
  const exceptions = list(env.SELF_SERVE_SIGNUP_EXCEPTIONS);
  const exception = exceptions.includes(email) || listed(exceptions.filter((entry) => !entry.includes("@")));
  if (exception) return { email, host, domain, kind: "work", exception: true };
  if (listed(DISPOSABLE_DOMAINS) || listed(list(env.SELF_SERVE_SIGNUP_BLOCKED_DOMAINS))) {
    return { email, host, domain, kind: "disposable", exception: false };
  }
  if (listed(FREE_MAIL_DOMAINS)) return { email, host, domain, kind: "free_mail", exception: false };
  return { email, host, domain, kind: "work", exception: false };
}

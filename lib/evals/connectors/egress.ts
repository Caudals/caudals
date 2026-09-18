import { lookup as dnsLookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

const blocked4 = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
  ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24],
  ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) blocked4.addSubnet(address, prefix, "ipv4");
const public6 = new BlockList(); public6.addSubnet("2000::", 3, "ipv6");
const blocked6 = new BlockList();
for (const [address, prefix] of [["2001::",23],["2001:db8::",32],["2002::",16],["3fff::",20]] as const) blocked6.addSubnet(address,prefix,"ipv6");

export type Lookup = typeof dnsLookup;
export type PinnedDestination = { url: URL; address: string; family: 4 | 6; hostname: string };

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !blocked4.check(address, "ipv4");
  if (family !== 6 || address.toLowerCase().startsWith("::ffff:")) return false;
  return public6.check(address, "ipv6") && !blocked6.check(address, "ipv6");
}

/** Validate all answers and return one address that the socket must be pinned to. */
export async function validatePublicDestination(raw: string, lookup: Lookup = dnsLookup): Promise<PinnedDestination> {
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error("destination_invalid"); }
  if (url.protocol !== "https:" || url.username || url.password || url.hash || url.search) throw new Error("destination_invalid");
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const answers = await lookup(hostname, { all: true, verbatim: true });
  if (!answers.length || answers.some((answer) => !isPublicAddress(answer.address))) throw new Error("destination_denied");
  const selected = answers[0];
  return { url, hostname, address: selected.address, family: selected.family as 4 | 6 };
}

/** Every redirect is a new destination and must be revalidated; callers cap hops. */
export async function validateRedirect(from: URL, location: string, lookup: Lookup = dnsLookup): Promise<PinnedDestination> {
  const next = new URL(location, from);
  if (next.origin !== from.origin) return validatePublicDestination(next.href, lookup);
  return validatePublicDestination(next.href, lookup);
}

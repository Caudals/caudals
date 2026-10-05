import { createHash, createHmac, hkdfSync } from "node:crypto";
import { BlockList, isIP } from "node:net";
import { getSecretEnvValue } from "@/lib/env/secrets";

// Cloudflare's published edge ranges (https://www.cloudflare.com/ips). Traefik
// trusts no forwarded headers, so X-Forwarded-For carries only the immediate
// peer. When that peer is Cloudflare, cf-connecting-ip names the visitor;
// otherwise the request reached the origin directly and the peer is the visitor.
const cloudflare = new BlockList();
for (const range of [
  "173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22", "141.101.64.0/18",
  "108.162.192.0/18", "190.93.240.0/20", "188.114.96.0/20", "197.234.240.0/22", "198.41.128.0/17",
  "162.158.0.0/15", "104.16.0.0/13", "104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22",
]) {
  const [address, prefix] = range.split("/");
  cloudflare.addSubnet(address, Number(prefix), "ipv4");
}
for (const range of ["2400:cb00::/32", "2606:4700::/32", "2803:f800::/32", "2405:b500::/32", "2405:8100::/32", "2a06:98c0::/29", "2c0f:f248::/32"]) {
  const [address, prefix] = range.split("/");
  cloudflare.addSubnet(address, Number(prefix), "ipv6");
}

function isCloudflare(address: string) {
  const family = isIP(address);
  return family === 4 ? cloudflare.check(address, "ipv4") : family === 6 ? cloudflare.check(address, "ipv6") : false;
}

/** The visitor's IP address as far as the server can prove it. */
export function clientAddress(headers: Headers): string {
  const peer = (headers.get("x-forwarded-for") ?? "").split(",").map((part) => part.trim()).filter(Boolean).at(-1)
    ?? headers.get("x-real-ip")?.trim() ?? "";
  const visitor = headers.get("cf-connecting-ip")?.trim() ?? "";
  if (peer && isCloudflare(peer) && isIP(visitor)) return visitor;
  return isIP(peer) ? peer : "unknown";
}

/** IPv6 visitors rotate within their /64; count them as one. */
export function addressBucket(address: string) {
  if (isIP(address) !== 6) return address;
  const [head, tail] = address.toLowerCase().split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const groups = tail === undefined ? left : [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill("0"), ...right];
  return `${groups.slice(0, 4).map((group) => group.replace(/^0+(?=.)/, "")).join(":")}::/64`;
}

let derived: Buffer | null = null;
/** A server-only key for demo HMACs: DEMO_SECRET, else derived from the auth secret. */
export function demoKey(): Buffer {
  if (derived) return derived;
  const own = getSecretEnvValue("DEMO_SECRET");
  const base = own ?? getSecretEnvValue("BETTER_AUTH_SECRET") ?? (process.env.NODE_ENV === "production" ? undefined : "caudals-local-demo-secret");
  if (!base) throw new Error("demo_secret_missing");
  derived = Buffer.from(hkdfSync("sha256", base, "caudals-demo", "caudals-demo-v1", 32));
  return derived;
}

export function hmac(value: string) {
  return createHmac("sha256", demoKey()).update(value).digest("hex");
}

export function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

/** A pseudonymous visitor key: no raw IP is stored anywhere. */
export function clientHash(headers: Headers) {
  return hmac(`client:${addressBucket(clientAddress(headers))}`);
}

import { lookup } from "node:dns/promises";
import net, { type Socket } from "node:net";
import { isPublicAddress } from "../../lib/evals/connectors/egress";

const port = Number(process.env.EVALS_BROWSER_EGRESS_PORT ?? 3128);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("egress_port_invalid");
const maximumConnections = 64;
const maximumTunnelBytes = 32 * 1024 * 1024;
let activeConnections = 0;

function deny(socket: Socket, status = 403) {
  if (!socket.destroyed) socket.end(`HTTP/1.1 ${status} Forbidden\r\nConnection: close\r\n\r\n`);
}

async function publicConnectAddress(authority: string) {
  if (!authority || authority.includes("/") || authority.includes("?") || authority.includes("#") || authority.includes("@"))
    throw new Error("egress_authority_invalid");
  const url = new URL(`https://${authority}/`);
  if (url.protocol !== "https:" || url.port || url.username || url.password ||
      !authority.endsWith(":443")) throw new Error("egress_authority_invalid");
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const answers = await Promise.race([
    lookup(hostname, { all: true, verbatim: true }),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("egress_dns_timeout")), 5_000)),
  ]);
  if (!answers.length || answers.some((answer) => !isPublicAddress(answer.address)))
    throw new Error("egress_destination_denied");
  return answers.find((answer) => answer.family === 4) ?? answers[0];
}

const server = net.createServer((client) => {
  if (activeConnections >= maximumConnections) { deny(client, 503); return; }
  activeConnections += 1;
  let upstream: Socket | undefined;
  let finished = false;
  let handshake = Buffer.alloc(0);
  const close = () => {
    if (finished) return;
    finished = true;
    activeConnections -= 1;
    upstream?.destroy();
    client.destroy();
  };
  client.setTimeout(5_000, close);
  client.once("error", close);
  client.once("close", close);
  const receive = async (chunk: Buffer) => {
    handshake = Buffer.concat([handshake, chunk]);
    if (handshake.length > 4096) { deny(client, 431); return; }
    const boundary = handshake.indexOf("\r\n\r\n");
    if (boundary < 0) return;
    client.pause();
    client.off("data", receive);
    const first = handshake.subarray(0, boundary).toString("latin1").split("\r\n")[0];
    const match = /^(CONNECT|CHECK) ([^\s]+) HTTP\/1\.[01]$/.exec(first);
    if (!match) { deny(client); return; }
    let address;
    try { address = await publicConnectAddress(match[2]); }
    catch { deny(client); return; }
    if (match[1] === "CHECK") {
      client.end("HTTP/1.1 204 No Content\r\nConnection: close\r\n\r\n");
      return;
    }
    const target = net.connect({ host: address.address, port: 443, family: address.family });
    upstream = target;
    target.setTimeout(30_000, close);
    target.once("error", close);
    target.once("close", close);
    target.once("connect", () => {
      client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      const remaining = handshake.subarray(boundary + 4);
      if (remaining.length) target.write(remaining);
      let uploaded = remaining.length;
      let downloaded = 0;
      client.on("data", (bytes) => {
        uploaded += bytes.length;
        if (uploaded > maximumTunnelBytes) close();
      });
      target.on("data", (bytes) => {
        downloaded += bytes.length;
        if (downloaded > maximumTunnelBytes) close();
      });
      client.setTimeout(30_000, close);
      setTimeout(close, 180_000).unref();
      client.pipe(target);
      target.pipe(client);
      client.resume();
    });
  };
  client.on("data", receive);
});

server.listen(port, "0.0.0.0", () => console.info(JSON.stringify({ event: "evals_browser_egress_ready", port })));
process.on("SIGTERM", () => server.close());

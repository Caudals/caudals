import net from "node:net";

/** The isolated browser cannot use public DNS. Its gateway validates all DNS
 * answers here and validates them again before each pinned TCP connection. */
export function checkBrowserDestination(raw: string, host: string, port: number): Promise<void> {
  let url: URL;
  try { url = new URL(raw); } catch { return Promise.reject(new Error("destination_invalid")); }
  if (url.protocol !== "https:" || url.username || url.password || url.port ||
      !host || !Number.isInteger(port) || port < 1 || port > 65535)
    return Promise.reject(new Error("destination_invalid"));
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, host);
    let received = "";
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (error) reject(error);
      else resolve();
    };
    socket.setTimeout(7_000, () => finish(new Error("destination_unavailable")));
    socket.once("error", () => finish(new Error("destination_unavailable")));
    socket.once("connect", () => socket.write(
      `CHECK ${url.hostname}:443 HTTP/1.1\r\nHost: ${url.hostname}:443\r\n\r\n`,
    ));
    socket.on("data", (chunk) => {
      received += chunk.toString("latin1");
      if (received.length > 256) { finish(new Error("destination_denied")); return; }
      if (!received.includes("\r\n\r\n")) return;
      finish(received.startsWith("HTTP/1.1 204 ")
        ? undefined : new Error("destination_denied"));
    });
    socket.once("close", () => finish(new Error("destination_unavailable")));
  });
}

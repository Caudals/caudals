import net from "node:net";

// The browser network has no route to dokploy-network. This relay exposes only
// the PostgreSQL TCP port; it cannot select another destination or protocol.
const listenPort = 5432;
const maximumConnections = 24;
let activeConnections = 0;
const server = net.createServer((client) => {
  if (activeConnections >= maximumConnections) { client.destroy(); return; }
  activeConnections += 1;
  const upstream = net.connect({ host: "caudals-postgres", port: 5432 });
  let finished = false;
  const close = () => {
    if (finished) return;
    finished = true;
    activeConnections -= 1;
    client.destroy();
    upstream.destroy();
  };
  client.setTimeout(15 * 60_000, close);
  upstream.setTimeout(15 * 60_000, close);
  client.once("error", close);
  client.once("close", close);
  upstream.once("error", close);
  upstream.once("close", close);
  client.pipe(upstream);
  upstream.pipe(client);
});
server.listen(listenPort, "0.0.0.0", () =>
  console.info(JSON.stringify({ event: "evals_browser_db_relay_ready", port: listenPort })));
process.on("SIGTERM", () => server.close());

# Caudals private evaluation runner

This Node.js 20+ CLI runs approved candidate inputs inside a customer's network. The local adapter receives JSON on standard input and writes either plain answer text or `{ "messages": [{ "role": "assistant", "content": "..." }], "tool_events": [] }` to standard output. Keep system credentials in the local adapter environment. The CLI sends only signed execution results to Caudals over outbound HTTPS; it does not open an inbound port.

Install from a reviewed release of this package. For a checked-out repository, run `npm install --global ./packages/evals-runner`. Operators distributing a tarball should build it with `npm pack ./packages/evals-runner`, record its SHA-256 and deliver it through the customer's approved channel.

1. Create a pairing code in **Workspace → Systems** for the private system.
2. On the customer machine, run `caudals-evals pair --base https://YOUR-EVALUATION-HOST --org WORKSPACE_UUID --code CODE` and `caudals-evals doctor`.
3. Put a local adapter configuration in a file readable only by the runner user, for example:

   ```json
   {"command":"/opt/customer/eval-adapter","args":[],"timeoutMs":60000}
   ```

4. When an approved run is waiting, use `caudals-evals fetch --output ./job.json`, then `caudals-evals run --bundle ./job.json --adapter ./adapter.json --results ./results.json`, then `caudals-evals upload --results ./results.json`.
5. Repeat `upload` after an interruption; accepted case units are idempotent. Repeat `fetch` to poll for another job. `logout` removes the local pairing credentials; a workspace manager can revoke the runner in the Caudals UI/API.

The CLI verifies the platform signature, workspace, project, target and expiry before execution. Its results are labeled as customer-runner-reported evidence. A valid signature binds bytes to the paired key; it does not establish that a particular model produced them. Bundle files contain candidate inputs and never answer keys, rubrics or references. Handle bundle and result files as customer-confidential data; the CLI writes them with owner-only permissions.

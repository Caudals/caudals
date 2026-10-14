/**
 * Only the EN/ES literal rule (launch L-23), without the rest of the lint
 * rules: `npm run i18n:check-parity` runs it in seconds, so the image build
 * can gate on it while the general CI workflow is off. `npm run lint` applies the same rule
 * through eslint.config.mjs. The Next.js configs stay loaded (parser and
 * plugins, rules off) so `eslint-disable` comments that name their rules
 * still resolve.
 */
import nextConfig from "eslint-config-next";
import { uiLiteralsConfig } from "./no-ui-literals.mjs";

const config = [
  ...nextConfig.map(({ rules: _rules, ...rest }) => rest),
  { linterOptions: { reportUnusedDisableDirectives: "off" } },
  uiLiteralsConfig,
];

export default config;

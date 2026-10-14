import nextConfig from "eslint-config-next";
import { uiLiteralsConfig } from "./scripts/lint/no-ui-literals.mjs";

const config = [
  ...nextConfig,
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "c-design/**",
      "out/**",
      "build/**",
      "public/**",
      "next-env.d.ts",
    ],
  },
  // EN/ES parity (launch L-23, spec P-45): text in the evaluation app and the
  // public demo comes from the message catalogues. The allowlist of brand
  // names, units and identifiers lives in the rule file.
  uiLiteralsConfig,
];

export default config;

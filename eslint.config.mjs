import nextConfig from "eslint-config-next";

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
];

export default config;

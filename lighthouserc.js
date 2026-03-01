const port = Number(process.env.LHCI_PORT ?? 4173);
const baseURL = process.env.LHCI_BASE_URL ?? `http://127.0.0.1:${port}`;

/** @type {import('@lhci/cli/src/types').LighthouseCiConfig} */
module.exports = {
  ci: {
    collect: {
      ...(process.env.LHCI_BASE_URL
        ? {}
        : {
            startServerCommand: `npm run dev -- --port ${port}`,
            startServerReadyPattern: `Local:\\s+http://localhost:${port}`,
          }),
      url: [
        `${baseURL}/`,
        `${baseURL}/auth/sign-in`,
        `${baseURL}/browse`,
        `${baseURL}/requester`,
      ],
      numberOfRuns: 1,
      settings: {
        preset: "desktop",
        throttlingMethod: "simulate",
        onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
      },
    },
    assert: {
      assertions: {
        "categories:performance": ["error", { minScore: 0.3 }],
        "categories:accessibility": ["error", { minScore: 0.7 }],
        "first-contentful-paint": ["error", { maxNumericValue: 10000 }],
        "largest-contentful-paint": ["error", { maxNumericValue: 15000 }],
        "total-blocking-time": ["error", { maxNumericValue: 2000 }],
        "cumulative-layout-shift": ["error", { maxNumericValue: 1 }],
      },
    },
    upload: {
      target: "temporary-public-storage",
    },
  },
};

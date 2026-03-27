import { expect, test } from "@playwright/test";

const publicRoutes = [
  { path: "/blog", heading: /clear signal for dataset operations/i },
  {
    path: "/blog/launching-caudals-clearer-dataset-operations",
    heading: /launching caudals: a clearer control plane for dataset operations/i,
  },
  { path: "/pricing", heading: /plans built for production dataset delivery/i },
  { path: "/docs", heading: /guides to run reliable data operations/i },
  { path: "/trust", heading: /evaluate caudals reliability before you launch/i },
  { path: "/about", heading: /dataset platform designed for operational trust/i },
  { path: "/contact", heading: /talk to the caudals team/i },
  { path: "/legal/privacy", heading: /privacy policy/i },
  { path: "/legal/terms", heading: /terms of service/i },
  { path: "/legal/cookies", heading: /cookie policy/i },
];

test.describe("public route health", () => {
  for (const route of publicRoutes) {
    test(`${route.path} renders`, async ({ page }) => {
      await page.goto(route.path);
      await expect(page.getByRole("heading", { name: route.heading })).toBeVisible();
    });
  }
});

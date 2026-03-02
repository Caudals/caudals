import { expect, test, type Page } from "@playwright/test";

const AUTH_E2E_ENABLED = process.env.PLAYWRIGHT_AUTH_E2E === "true";
const FIXTURE_PASSWORD = process.env.TEST_FIXTURE_PASSWORD ?? "CaudalsFixture123!";

async function signIn(page: Page, email: string) {
  await page.goto("/auth/sign-in");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(FIXTURE_PASSWORD);
  await page.getByRole("button", { name: /sign in|iniciar sesión/i }).click();

  await expect
    .poll(
      async () => {
        const cookies = await page.context().cookies();
        return cookies.some((cookie) => cookie.name.includes("-auth-token"));
      },
      {
        timeout: 15_000,
        message: `Expected Supabase auth cookie after signing in as ${email}`,
      }
    )
    .toBe(true);
}

test.describe("authenticated role journeys", () => {
  test.describe.configure({ mode: "serial" });

  test.skip(
    !AUTH_E2E_ENABLED,
    "Set PLAYWRIGHT_AUTH_E2E=true to run authenticated fixture-user smoke checks."
  );

  test("requester can access role home and datasets workspace", async ({ page }) => {
    await signIn(page, "fixture.requester@caudals.local");
    await page.goto("/requester");
    await expect(
      page.getByText(/requester workspace|espacio de solicitante/i)
    ).toBeVisible();

    await page.goto("/requester/datasets");
    await expect(page).toHaveURL(/\/requester\/datasets/);
    await expect(
      page.getByRole("heading", {
        name: /manage dataset briefs|manage briefs|gestionar/i,
      }),
    ).toBeVisible();
  });

  test("contributor can access role home and contributions workspace", async ({ page }) => {
    await signIn(page, "fixture.contributor@caudals.local");
    await page.goto("/contributor");
    await expect(page.getByText(/contributor dashboard|panel de colaborador/i)).toBeVisible();

    await page.goto("/contributor/contributions");
    await expect(page).toHaveURL(/\/contributor\/contributions/);
    await expect(page.getByRole("heading", { name: /my contributions|mis contribuciones/i })).toBeVisible();
  });

  test("admin can access role home and moderation queue", async ({ page }) => {
    await signIn(page, "fixture.admin@caudals.local");
    await page.goto("/admin");
    await expect(
      page.getByRole("heading", {
        name: /admin dashboard|panel de administración|good .*admin/i,
      })
    ).toBeVisible();

    await page.goto("/admin/requests");
    await expect(page).toHaveURL(/\/admin\/requests/);
    await expect(page.getByRole("heading", { name: /pending dataset requests|solicitudes de dataset pendientes/i })).toBeVisible();
  });

  test("requester dashboard layout remains functional across breakpoints", async ({
    page,
  }) => {
    await signIn(page, "fixture.requester@caudals.local");
    await page.goto("/requester");

    const breakpoints = [
      { name: "mobile", width: 390, height: 844 },
      { name: "tablet", width: 834, height: 1112 },
      { name: "desktop", width: 1440, height: 900 },
    ];

    for (const viewport of breakpoints) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto("/requester");

      await expect(
        page.getByText(/requester workspace|espacio de solicitante/i),
        `${viewport.name} viewport should render requester header`
      ).toBeVisible();
      await expect(page.getByRole("link", { name: /new dataset|nuevo dataset/i })).toBeVisible();
    }
  });
});

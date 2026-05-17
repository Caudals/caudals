import { describe, expect, it } from "vitest";

import {
  V1_API_VERSION,
  canAcceptDeliveryState,
  canDisputeDeliveryState,
  canPauseSubscriptionState,
  getV1EndpointDocs,
  isPublicRestCatalogueEnabled,
  isPublicRestV1Enabled,
  v1EndpointDocs,
} from "@/lib/api/v1";

describe("public REST v1 contract", () => {
  it("keeps v1 enabled unless explicitly disabled", () => {
    expect(isPublicRestV1Enabled({} as NodeJS.ProcessEnv)).toBe(true);
    expect(
      isPublicRestV1Enabled({
        PUBLIC_REST_V1_ENABLED: "false",
      } as unknown as NodeJS.ProcessEnv),
    ).toBe(false);
  });

  it("documents the versioned API surface inline", () => {
    expect(V1_API_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const paths = v1EndpointDocs.map((endpoint) => endpoint.path);

    expect(paths).toContain("/v1");
    expect(paths).toContain("/v1/briefs");
    expect(paths).toContain("/v1/subscriptions/{id}/pause");
    expect(paths).not.toContain("/v1/datasets");
  });

  it("keeps catalogue dataset docs behind an explicit future flag", () => {
    expect(isPublicRestCatalogueEnabled({} as NodeJS.ProcessEnv)).toBe(false);
    expect(
      isPublicRestCatalogueEnabled({
        PUBLIC_REST_CATALOGUE_ENABLED: "true",
      } as unknown as NodeJS.ProcessEnv),
    ).toBe(true);

    const defaultPaths = getV1EndpointDocs({} as NodeJS.ProcessEnv).map(
      (endpoint) => endpoint.path,
    );
    const cataloguePaths = getV1EndpointDocs({
      PUBLIC_REST_CATALOGUE_ENABLED: "true",
    } as unknown as NodeJS.ProcessEnv).map((endpoint) => endpoint.path);

    expect(defaultPaths).not.toContain("/v1/datasets");
    expect(defaultPaths).not.toContain(
      "/v1/datasets/{id}/versions/{versionId}/sample",
    );
    expect(cataloguePaths).toContain("/v1/datasets");
    expect(cataloguePaths).toContain(
      "/v1/datasets/{id}/versions/{versionId}/sample",
    );
  });

  it("blocks unsafe buyer-side state transitions", () => {
    expect(canAcceptDeliveryState("sent")).toBe(true);
    expect(canAcceptDeliveryState("scheduled")).toBe(false);
    expect(canDisputeDeliveryState("accepted")).toBe(true);
    expect(canDisputeDeliveryState("scheduled")).toBe(false);
    expect(canPauseSubscriptionState("refreshing")).toBe(true);
    expect(canPauseSubscriptionState("paused")).toBe(false);
  });
});

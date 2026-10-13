import type { SectorId } from "@/lib/public/sectors";

/**
 * The pilot request (launch L-30): `/contact` with the pilot preselected.
 * Clicks on it count as `pilot_requested` (lib/analytics/funnel-links.ts).
 */
export const PILOT_REQUEST_PATH = "/contact?offer=pilot-evaluation";

/** A sector page's pilot request, with its sector preselected on the form. */
export function sectorPilotRequestPath(sector: SectorId) {
  return `${PILOT_REQUEST_PATH}&sector=${sector}`;
}

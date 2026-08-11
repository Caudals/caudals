export type AttributionJourney = {
  parentEventId: string;
  visitorId: string;
  shortCode: string;
};

const STORAGE_KEY = "caudals_first_party_attribution";
const TOKEN = /^([0-9a-f-]{36})\.([0-9a-f-]{36})\.([a-z0-9_-]{6,32})$/i;

export function readAttributionJourney(): AttributionJourney | null {
  if (typeof window === "undefined") return null;
  try {
    const incoming = new URL(window.location.href).searchParams.get("caudals_attribution");
    const value = incoming ?? window.sessionStorage.getItem(STORAGE_KEY);
    const match = value?.match(TOKEN);
    if (!match?.[1] || !match[2] || !match[3]) return null;
    if (incoming) {
      window.sessionStorage.setItem(STORAGE_KEY, incoming);
      const clean = new URL(window.location.href);
      clean.searchParams.delete("caudals_attribution");
      window.history.replaceState(window.history.state, "", `${clean.pathname}${clean.search}${clean.hash}`);
    }
    return { parentEventId: match[1], visitorId: match[2], shortCode: match[3] };
  } catch {
    return null;
  }
}

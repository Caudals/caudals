import { AppNotFound } from "@/components/evals/app-not-found";

/**
 * `notFound()` anywhere in the signed-in app renders here, inside its layout,
 * so the person keeps the shell. URLs that match no route at all still get
 * the localized public 404 (`app/global-not-found.tsx`).
 */
export default function AuthenticatedNotFound() {
  return <AppNotFound />;
}

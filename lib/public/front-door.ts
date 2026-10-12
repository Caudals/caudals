import { appOrigin } from "@/lib/evals/app-origin";

/**
 * The public front door (launch L-04).
 *
 * `DEMO_PUBLIC=true` makes the free test the main way in, all at once: the
 * header pill, the hero, sector and closing CTAs lead to `/{locale}/demo`; the
 * header and footer gain "Sign in"; the demo page is indexed and listed in the
 * sitemap, agent markdown and `llms.txt`; and its report offers the reordered
 * account card with "Send to a colleague". Off, the site is as it was.
 *
 * Read on the server at render time, never baked into the client bundle (the
 * image build only receives NEXT_PUBLIC_APP_URL). The public tree revalidates
 * (`app/[locale]/layout.tsx`), so prerendered pages pick up a change a few
 * minutes after the app restarts with new credentials.
 */
export function demoPublicEnabled(env: Record<string, string | undefined> = process.env) {
  return env.DEMO_PUBLIC?.trim() === "true";
}

export type FrontDoor = {
  /** `DEMO_PUBLIC`: the free test is linked, indexed and offers sharing. */
  demoPublic: boolean;
  /** The app's sign-in page, for the header and footer. */
  signInUrl: string;
};

export function frontDoor(): FrontDoor {
  return { demoPublic: demoPublicEnabled(), signInUrl: `${appOrigin()}/workspace/sign-in` };
}

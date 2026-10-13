"use client";

import { LocaleLink as Link } from "@/components/i18n/locale-link";
import { useFrontDoor } from "@/components/public/front-door";

/**
 * The methodology page's closing actions: the free test while it is the front
 * door (DEMO_PUBLIC, launch L-04), otherwise the diagnostic request; a call
 * either way.
 */
export function MethodologyCta({ demo, contact, call }: { demo: string; contact: string; call: string }) {
  const { demoPublic } = useFrontDoor();
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <Link
        href={demoPublic ? "/demo" : "/contact?offer=reality-check"}
        className="inline-flex items-center justify-center gap-2 rounded-full bg-[#141413] px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-[#3b3a36]"
      >
        {demoPublic ? demo : contact}
        <span aria-hidden="true">→</span>
      </Link>
      <Link
        href="/call"
        className="inline-flex items-center justify-center rounded-full border border-[#dcdad3] bg-white px-6 py-3 text-sm font-medium text-[#141413] transition-colors hover:border-[#141413]"
      >
        {call}
      </Link>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Header } from "@/components/ui/header";
import { MarketingFooter } from "@/components/marketing/footer";
import { EmailLink } from "@/components/public/email-link";
import { Button } from "@/components/ui/button";
import { BookingEmbed, type BookingConfirmation } from "@/components/call/booking-embed";
import { LocaleLink as Link } from "@/components/i18n/locale-link";
import { useFrontDoor } from "@/components/public/front-door";
import { useLocale, useTranslations } from "@/lib/i18n/context";
import type { Locale } from "@/lib/i18n/config";
import type { ScopedTranslator } from "@/lib/i18n/messages";

type CallPageContentProps = {
  /** Public Cal.com booking link (e.g. "caudals/call"). Absent → graceful fallback. */
  calLink?: string;
};

const AGENDA = ["agenda1", "agenda2", "agenda3"] as const;
const DATE_LOCALES: Record<Locale, string> = { en: "en-US", es: "es-ES" };

/** The booked slot in the visitor's language and time zone, e.g. "Tuesday, October 14 at 10:00 AM CEST". */
export function formatBookedSlot(startTime: string, locale: Locale, timeZone?: string): string | null {
  const date = new Date(startTime);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(DATE_LOCALES[locale], {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
    ...(timeZone ? { timeZone } : {}),
  }).format(date);
}

/**
 * Meeting booking (`/call`): what the 30 minutes cover in three lines, the
 * Cal.com scheduler, and, once Cal reports a booking, a confirmation in the
 * visitor's language in place of the scheduler (launch L-30).
 */
export function CallPageContent({ calLink }: CallPageContentProps) {
  const t = useTranslations("call");
  const [booking, setBooking] = useState<BookingConfirmation | null>(null);
  const onBooked = useCallback((value: BookingConfirmation) => setBooking(value), []);

  return (
    <div className="min-h-screen bg-background text-black font-mk-sans selection:bg-black selection:text-white">
      <Header />
      <main className="mx-auto flex w-full max-w-5xl flex-col px-6 pb-24 pt-16 sm:px-8 lg:px-12 lg:pt-20">
        <header className="mb-10 text-center">
          <h1 className="text-4xl font-normal tracking-tight sm:text-5xl">
            {t("title")}
          </h1>
          <p className="mt-6 text-base text-gray-600 max-w-xl mx-auto leading-relaxed">
            {t("subtitle")}
          </p>
          {/* Cal's own event panel is hidden (its title is not localized), so the page states the format. */}
          <p className="mt-3 text-sm text-gray-500">{t("details")}</p>
        </header>

        <section aria-labelledby="call-agenda" className="mx-auto mb-12 w-full max-w-md">
          <h2 id="call-agenda" className="text-sm font-medium text-[#6b6a63]">
            {t("agendaTitle")}
          </h2>
          <ol className="mt-3 border-t border-[#e9e7e1]">
            {AGENDA.map((key, index) => (
              <li key={key} className="flex gap-4 border-b border-[#e9e7e1] py-3 text-[15px] leading-snug text-[#141413]">
                <span aria-hidden="true" className="w-4 shrink-0 tabular-nums text-[#6b6a63]">
                  {index + 1}
                </span>
                <span>{t(key)}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="w-full" aria-label={t("scheduler")}>
          {booking ? (
            <BookingConfirmed booking={booking} t={t} />
          ) : calLink ? (
            <BookingEmbed calLink={calLink} onBooked={onBooked} title={t("scheduler")} />
          ) : (
            <SchedulerNotConfigured t={t} />
          )}

          <p className="mt-8 text-center text-sm leading-relaxed text-gray-500">
            {t("preferWrite")}{" "}
            <Link
              href="/contact"
              className="font-medium text-black underline decoration-1 underline-offset-4 hover:text-gray-700"
            >
              {t("describeSystem")}
            </Link>{" "}
            {t("orEmail")}{" "}
            <EmailLink
              email="hello@caudals.com"
              className="font-medium text-black underline decoration-1 underline-offset-4 hover:text-gray-700"
            />
            .
          </p>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}

/** Replaces the scheduler once Cal confirms the booking; focus moves to it so screen readers announce it. */
function BookingConfirmed({ booking, t }: { booking: BookingConfirmation; t: ScopedTranslator<"call"> }) {
  const locale = useLocale();
  const { demoPublic } = useFrontDoor();
  const heading = useRef<HTMLHeadingElement>(null);
  const when = booking.startTime ? formatBookedSlot(booking.startTime, locale) : null;
  useEffect(() => {
    heading.current?.focus();
  }, []);

  return (
    <div role="status" className="mx-auto max-w-xl rounded-[14px] border border-[#e9e7e1] bg-white px-6 py-10 text-center sm:px-10">
      <h2 ref={heading} tabIndex={-1} className="text-2xl font-normal tracking-tight text-[#141413] outline-none">
        {t("confirmedTitle")}
      </h2>
      {when ? <p className="mt-4 text-base text-[#141413]">{t("confirmedWhen", { date: when })}</p> : null}
      <p className="mt-3 text-sm leading-relaxed text-[#3b3a36]">{t("confirmedInvite")}</p>
      {demoPublic ? (
        <p className="mt-6 border-t border-[#e9e7e1] pt-6 text-sm leading-relaxed text-[#3b3a36]">
          {t("confirmedPrepare")}{" "}
          <Link href="/demo" className="font-medium text-black underline decoration-1 underline-offset-4 hover:text-gray-700">
            {t("confirmedTest")}
          </Link>
        </p>
      ) : null}
    </div>
  );
}

function SchedulerNotConfigured({ t }: { t: ScopedTranslator<"call"> }) {
  return (
    <div className="flex min-h-[480px] flex-col items-center justify-center px-6 text-center">
      <h2 className="text-lg font-bold text-black">
        {t("unavailableTitle")}
      </h2>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-gray-500">
        {t("unavailableBody")}
      </p>
      <Button
        asChild
        className="mt-6 rounded-md bg-black px-6 font-bold text-white hover:bg-black/90"
      >
        <Link href="/contact">{t("contactUs")}</Link>
      </Button>
    </div>
  );
}

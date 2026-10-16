import type { Locale } from "@/lib/i18n/config";
import { createScopedTranslator } from "@/lib/i18n/messages";

/**
 * Programs and institutions that back Caudals: the original marks, flattened
 * to one ink on a transparent background. Heights are set per mark so a wide
 * wordmark and a tall emblem carry the same visual weight; the first row is
 * kept the wider of the two.
 */
const ROWS = [
  [
    { name: "NVIDIA Inception Program", src: "/logos/nvidia-inception.svg", h: 40 },
    { name: "Claude", src: "/logos/claude.svg", h: 30 },
    { name: "AWS", src: "/logos/aws.svg", h: 32 },
    { name: "Santander X", src: "/logos/santander-x.svg", h: 20 },
    { name: "Wolaria · Aceleradora de Castilla y León", src: "/logos/wolaria.svg", h: 32 },
  ],
  [
    { name: "Consolida Startup", src: "/logos/consolida-startup.png", h: 20 },
    { name: "IdeVa · Agencia de Innovación y Desarrollo Económico de Valladolid", src: "/logos/ideva.svg", h: 36 },
    { name: "Universidad de Valladolid", src: "/logos/uva.png", h: 40 },
    { name: "Junta de Castilla y León", src: "/logos/junta-castilla-y-leon.svg", h: 44 },
    { name: "Iniciativa Campus Emprendedor", src: "/logos/campus-emprendedor.png", h: 44 },
  ],
] as const;

/** Bump when a file under /logos is replaced in place; the CDN caches them for hours. */
const LOGO_VERSION = "3";

export function PartnerLogos({ locale }: { locale: Locale }) {
  const t = createScopedTranslator(locale, "partners");

  return (
    <div className="lp-wrap">
      <section className="lp-logos" aria-label={t("label")}>
        <p className="lp-label">{t("label")}</p>
        <div className="lp-logo-rows">
          {ROWS.map((row, i) => (
            <div key={i} className="lp-logo-row">
              {row.map((logo) => (
                // eslint-disable-next-line @next/next/no-img-element -- static PNG/SVG marks, served unoptimized
                <img
                  key={logo.name}
                  src={`${logo.src}?v=${LOGO_VERSION}`}
                  alt={logo.name}
                  loading="lazy"
                  decoding="async"
                  style={{ ["--h" as string]: `${logo.h}px` }}
                />
              ))}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

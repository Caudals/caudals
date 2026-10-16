import type { Locale } from "@/lib/i18n/config";
import { createScopedTranslator } from "@/lib/i18n/messages";

/**
 * Programs and institutions that back Caudals, flattened to one ink. The
 * startup-program lockups share one height and label style; heights elsewhere
 * are set per mark so a wide wordmark and a tall crest carry the same weight.
 * First row: startup programs; second row: Castilla y León institutions.
 */
const ROWS = [
  [
    { name: "NVIDIA Inception Program", src: "/logos/nvidia-inception.svg", h: 40 },
    { name: "AWS for Startups", src: "/logos/aws-startups.svg", h: 40 },
    { name: "Claude for Startups", src: "/logos/claude-for-startups.svg", h: 40 },
    { name: "Wolaria · Aceleradora de Castilla y León", src: "/logos/wolaria.png", h: 40 },
    { name: "Santander X", src: "/logos/santander-x.png", h: 19.8 },
  ],
  [
    { name: "FUESCYL · Junta de Castilla y León", src: "/logos/fuescyl-jcyl.png", h: 40.8 },
    { name: "Universidad de Valladolid", src: "/logos/uva.png", h: 43.2 },
    { name: "IdeVa · Agencia de Innovación y Desarrollo Económico de Valladolid", src: "/logos/ideva.svg", h: 40 },
    { name: "Iniciativa Campus Emprendedor", src: "/logos/campus-emprendedor.png", h: 45.6 },
    { name: "Consolida Startup", src: "/logos/consolida-startup.png", h: 21.6 },
  ],
] as const;

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
                  src={logo.src}
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

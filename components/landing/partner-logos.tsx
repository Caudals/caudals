"use client";

import { useTranslations } from "@/lib/i18n/context";

/**
 * Institutions that back Caudals, flattened to one ink. Heights are set per
 * mark so a wide wordmark and a tall crest carry the same visual weight.
 */
const ROWS = [
  [
    { name: "FUESCYL · Junta de Castilla y León", src: "/logos/fuescyl-jcyl.png", h: 34 },
    { name: "Iniciativa Campus Emprendedor", src: "/logos/campus-emprendedor.png", h: 38 },
    { name: "Santander X", src: "/logos/santander-x.png", h: 16.5 },
    { name: "Universidad de Valladolid", src: "/logos/uva.png", h: 36 },
  ],
  [
    { name: "Fundación UVa", src: "/logos/fundacion-uva.png", h: 26 },
    { name: "Ayuntamiento de Valladolid", src: "/logos/ayuntamiento-valladolid.png", h: 32 },
    { name: "Consolida Startup", src: "/logos/consolida-startup.png", h: 18 },
  ],
] as const;

export function PartnerLogos() {
  const t = useTranslations("partners");

  return (
    <div className="lp-wrap">
      <section className="lp-logos" aria-label={t("label")}>
        <p className="lp-label">{t("label")}</p>
        <div className="lp-logo-rows">
          {ROWS.map((row, i) => (
            <div key={i} className="lp-logo-row">
              {row.map((logo) => (
                // eslint-disable-next-line @next/next/no-img-element -- static PNGs, served unoptimized
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

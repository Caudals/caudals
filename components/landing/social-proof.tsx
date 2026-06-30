"use client";

import { useTranslations } from "@/lib/i18n/use-translations";

const partners = [
  // Per-logo `scale` evens out heights: FUESCYL·JCyL is very wide (renders short),
  // Campus Emprendedor is tall — nudge them toward a similar height.
  { name: "FUESCYL · Junta de Castilla y León", src: "/logos/fuescyl-jcyl.png", scale: "scale-[1.4]" },
  { name: "Iniciativa Campus Emprendedor", src: "/logos/campus-emprendedor.png", scale: "scale-[0.72]" },
  { name: "Santander X", src: "/logos/santander-x.png" },
  { name: "Universidad de Valladolid", src: "/logos/uva.png" },
  { name: "Fundación UVa", src: "/logos/fundacion-uva.png" },
  { name: "Ayuntamiento de Valladolid", src: "/logos/ayuntamiento-valladolid.png" },
  { name: "Consolida Startup", src: "/logos/consolida-startup.png" },
];

export function SocialProofSection() {
  const t = useTranslations();

  return (
    <section className="relative py-24 sm:py-32 bg-white">
      <div className="relative z-10 mx-auto max-w-6xl px-6 sm:px-8 lg:px-12">
        <div className="mb-16 text-center mx-auto max-w-3xl">
          <p className="text-[13px] font-bold text-teal-600 mb-4">
            {t("Recognition & partners")}
          </p>
          <h2 className="text-4xl font-normal tracking-tight text-black sm:text-5xl">
            {t("Recognitions and institutions we've worked with")}
          </h2>
          <p className="text-base text-gray-500 mt-6 leading-relaxed">
            {t(
              "Backed by leading institutions, programs, and public organizations across our journey.",
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-10 sm:gap-x-14 sm:gap-y-12">
          {partners.map((partner) => (
            <div
              key={partner.name}
              className="flex h-16 w-36 items-center justify-center sm:h-20 sm:w-44 lg:w-48"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={partner.src}
                alt={partner.name}
                loading="lazy"
                className={`max-h-full max-w-full object-contain ${partner.scale ?? ""}`}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

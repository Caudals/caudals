"use client";

import { useRef } from "react";
import {
  cubicBezier,
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "framer-motion";
import { useTranslations } from "@/lib/i18n/context";

/** Slow, symmetric ease so the fade has no visible start or finish. */
const entranceEase = cubicBezier(0.45, 0, 0.25, 1);

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
  const t = useTranslations("socialProof");
  const sectionRef = useRef<HTMLElement>(null);
  const reduceMotion = useReducedMotion();

  // 0 when the section's top enters at the bottom of the viewport, 1 when it reaches the top —
  // on the home page that is exactly the stretch where it rises through the hero's sky.
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "start start"],
  });
  // A soft spring on top of the scroll value keeps the entrance gliding between wheel ticks.
  const entrance = useSpring(scrollYProgress, { stiffness: 42, damping: 20, mass: 1 });
  const headingOpacity = useTransform(entrance, [0, 0.95], [0, 1], { ease: entranceEase });
  const headingY = useTransform(entrance, [0, 1], [reduceMotion ? 0 : 160, 0], { ease: entranceEase });
  const logosOpacity = useTransform(entrance, [0.2, 1], [0, 1], { ease: entranceEase });
  const logosY = useTransform(entrance, [0.05, 1], [reduceMotion ? 0 : 220, 0], { ease: entranceEase });

  return (
    // Transparent: on the home page this section rises into the hero's pinned sky.
    <section ref={sectionRef} className="relative py-24 sm:py-32">
      <div className="relative z-10 mx-auto max-w-6xl px-6 sm:px-8 lg:px-12">
        <motion.div
          style={{ opacity: headingOpacity, y: headingY }}
          className="mb-16 text-center mx-auto max-w-3xl"
        >
          <p className="text-[13px] font-bold text-teal-600 mb-4">
            {t("eyebrow")}
          </p>
          <h2 className="text-4xl font-normal tracking-tight text-black sm:text-5xl">
            {t("title")}
          </h2>
          <p className="text-base text-gray-500 mt-6 leading-relaxed">
            {t("subtitle")}
          </p>
        </motion.div>

        <motion.div
          style={{ opacity: logosOpacity, y: logosY }}
          className="flex flex-wrap items-center justify-center gap-x-10 gap-y-10 sm:gap-x-14 sm:gap-y-12"
        >
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
                decoding="async"
                className={`max-h-full max-w-full object-contain ${partner.scale ?? ""}`}
              />
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

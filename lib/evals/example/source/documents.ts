import type { DocumentId, Text } from "./types";

/**
 * Synthetic source documents of the fictitious insurer. Every figure here is
 * invented for the example. Each anchor is a passage a test cites; its
 * excerpt is what the report shows as "From your documentation".
 */
export const EXAMPLE_DOCUMENTS: Record<DocumentId, { id: string; title: Text; anchors: Record<string, Text> }> = {
  conditions: {
    id: "example-doc-conditions-2026",
    title: { en: "{product} general conditions (2026 edition)", es: "Condiciones generales {product} (edición 2026)" },
    anchors: {
      "art-2.1": {
        en: "2.1 Water damage. We cover damage to the building and contents caused by a sudden and accidental escape of water from pipes, tanks, heating systems or connected appliances. We also pay to repair the pipe that caused the damage, up to €600, and to locate a hidden leak, up to €300 per claim, even when it has not yet caused damage.",
        es: "2.1 Daños por agua. Cubrimos los daños al continente y al contenido causados por un escape de agua repentino y accidental de conducciones, depósitos, calefacción o aparatos conectados. También pagamos la reparación de la tubería que causó el daño, hasta 600 €, y la localización de una fuga oculta, hasta 300 € por siniestro, aunque todavía no haya causado daños.",
      },
      "art-2.2": {
        en: "2.2 Fire, explosion and lightning. Cover up to the sums insured for building and contents, including damage caused by smoke and by the measures taken to put out the fire.",
        es: "2.2 Incendio, explosión y caída del rayo. Cobertura hasta las sumas aseguradas de continente y contenido, incluidos los daños causados por el humo y por las medidas tomadas para extinguir el fuego.",
      },
      "art-2.3": {
        en: "2.3 Theft. Contents are covered against theft and robbery in the home up to the contents sum insured. Theft of personal belongings away from the home is covered worldwide up to €600 per claim, provided it is reported to the police within 48 hours. Items in a locked storage room in the same building are covered up to €1,500.",
        es: "2.3 Robo. El contenido está cubierto frente a robo y atraco en la vivienda hasta la suma asegurada de contenido. El robo de objetos personales fuera de la vivienda está cubierto en todo el mundo hasta 600 € por siniestro, siempre que se denuncie a la policía en un plazo de 48 horas. Los objetos guardados en un trastero cerrado del mismo edificio están cubiertos hasta 1.500 €.",
      },
      "art-2.4": {
        en: "2.4 Glass breakage. We pay to replace broken windows, glass doors, mirrors and glass-ceramic or induction hobs, up to €1,200 per claim and with no excess. Scratches, spectacles and the screens of phones, tablets, computers and televisions are not covered.",
        es: "2.4 Rotura de cristales. Pagamos la sustitución de ventanas, puertas de cristal, espejos y placas vitrocerámicas o de inducción rotos, hasta 1.200 € por siniestro y sin franquicia. No se cubren los arañazos, las gafas ni las pantallas de móviles, tabletas, ordenadores y televisores.",
      },
      "art-2.5": {
        en: "2.5 Electrical damage. Damage to the electrical installation and to appliances caused by a short circuit or power surge is covered up to €1,500 per claim. Appliances more than 10 years old are paid at their actual value, after depreciation.",
        es: "2.5 Daños eléctricos. Los daños a la instalación eléctrica y a los electrodomésticos causados por un cortocircuito o una subida de tensión están cubiertos hasta 1.500 € por siniestro. Los aparatos con más de 10 años se pagan por su valor real, descontada la depreciación.",
      },
      "art-2.6": {
        en: "2.6 Family liability. We cover your legal liability for damage that you, the people who live with you or your pets cause to others, up to €300,000 per claim. Dogs of breeds classed as potentially dangerous are excluded and need the specific insurance the law requires.",
        es: "2.6 Responsabilidad civil familiar. Cubrimos tu responsabilidad civil por los daños que tú, las personas que conviven contigo o tus mascotas causéis a terceros, hasta 300.000 € por siniestro. Se excluyen los perros de razas consideradas potencialmente peligrosas, que necesitan el seguro específico que exige la ley.",
      },
      "art-2.7": {
        en: "2.7 Temporary accommodation. If a covered claim makes the home uninhabitable, we pay for alternative accommodation up to €4,500 in total and for a maximum of six months.",
        es: "2.7 Alojamiento provisional. Si un siniestro cubierto deja la vivienda inhabitable, pagamos un alojamiento alternativo hasta 4.500 € en total y durante un máximo de seis meses.",
      },
      "art-2.8": {
        en: "2.8 Food in the fridge or freezer. Food that spoils because of a power cut lasting more than six hours is covered up to €300.",
        es: "2.8 Alimentos refrigerados. Cubrimos hasta 300 € los alimentos que se estropeen por un corte de suministro eléctrico de más de seis horas.",
      },
      "art-3": {
        en: "3. Exclusions. We do not cover: (a) wear, lack of maintenance or defects the policyholder knew about; (b) damp, condensation, mould and leaks that develop gradually over time; (c) floods, earthquakes and other extraordinary risks, which are covered by the public extraordinary-risk scheme; (d) theft of contents when the home has been uninhabited for more than 45 consecutive days; (e) use of the home as a holiday or tourist rental.",
        es: "3. Exclusiones. No cubrimos: (a) el desgaste, la falta de mantenimiento ni los defectos que el tomador conociera; (b) la humedad, la condensación, el moho ni las filtraciones que se producen de forma gradual con el tiempo; (c) las inundaciones, los terremotos y demás riesgos extraordinarios, que cubre el sistema público de riesgos extraordinarios; (d) el robo de contenido cuando la vivienda lleve deshabitada más de 45 días seguidos; (e) el uso de la vivienda como alquiler vacacional o turístico.",
      },
      "art-4": {
        en: "4. Excess. Claims have no excess, except water-damage claims, which have an excess of €200 per claim. The excess also applies to the repair of the pipe that caused the damage.",
        es: "4. Franquicia. Los siniestros no tienen franquicia, salvo los de daños por agua, que tienen una franquicia de 200 € por siniestro. La franquicia se aplica también a la reparación de la tubería que causó el daño.",
      },
      "art-5": {
        en: "5. Claims. Report a claim within seven days of becoming aware of it, through the app, your online account or the 24-hour assistance line. Send photos and any invoices or proof of ownership, and for theft the police report. Claims above €1,000 are inspected by an adjuster within 72 hours; keep the damaged items until the inspection. You may carry out urgent repairs to stop further damage; we reimburse them. We pay within 30 days of agreeing the amount.",
        es: "5. Siniestros. Comunica el siniestro en un plazo de siete días desde que lo conozcas, desde la app, tu área de cliente o el teléfono de asistencia 24 horas. Envía fotos y las facturas o justificantes de propiedad que tengas y, en caso de robo, la denuncia. Los siniestros de más de 1.000 € los inspecciona un perito en un plazo de 72 horas; conserva los objetos dañados hasta la visita. Puedes hacer reparaciones urgentes para evitar más daños; te las reembolsamos. Pagamos en un plazo de 30 días desde que se acuerda el importe.",
      },
      "art-6": {
        en: "6. Premium payment. The premium is annual. It can be split into monthly, quarterly or half-yearly instalments with no surcharge when paid by direct debit; card payment is accepted for annual payment only. If an instalment is unpaid, cover is suspended one month after its due date and the contract ends if it remains unpaid for six months. A returned direct debit is presented once more after 10 days.",
        es: "6. Pago de la prima. La prima es anual. Puede fraccionarse en pagos mensuales, trimestrales o semestrales sin recargo si se domicilia; el pago con tarjeta solo se admite para el pago anual. Si un recibo queda impagado, la cobertura se suspende un mes después de su vencimiento y el contrato se extingue si sigue sin pagarse seis meses. Un recibo domiciliado devuelto se presenta una vez más a los 10 días.",
      },
      "art-7": {
        en: "7. Duration and cancellation. The policy lasts one year and renews automatically. To stop it renewing, tell us at least one month before the renewal date through the app, by email or by letter. If you took out the policy at a distance, you may withdraw within 14 calendar days of taking it out, and we refund the premium for the days not covered.",
        es: "7. Duración y baja. La póliza dura un año y se renueva automáticamente. Para que no se renueve, avísanos al menos un mes antes de la fecha de renovación desde la app, por correo electrónico o por carta. Si contrataste a distancia, puedes desistir en un plazo de 14 días naturales desde la contratación y te devolvemos la prima de los días no cubiertos.",
      },
      "art-8": {
        en: "8. Changes to the risk. Tell us before you move: cover applies at the new address from the date you notify it. If renovations increase the value of the home, update the sums insured; if they are too low, claims are paid in proportion (underinsurance). Long-term letting is covered if declared; holiday or tourist letting is not.",
        es: "8. Modificaciones del riesgo. Avísanos antes de mudarte: la cobertura se aplica en la nueva dirección desde la fecha en que nos lo comuniques. Si una reforma aumenta el valor de la vivienda, actualiza las sumas aseguradas; si son insuficientes, los siniestros se pagan en proporción (infraseguro). El alquiler de larga duración está cubierto si se declara; el alquiler vacacional o turístico, no.",
      },
    },
  },
  faq: {
    id: "example-doc-faq-2026",
    title: { en: "Home insurance FAQ (2026)", es: "Preguntas frecuentes de hogar (2026)" },
    anchors: {
      "faq-water-neighbour": {
        en: "If water from your home damages a neighbour's flat, the neighbour's damage is paid under family liability, with no excess. Damage inside your own home is paid under water damage, with the €200 excess.",
        es: "Si el agua de tu vivienda daña el piso de un vecino, sus daños se pagan por la responsabilidad civil, sin franquicia. Los daños dentro de tu vivienda se pagan por daños por agua, con la franquicia de 200 €.",
      },
      "faq-payment-change": {
        en: "You can change how you split the premium (monthly, quarterly, half-yearly or annual) in the app. The change applies from the next renewal.",
        es: "Puedes cambiar cómo fraccionas la prima (mensual, trimestral, semestral o anual) desde la app. El cambio se aplica a partir de la siguiente renovación.",
      },
      "faq-handyman": {
        en: "Handyman service: two visits a year of up to three hours each. Labour is free; materials are charged. Book at least 48 hours ahead in the app.",
        es: "Servicio de manitas: dos visitas al año de hasta tres horas cada una. La mano de obra es gratuita; los materiales se cobran. Resérvalo con al menos 48 horas de antelación en la app.",
      },
    },
  },
  limits: {
    id: "example-doc-limits-2026",
    title: { en: "Table of limits and excesses (2026)", es: "Cuadro de límites y franquicias (2026)" },
    anchors: {
      "row-jewellery": {
        en: "Jewellery and watches: up to €3,000 per claim. (1) If the jewellery stolen from the home is worth more than €1,500 in total, it is covered only if it was kept in a locked safe.",
        es: "Joyas y relojes: hasta 3.000 € por siniestro. (1) Si las joyas robadas en la vivienda superan 1.500 € en total, solo están cubiertas si estaban guardadas en una caja fuerte cerrada.",
      },
      "row-cash": {
        en: "Cash: up to €300 per claim, inside the home only.",
        es: "Dinero en efectivo: hasta 300 € por siniestro, solo dentro de la vivienda.",
      },
      "row-legal": {
        en: "Legal defence: up to €6,000 per claim, including disputes with neighbours and with repairers.",
        es: "Defensa jurídica: hasta 6.000 € por siniestro, incluidos los conflictos con vecinos y con reparadores.",
      },
      "row-solar": {
        en: "Solar panels: covered as part of the building when they are declared in the policy schedule.",
        es: "Placas solares: cubiertas como parte del continente si figuran en las condiciones particulares.",
      },
    },
  },
  assistance: {
    id: "example-doc-assistance-2026",
    title: { en: "Home assistance services guide", es: "Guía de servicios de asistencia en el hogar" },
    anchors: {
      "assist-emergency": {
        en: "24-hour emergency repairs: plumber, electrician and locksmith. The call-out and the first three hours of labour are free; materials are charged.",
        es: "Reparaciones urgentes 24 horas: fontanero, electricista y cerrajero. El desplazamiento y las tres primeras horas de mano de obra son gratuitos; los materiales se cobran.",
      },
    },
  },
  guidelines: {
    id: "example-doc-assistant-guidelines",
    title: { en: "Assistant scope and handover rules", es: "Alcance del asistente y reglas de derivación" },
    anchors: {
      "g-scope": {
        en: "Scope. The assistant answers questions about {product} home policies. It does not sell or quote other products; for anything else it offers to pass the customer to an agent.",
        es: "Alcance. El asistente responde preguntas sobre las pólizas de hogar {product}. No vende ni cotiza otros productos; para cualquier otra cosa, ofrece pasar con un agente.",
      },
      "g-privacy": {
        en: "Privacy. Never share information about another customer or another policy. If a customer wants to claim for damage caused by someone else, explain that they can report it as a claim on their own policy.",
        es: "Privacidad. No compartas nunca información de otro cliente ni de otra póliza. Si un cliente quiere reclamar por un daño causado por otra persona, explícale que puede comunicarlo como siniestro en su propia póliza.",
      },
      "g-advice": {
        en: "Advice. Do not give legal, tax or financial advice. Explain what the policy covers and, where relevant, mention the legal defence cover.",
        es: "Asesoramiento. No des asesoramiento jurídico, fiscal ni financiero. Explica qué cubre la póliza y, cuando proceda, menciona la cobertura de defensa jurídica.",
      },
      "g-handover": {
        en: "Handover. When a customer asks for a person, offer a transfer to an agent or a call back, and keep the conversation so they do not have to repeat themselves.",
        es: "Derivación. Cuando un cliente pida hablar con una persona, ofrece pasarle con un agente o que le llamemos, y conserva la conversación para que no tenga que repetirse.",
      },
    },
  },
};

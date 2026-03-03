import { type Locale } from "./config";

export interface PlaceholderDefinition {
  key: string;
  translation: string;
}

type PlaceholderMap = Partial<Record<Locale, PlaceholderDefinition[]>>;

export const placeholderTranslations: PlaceholderMap = {
  es: [
    {
      key: "Pay {{amount}} with Card",
      translation: "Paga {{amount}} con tarjeta",
    },
    {
      key: "Pay {{amount}} with Wallet",
      translation: "Paga {{amount}} con la cartera",
    },
    {
      key: "Additional {{amount}} needed to fully fund this dataset",
      translation: "Se necesitan {{amount}} adicionales para financiar completamente este dataset",
    },
    {
      key: "This dataset needs {{amount}} to start collecting contributions",
      translation: "Este dataset necesita {{amount}} para empezar a recibir contribuciones",
    },
    {
      key: "Failed to upload {{count}} file(s)",
      translation: "No se pudieron subir {{count}} archivo(s)",
    },
    {
      key: "Payment setup failed: {{error}}",
      translation: "Error en la configuración del pago: {{error}}",
    },
    {
      key: "{{count}} submissions approved!",
      translation: "¡{{count}} envíos aprobados!",
    },
    {
      key: "Dataset marked as {{status}}.",
      translation: "Dataset marcado como {{status}}.",
    },
    {
      key: "File {{name}} is too large. Maximum size is {{size}}MB",
      translation: "El archivo {{name}} es demasiado grande. El tamaño máximo es de {{size}} MB",
    },
    {
      key: "Accepted formats: {{formats}}",
      translation: "Formatos aceptados: {{formats}}",
    },
    {
      key: "Rejection reason: {{reason}}",
      translation: "Motivo del rechazo: {{reason}}",
    },
    {
      key: "Wallet Balance ({{amount}})",
      translation: "Saldo de la cartera ({{amount}})",
    },
    {
      key: "• Max {{size}}MB",
      translation: "• Máx {{size}} MB",
    },
  ],
};

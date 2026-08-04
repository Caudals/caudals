export type CaudalsAuthor = {
  slug: string;
  name: string;
  role: string;
  headline: string;
  description: string;
  bio: string[];
  education: string;
  linkedInUrl: string;
  githubUrl: string;
  credentialPdfPath: string;
};

export const CAUDALS_AUTHORS: readonly CaudalsAuthor[] = [
  {
    slug: "alonso-sandoval",
    name: "Alonso Sandoval",
    role: "Cofundador de Caudals",
    headline: "Ingeniero de telecomunicación especializado en producto, software y operaciones de datos para IA.",
    description:
      "Perfil de Alonso Sandoval, cofundador de Caudals e ingeniero de telecomunicación especializado en datasets y sistemas de IA.",
    bio: [
      "Alonso cofundó Caudals para facilitar que los equipos de IA accedan a datos específicos, utilizables y con derechos claros.",
      "Su trabajo combina desarrollo de producto, software y operaciones de datos, desde la definición del brief hasta la entrega de datasets listos para entrenamiento o evaluación.",
    ],
    education: "Grado en Ingeniería de Tecnologías de Telecomunicación por la Universidad de Valladolid.",
    linkedInUrl: "https://www.linkedin.com/in/alonso-sandoval-martinez/",
    githubUrl: "https://github.com/asandova-ui",
    credentialPdfPath: "/material/titulo-ingenieria-alonso-sandoval.pdf",
  },
  {
    slug: "mario-medrano-paredes",
    name: "Mario Medrano Paredes",
    role: "Cofundador de Caudals",
    headline: "Ingeniero de telecomunicación especializado en inteligencia artificial, visión artificial y calidad de datos.",
    description:
      "Perfil de Mario Medrano Paredes, cofundador de Caudals e ingeniero de telecomunicación especializado en IA y datasets.",
    bio: [
      "Mario cofundó Caudals para convertir datos empresariales difíciles de utilizar en datasets documentados y preparados para sistemas de IA.",
      "Su experiencia técnica abarca inteligencia artificial, visión artificial y evaluación de datos y modelos, con foco en calidad, trazabilidad y utilidad real.",
    ],
    education: "Grado en Ingeniería de Tecnologías de Telecomunicación por la Universidad de Valladolid.",
    linkedInUrl: "https://www.linkedin.com/in/medpar/",
    githubUrl: "https://github.com/medpar",
    credentialPdfPath: "/material/titulo-ingenieria-mario-medrano-paredes.pdf",
  },
] as const;

export function getCaudalsAuthor(slug: string) {
  return CAUDALS_AUTHORS.find((author) => author.slug === slug) ?? null;
}

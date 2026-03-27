import os

def replace_in_file(filepath, replacements):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    for old_str, new_str in replacements:
        if old_str in content:
            content = content.replace(old_str, new_str)
        else:
            print(f"Warning: Could not find '{old_str}' in {filepath}")
            
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

# 1. Update REMOTION_SCRIPT.md
script_replacements = [
    ("flujo gobernado.", "flujo controlado."),
    ("Una capa operativa.", "Una única capa operativa."),
    ("lista para mercado.", "lista para el mercado."),
    ("Plan de programa", "Plan del programa"),
    ("Equipos colaboradores", "Equipos de colaboradores"),
    ("Bucles de QA", "Ciclos de QA"),
    ("Canales de pago", "Pasarelas de pago"),
    ("Superficies por rol", "Interfaces por rol"),
    ("Tres superficies por rol.", "Tres interfaces por rol."),
    ("Un solo bucle operativo.", "Un único ciclo operativo."),
    ("Los colaboradores envían. Los administradores gobiernan.", "Los colaboradores entregan. Los administradores controlan."),
    ("Más rendimiento", "Mayor rendimiento"),
    ("superficies generadas en código", "interfaces generadas en código"),
    ("superficies por rol se sientan conectadas", "interfaces por rol se sientan conectadas"),
    ("Superficie web generada en código", "Interfaz web generada en código"),
    ("superficie pública", "interfaz pública")
]
replace_in_file("REMOTION_SCRIPT.md", script_replacements)


# 2. Update generate-launch-voiceover.mjs
voiceover_replacements = [
    (
        '"Caudals convierte las operaciones de datasets en un flujo gobernado para la era de la inteligencia artificial."',
        '"Caudals convierte las operaciones de datasets en un flujo controlado para la era de la inteligencia artificial."'
    ),
    (
        '"Una sola capa operativa conecta a solicitantes, colaboradores y administradores con velocidad, confianza y control."',
        '"Una única capa operativa conecta a solicitantes, colaboradores y administradores con velocidad, confianza y control."'
    ),
    (
        '"Desde la puerta de entrada, cada programa hace visible su propuesta, la oferta colaboradora, el control de calidad y los rieles de pago."',
        '"Desde la puerta de entrada, cada programa expone de forma clara su propuesta, la oferta de colaboradores, el control de calidad y las pasarelas de pago."'
    ),
    (
        '"Los colaboradores encuentran oportunidades reales con recompensas claras, contexto de modalidad y señales de urgencia que aceleran el rendimiento."',
        '"Los colaboradores encuentran oportunidades reales con recompensas claras, contexto de la modalidad y señales de urgencia que aceleran el rendimiento."'
    ),
    (
        '"Tres superficies sostienen un único bucle operativo: los solicitantes financian, los colaboradores envían y los administradores gobiernan."',
        '"Tres interfaces sostienen un único ciclo operativo: los solicitantes financian, los colaboradores entregan y los administradores moderan."'
    )
]
replace_in_file("scripts/generate-launch-voiceover.mjs", voiceover_replacements)


# 3. Update remotion/launch-video.tsx
video_replacements = [
    ('text="Plan de programa"', 'text="Plan del programa"'),
    ('text="Equipos colaboradores"', 'text="Equipos de colaboradores"'),
    ('Lanzamiento listo para mercado', 'Lanzamiento listo para el mercado'),
    ('activar oferta\n            colaboradora', 'activar la oferta\n            de colaboradores'),
    ('Sin tarifas de incorporación', 'Sin comisiones de alta'),
    ('["Riel de pagos", "Transferencias listas cada viernes"]', '["Infraestructura de pagos", "Transferencias listas cada viernes"]'),
    ('"Roles y permisos auditados",\n          "Rieles de pago verificados",', '"Roles y permisos auditados",\n          "Pasarelas de pago verificadas",'),
    ('impulsar mejores envíos.', 'conseguir mejores entregas.'),
    ('Corpus de audio aeroportuario', 'Corpus de audio para aeropuertos'),
    ('"Envíos y ganancias"', '"Entregas y ganancias"'),
    ('"Consulta el encaje, el estado del cobro y el siguiente paso."', '"Consulta el encaje, el estado de los pagos y tu próximo paso."'),
    ('{ label: "Cobro", value: "$3.8K" }', '{ label: "Ganancias", value: "$3.8K" }'),
    ('actions: ["Explorar", "Subir"]', 'actions: ["Explorar", "Aportar"]'),
    ('actions: ["Necesita fondos", "Cola de revisión"]', 'actions: ["Añadir fondos", "Cola de revisión"]'),
    ('"Panel",\n          "Cola de revisión",', '"Dashboard",\n          "Cola de revisión",'),
    ('listos para entregar', 'listos para entrega'),
    ('Prioridad de cola', 'Prioridad de la cola'),
    ('Canal de pagos', 'Pasarela de pagos'),
    ('Sin incidencias de cumplimiento sin resolver', 'Cero incidencias de cumplimiento sin resolver'),
    ('único flujo gobernado', 'único flujo controlado'),
    ('los bucles de revisión, los rieles de pago', 'los ciclos de revisión, las pasarelas de pago'),
    ('envía trabajo rápido y entiende el estado del cobro', 'entrega trabajo rápido y conoce el estado de sus pagos'),
    ('señales de confianza con una superficie operativa clara', 'señales de confianza con una interfaz operativa clara'),
    ('lista para mercado', 'lista para el mercado'),
    ('La superficie pública hace legible', 'La interfaz pública hace legible'),
    ('["Plan de programa", "Equipos colaboradores", "Bucles de QA", "Canales de pago"]', '["Plan del programa", "Equipos de colaboradores", "Ciclos de QA", "Pasarelas de pago"]'),
    ('text="Bucle del mercado"', 'text="Ciclo del marketplace"'),
    ('text="Superficies por rol"', 'text="Interfaces por rol"'),
    ('Tres superficies por rol.', 'Tres interfaces por rol.'),
    ('Un solo bucle operativo.', 'Un único ciclo operativo.'),
    ('Los solicitantes financian. Los colaboradores envían. Los administradores gobiernan.', 'Los solicitantes financian. Los colaboradores entregan. Los administradores controlan.'),
    ('title="Más rendimiento"', 'title="Mayor rendimiento"'),
    ('rieles de pago fiables', 'pasarelas de pago fiables'),
    ('La superficie de mercado está diseñada', 'El marketplace está diseñado'),
    ('guiar mejores envíos.', 'guiar mejores entregas.'),
    ('Aprobaciones de envíos', 'Aprobaciones de entregas'),
    ('gravedad y mantén los incidentes auditables', 'gravedad y mantén los incidentes auditables'), # check if I need this, original says "Prioriza colas por severidad"
    ('Prioriza colas por severidad', 'Prioriza colas por gravedad')
]
replace_in_file("remotion/launch-video.tsx", video_replacements)

print("Replacement script executed.")

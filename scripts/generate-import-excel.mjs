// scripts/generate-import-excel.mjs
//
// Lee el Excel original (estudio_rentabilidad_bicis_COMPLETO.xlsx) y genera
// un Excel listo para importar en la app, con descripciones marketing-grade
// generadas con pools ricos de hooks/beneficios/cierres por familia, en tono
// cercano+técnico (compañero ciclista que sabe).
//
// Variabilidad determinista: hash del nombre como seed, así un mismo producto
// SIEMPRE genera la misma descripción (no aleatorio entre ejecuciones).
//
// Ejecutar: node scripts/generate-import-excel.mjs
// Output: Docs/productos-importar.xlsx

import XLSX from 'xlsx'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const ROOT = join(__dirname, '..')

const INPUT = join(ROOT, 'Docs/estudio_rentabilidad_bicis_COMPLETO.xlsx')
// Si el destino está bloqueado (Excel abierto), guarda en .v2.xlsx
const OUTPUT_PRIMARY = join(ROOT, 'Docs/productos-importar.xlsx')
const OUTPUT_FALLBACK = join(ROOT, 'Docs/productos-importar-v2.xlsx')
let OUTPUT = OUTPUT_PRIMARY

// ─── Hash determinista (FNV-1a 32-bit) para seed ─────────────────────────
function hash32(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = (h * 16777619) >>> 0
  }
  return h
}
function pick(arr, seed) {
  return arr[seed % arr.length]
}

// ─── Marcas y atributos ──────────────────────────────────────────────────
const KNOWN_BRANDS = [
  'GIANT','LIV','MET','SHIMANO','SRAM','SCOTT','TREK','SPECIALIZED','CANNONDALE','MERIDA',
  'ORBEA','BH','CUBE','BIANCHI','PINARELLO','COLNAGO','CERVELO','CASTELLI','ASSOS','GORE',
  'FOX','TROY LEE','POC','BELL','GIRO','KASK','ABUS','LAZER','ALPINESTARS','ENDURA',
  'GOBIK','INVERSE','GIST','MASSI','PROLOGO','PRO','SELLE','FIZIK','BBB','TOPEAK',
  'PARK TOOL','CONTINENTAL','MICHELIN','MAXXIS','VITTORIA','SCHWALBE','HUTCHINSON','MAVIC',
  'DT SWISS','ZIPP','CRANKBROTHERS','TIME','LOOK','WAHOO','GARMIN','POLAR','SUUNTO',
  'CAMPAGNOLO','RACE FACE','CHRIS KING','HOPE','MAGURA','TEKTRO','HAYES','AVID','TRP',
  'KMC','ELITE','TACX','LEZYNE','BLACKBURN','VELOX','WD-40','MUC-OFF','FINISH LINE',
  'PEDROS','HIGH5','POWERBAR','OVERSTIMS','ETIXX','ISOSTAR','VICTORY','BIORACER',
  'SPORTFUL','AGU','LEPOKO','ORHI','ARRI','BUSTI','REV','AGILIS','PANTHER','RINCON',
  'ETXEONDO','SIDI','NORTHWAVE','MAVIC','BONTRAGER','BOMBTRACK','SALSA','SURLY',
]

const COLORS = [
  'NEGRO MATE','BLANCO MATE','GRIS MATE','AZUL NAVY','VERDE OLIVA','AMARILLO FLUOR',
  'NARANJA FLUOR','ROSA PASTEL','BLANCO','NEGRO','GRIS','ROJO','AZUL','VERDE',
  'AMARILLO','BURDEOS','NARANJA','MARRON','ROSA','PLATA','DORADO','WHITE','BLACK','GREY',
]
const NOT_SIZES = ['MM','MIPS','TLR','TL','EVO','PRO','RS','V','GR']

const DISCIPLINES = {
  carretera: ['ROAD','CARRETERA','AERO','TT'],
  montana: ['MTB','MONTAÑA','MOUNTAIN','TRAIL','XC','ENDURO','DH','DOWNHILL'],
  gravel: ['GRAVEL','CYCLOCROSS','CX'],
  urbana: ['URBANO','CITY','COMMUTER'],
  electrica: ['EBIKE','E-BIKE','ELECTRIC','BAFANG','BOSCH','YAMAHA'],
}

const WEIGHT_BY_FAMILY = {
  'Cascos': 320, 'Calzado': 700, 'Ropa': 250, 'Alimentacion': 60,
  'Accesorios y recambios': 200, 'Taller propio': 150,
  'Bicis Montaña': 12000, 'Bicis Carretera': 8000, 'Bicis Gravel': 9000,
  'Bicis': 10000, 'Bicis Urbanas': 13000, 'Bicis Infantiles': 7000,
  'Bicis Eléctricas': 22000, 'Otro tipo bicis': 10000, 'Candados': 600,
  'Alquiler': 0,
}

// ─── Helpers extracción ──────────────────────────────────────────────────
function normalize(s){ return String(s ?? '').trim() }

function detectBrand(name){
  const u = name.toUpperCase()
  for (const b of KNOWN_BRANDS) {
    const re = new RegExp('\\b' + b.replace(/[-/\\^$*+?.()|[\]{}]/g,'\\$&') + '\\b','i')
    if (re.test(u)) return b
  }
  return ''
}
function detectColor(name){
  const u = name.toUpperCase()
  for (const c of COLORS) {
    if (new RegExp('\\b' + c + '\\b','i').test(u)) {
      return c.toLowerCase().replace(/(^|\s)\S/g, m => m.toUpperCase())
    }
  }
  return ''
}
function detectSize(name){
  // Calzado primero (números 28-50)
  const numMatch = name.match(/\b(2[8-9]|[34][0-9]|50)\b/)
  if (numMatch && !/MM|CM/i.test(name.substring(numMatch.index, numMatch.index + 6))) {
    return numMatch[1]
  }
  for (const tk of name.toUpperCase().split(/\s+/)) {
    if (/^(XXXL|XXL|XL|L|M|S|XS|XXS)$/.test(tk) && !NOT_SIZES.includes(tk)) return tk
  }
  return ''
}
function detectDiscipline(name){
  const u = name.toUpperCase()
  for (const [k, words] of Object.entries(DISCIPLINES)) {
    for (const w of words) if (u.includes(w)) return k
  }
  return ''
}
function hasMips(name){ return /\bMIPS\b/i.test(name) }
function hasCarbon(name){ return /\b(CARBON|CARBONO|CARBONE)\b/i.test(name) }
function hasTubeless(name){ return /\b(TLR|TUBELESS|TL)\b/i.test(name) }
function hasElectric(name){ return /\b(E-BIKE|EBIKE|ELECTRIC|BAFANG|BOSCH)\b/i.test(name) }

function slugify(s){
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'')
    .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').substring(0,60)
}
function buildModelGroup(name, size, color){
  let base = name
  if (size) base = base.replace(new RegExp('\\s+' + size + '\\b','gi'),'')
  if (color) base = base.replace(new RegExp('\\s+' + color + '\\b','gi'),'')
  const slug = slugify(base)
  return slug.length >= 3 ? slug : ''
}
function generateSku(name, ean){
  if (ean && String(ean).trim()) return String(ean).trim().substring(0,20)
  return slugify(name).toUpperCase().substring(0,20)
}

// ─── DETECTOR DE SUBCATEGORÍA ────────────────────────────────────────────
// La columna "Familia" del Excel es muy amplia. Detectamos subcategoría
// real desde el nombre para elegir mejor pool de descripción.
function detectSubcategory(name, familia) {
  const u = name.toUpperCase()
  if (familia === 'Cascos') return 'cascos'
  if (familia === 'Calzado') return 'calzado'
  if (familia === 'Alimentacion') return 'nutricion'
  if (familia && familia.startsWith('Bicis')) return 'bicis'
  if (familia === 'Candados') return 'candado'
  if (familia === 'Alquiler') return 'alquiler'
  if (familia === 'Ropa') {
    // Bidones a veces están en "Ropa". Diferenciar.
    if (/BIDON|BIDÓN|BOTELLA/i.test(name)) return 'bidon'
    return 'ropa'
  }
  // Familia genérica "Accesorios y recambios" o "Taller propio": clasificar por nombre.
  if (/BIDON|BIDÓN|BOTELLA/i.test(u)) return 'bidon'
  if (/\b(CINTA MANILLAR|GRIPS?|PUÑOS?)\b/.test(u)) return 'manillar'
  if (/\b(CADENA|CASETE|CASSETTE|PIÑON|PLATO)\b/.test(u)) return 'transmision'
  if (/\b(PASTILLAS?|DISCO\s+\d|MAQUINETA|MORDAZA|FRENO)\b/.test(u)) return 'frenos'
  if (/\b(CAMARA|TUBELESS|TUBULAR|CUBIERTA|NEUMATICO|LLANTA|RUEDA|BUJE)\b/.test(u)) return 'ruedas'
  if (/\b(SILLIN|TIJA|POTENCIA|MANILLAR)\b/.test(u)) return 'contacto'
  if (/\b(LUZ|LIGHT|LINTERNA|FARO|REFLECTANT)\b/.test(u)) return 'luz'
  if (/\b(PEDAL|CALA|CALAS)\b/.test(u)) return 'pedales'
  if (/\b(GPS|CICLOCOMPUTADOR|COMPUTADOR|WAHOO|GARMIN)\b/.test(u)) return 'gps'
  if (/\b(GUANTE|GUANTES|MITON|MANGUITO)\b/.test(u)) return 'guantes'
  if (/\b(GAFA|GAFAS|LENTE)\b/.test(u)) return 'gafas'
  if (/\b(MOCHILA|BOLSA|ALFORJA|PORTABULTO)\b/.test(u)) return 'bolso'
  if (/\b(GEL|BARRITA|RECUPERADOR|ISOTONICO|HIDRATACION)\b/.test(u)) return 'nutricion'
  if (/\b(LIMPIADOR|DESENGRASANTE|LUBRICANTE|GRASA|ACEITE|WD)\b/.test(u)) return 'limpieza'
  if (/\b(ALLEN|LLAVE|HERRAMIENTA|EXTRACTOR|MULTITOOL|TRONCHA)\b/.test(u)) return 'herramienta'
  if (/\b(GUARDABARROS|PORTABIDONES?|PORTABIDÓN|TIMBRE|RETROVISOR|SOPORTE|MOVIL)\b/.test(u)) return 'accesorio'
  return 'generico'
}

// ─── POOLS DE COPY (tono cercano + técnico) ─────────────────────────────
// Cada subcategoría tiene arrays con varias opciones. El seed determinista
// elige cuál usar por producto.

const POOLS = {
  cascos: {
    openShort: [
      'Cabeza protegida, salida tranquila.',
      'El casco que te olvidas que llevas.',
      'Ligereza y seguridad en el mismo casco.',
      'Para que cada salida vuelva a casa.',
      'Ventilación, ajuste y la confianza de un buen casco.',
      'La diferencia entre llevar casco y querer llevarlo.',
    ],
    openLong: [
      'Hay cascos que aprietan, ahogan, pesan. Y luego están los buenos.',
      'Cuando el casco encaja bien, dejas de pensar en él.',
      'Saber que vas seguro sin sentir el peso encima.',
      'Lo que necesitas: protección certificada, ventilación real y un ajuste que aguante kilómetros.',
      'No basta con cumplir norma. Un buen casco tiene que ser cómodo durante horas.',
    ],
    benefit: [
      'Carcasa con buena ventilación para que la cabeza respire incluso en subidas largas.',
      'Sistema de ajuste rápido que se afina con una sola mano.',
      'Almohadillas removibles y lavables — sudor del verano, controlado.',
      'Visera regulable que se quita o se queda según la disciplina.',
      'Estructura que pesa lo justo, sin caer en lo frágil.',
      'Acabados pensados para quien pasa horas pedaleando.',
    ],
    mips: [
      'Y MIPS dentro: protección extra contra impactos rotacionales que esperamos no necesitar nunca.',
      'MIPS integrado para reducir las fuerzas rotacionales que tu cabeza no nota — pero agradece.',
      'Incorpora tecnología MIPS: una capa interior que se desplaza unos milímetros en caso de caída oblicua. La diferencia entre un golpe y un susto.',
    ],
    close: [
      'Pásate por la tienda a probártelo: el ajuste de talla importa más de lo que parece.',
      'Cumple normativa europea CE EN 1078.',
      'Si dudas entre dos tallas, ven a la tienda y lo decidimos en 2 minutos.',
    ],
  },

  calzado: {
    openShort: [
      'Pisada firme, watts que llegan al pedal.',
      'Suela rígida, cada pedalada cuenta.',
      'Para los que sienten la diferencia en la transferencia.',
      'Zapatillas que no se quedan a medias en la subida.',
      'Comodidad y rendimiento — sí, se puede tener todo.',
    ],
    openLong: [
      'Hay un momento en cada salida larga en el que las zapatillas se hacen notar. Estas no.',
      'La transferencia de potencia no es marketing: la sientes en cada repechón.',
      'Una buena zapatilla aguanta lo que tú pongas. Estas lo aguantan.',
      'Lo que pides a unas zapatillas: rigidez, cierre que no afloja, y que no te aprieten en hora 4.',
    ],
    benefit: [
      'Suela rígida que devuelve cada watt sin pedir nada a cambio.',
      'Cierre ajustable de precisión: aprieta justo donde necesitas, ni más ni menos.',
      'Refuerzos en zonas de fricción para que duren temporadas, no semanas.',
      'Materiales transpirables, sudor que se va sin convertirse en problema.',
      'Compatible con calas SPD y SPD-SL — confirma cuál es la tuya antes de comprar.',
      'Plantilla cómoda incluso después de 80 km.',
    ],
    close: [
      'Si dudas con el número, prueba talla en tienda: las marcas tallan distinto.',
      'Pruébatelas en tienda: el ajuste correcto te ahorra ampollas y horas de tienda.',
      'Vienen sin calas; las compras aparte según tu pedal.',
    ],
  },

  ropa: {
    openShort: [
      'Lo que llevas puesto importa.',
      'Tejido técnico que sabe a kilómetros.',
      'Cuando la ropa acompaña, los kilómetros pasan.',
      'Equipación que no se nota — en el buen sentido.',
      'Para que el equipo no sea la excusa.',
    ],
    openLong: [
      'Tienen razón los que dicen que la diferencia entre disfrutar la salida y sufrirla está en lo que llevas puesto.',
      'No hace falta ir lleno de logos: lo que importa es que el tejido haga su trabajo.',
      'Algunas prendas pasan desapercibidas en la tienda y resultan imprescindibles en ruta.',
      'Llevar la ropa adecuada se nota a los 30 km, no a los 3.',
    ],
    benefit: [
      'Tejido transpirable de secado rápido — el sudor se evapora antes de incomodar.',
      'Costuras planas que no rozan ni en salidas largas.',
      'Cortes ergonómicos pensados para la posición sobre la bici, no para estar de pie.',
      'Tratamiento anti-olor que aguanta más de un lavado.',
      'Bolsillos donde los necesitas: a la espalda, accesibles con guantes puestos.',
    ],
    close: [
      'Lavar a máquina en frío, sin suavizante: prolongas la vida útil del tejido técnico.',
      'Si vas entre tallas, mejor la justa: estas prendas trabajan ajustadas.',
      'Pruébatelo en tienda — la talla técnica no es la del día a día.',
    ],
  },

  bidon: {
    openShort: [
      'El compañero silencioso de toda salida larga.',
      'Bidón que entra y sale del portabidón sin pelearte con él.',
      'Hidratarse sin frenar.',
      'El detalle que aguanta más kilómetros que la propia bici.',
      'Un buen bidón se nota cada vez que tienes sed.',
    ],
    openLong: [
      'Lo das por hecho hasta que te toca uno que gotea, huele o se queda atascado en el portabidón.',
      'Un bidón malo te arruina la salida; uno bueno desaparece.',
      'Si lo vas a usar todos los días, que sea uno bueno.',
    ],
    benefit: [
      'Tapón con sistema anti-goteo: bebes, sueltas, y el bidón no chorrea.',
      'Material flexible que se aprieta para sacar agua sin esfuerzo.',
      'Boca ancha para llenar sin embudo y limpiar sin trucos.',
      'Apto para lavavajillas: la limpieza no es un problema.',
      'Capacidad estándar compatible con cualquier portabidón.',
    ],
    close: [
      'Lavar tras cada uso, evita que coja olor.',
      'Llévate dos: uno con agua, otro con bebida isotónica.',
    ],
  },

  manillar: {
    openShort: [
      'El primer punto de contacto: cuida tu agarre.',
      'Manos cómodas, salida cómoda.',
      'Detalles que se notan a las 2 horas.',
      'Lo que sujetas durante toda la salida merece atención.',
      'Más vibraciones absorbidas, menos manos cansadas.',
    ],
    openLong: [
      'Las manos son lo primero que se cansa en una salida larga. Por eso el contacto importa.',
      'Si llegas a casa con los dedos dormidos, no es tu mano: es el manillar.',
      'Un buen agarre cambia la sensación completa de la bici.',
    ],
    benefit: [
      'Densidad pensada para amortiguar sin perder respuesta.',
      'Adherencia que aguanta sudor, lluvia y guantes con polvo.',
      'Acabado duradero — sigue cómodo después de muchas temporadas.',
      'Espesor justo: ni dedos hinchados ni agarre flojo.',
    ],
    close: [
      'Instalación sencilla en taller: si quieres, te lo montamos en el momento.',
      'Verifica diámetro de manillar antes de comprar (estándar 22.2mm en MTB, 23.8mm en carretera).',
    ],
  },

  transmision: {
    openShort: [
      'La pieza que hace que el resto funcione.',
      'Cambios limpios, pedaleo silencioso.',
      'Una buena transmisión se siente, no se oye.',
      'Componentes que pueden hacer que tu bici vaya como nueva.',
      'Más kilómetros entre revisiones.',
    ],
    openLong: [
      'Cuando la cadena hace clic-clic, no es tu técnica: es el desgaste.',
      'Una transmisión bien cuidada y de calidad cambia la experiencia entera de la bici.',
      'Lo que separa un cambio limpio de uno que ralla los nervios suele ser el componente, no el rider.',
    ],
    benefit: [
      'Aleación y tratamiento que aguantan kilómetros de barro y lluvia.',
      'Engrane preciso compatible con grupos estándar (verifica antes de instalar).',
      'Recambio original o compatible de alta calidad.',
      'Durabilidad por encima de la media — menos visitas al taller.',
    ],
    close: [
      'Si nunca has cambiado este componente, mejor en taller — un montaje correcto evita problemas mayores.',
      'Confirma compatibilidad con tu grupo (Shimano/SRAM/Campagnolo) antes de comprar.',
      'En tienda te asesoramos sobre desgaste y momento óptimo de cambio.',
    ],
  },

  frenos: {
    openShort: [
      'Frenado preciso, confianza en cada bajada.',
      'Donde no se puede recortar: frenos.',
      'Lo que separa un susto de un control.',
      'Para frenar cuando hace falta y como hace falta.',
      'La diferencia entre llegar a tiempo o no llegar.',
    ],
    openLong: [
      'Los frenos no son donde se ahorra. Es donde se invierte.',
      'Frenar bien no va de potencia bruta: va de modulación y control.',
      'En cada bajada técnica agradeces haberte tomado en serio el freno.',
    ],
    benefit: [
      'Modulación progresiva: doses la frenada en lugar de bloquear.',
      'Compatibilidad amplia con sistemas estándar de freno hidráulico/mecánico.',
      'Resistencia al fade en bajadas largas.',
      'Material pensado para durar pese a barro y agua.',
    ],
    close: [
      'Recomendado instalación en taller: el sangrado y purga marcan la diferencia.',
      'Verifica compatibilidad exacta con tu sistema antes de comprar.',
      'Pásate por la tienda si tienes dudas — un freno mal instalado falla cuando más se necesita.',
    ],
  },

  ruedas: {
    openShort: [
      'El rodaje cambia la bici.',
      'Donde se gana o se pierde tracción.',
      'Lo que toca el suelo hace toda la diferencia.',
      'Salir con confianza pase lo que pase.',
      'Componentes pensados para rodar mucho.',
    ],
    openLong: [
      'La rueda es lo que conecta tu bici con la realidad. Y la realidad cambia mucho según el componente.',
      'Una buena cubierta puede convertir una bici nerviosa en una bici plantada.',
      'No hay nada peor que un pinchazo a 20 km de casa. Por eso esto importa.',
    ],
    benefit: [
      'Construcción robusta pensada para muchos kilómetros.',
      'Compatibilidad con sistemas estándar — verifica medida antes de comprar.',
      'Compuesto pensado para mejor agarre o mayor durabilidad según uso.',
      'Acabado profesional para uso intensivo o competición ligera.',
    ],
    close: [
      'Si vas a tubeless por primera vez, pásate por taller — montaje hidráulico recomendado.',
      'Verifica medida exacta (700c/650b/29"/27.5"/26") y anchura antes de pedir.',
      'En tienda te ayudamos a elegir según uso (XC, trail, enduro, carretera).',
    ],
  },

  contacto: {
    openShort: [
      'Los puntos de contacto definen la salida.',
      'Comodidad que se nota cuando llevas 3 horas encima.',
      'Detalles que cambian la postura entera.',
      'Lo que tocas durante toda la ruta importa.',
      'Mejor postura, menos fatiga.',
    ],
    openLong: [
      'Las 3 horas de bici se hacen 5 si el sillín no es el tuyo.',
      'Tu postura sobre la bici la deciden tres puntos: sillín, manillar y pedales.',
      'No hay sillín universal — el bueno es el que se adapta a TU anatomía.',
    ],
    benefit: [
      'Acolchado pensado para distribuir presión, no solo para parecer cómodo.',
      'Material resistente al desgaste y al sudor.',
      'Diámetro y montaje estándar — verifica medidas antes de instalar.',
      'Diseño ergonómico testado en uso real, no solo en showroom.',
    ],
    close: [
      'En tienda te asesoramos sobre tipo de sillín según anchura de isquiones y disciplina.',
      'Un test de sillín en tienda evita comprar 3 antes de dar con el correcto.',
      'Montaje rápido en taller si lo necesitas.',
    ],
  },

  luz: {
    openShort: [
      'Ver y ser visto. Sin compromisos.',
      'Iluminación que aguanta cuando hace falta.',
      'Salir cuando ya no hay sol.',
      'La diferencia entre ir tranquilo y mirar atrás.',
      'Luz que ven los coches a tiempo.',
    ],
    openLong: [
      'Una luz buena no es la más potente: es la que se ve y dura toda la salida.',
      'Conducir de noche o entre coches sin luz es jugársela. No hace falta.',
      'En invierno se sale con luz aunque sea las 5 de la tarde. Mejor llevarla.',
    ],
    benefit: [
      'Autonomía que cubre salidas reales, no solo el papel.',
      'Carga USB rápida — sin pilas que comprar.',
      'Sujeción firme que no se mueve con vibración.',
      'Modos varios: constante, intermitente, baja. Eliges según necesidad.',
    ],
    close: [
      'Recuerda llevarla cargada — sale más a cuenta que reemplazarla por una nueva.',
      'Verifica que entra en tu manillar (algunas no caben en aero).',
    ],
  },

  pedales: {
    openShort: [
      'El motor empieza en el pedal.',
      'Conexión firme con la bici.',
      'Calidad que se siente en cada pedalada.',
      'Donde tu fuerza se convierte en velocidad.',
      'Componente pequeño, diferencia grande.',
    ],
    openLong: [
      'El pedal es donde la fuerza se transforma en avance. Cuanto mejor el componente, menos pérdidas.',
      'Si nunca has llevado automáticos, prepara una caída controlada en pista de aprendizaje — luego no vuelves a los planos.',
    ],
    benefit: [
      'Sistema de enganche/desenganche fluido y ajustable.',
      'Rodamientos sellados que aguantan condiciones reales.',
      'Compatible con calas estándar (verifica modelo concreto).',
      'Peso optimizado sin comprometer durabilidad.',
    ],
    close: [
      'Las calas suelen venir aparte — confirma al comprar.',
      'En tienda te explicamos cómo regular tensión de desenganche.',
    ],
  },

  gps: {
    openShort: [
      'Datos que te ayudan a mejorar.',
      'Rutas, métricas y un mapa que no falla.',
      'Salir sabiendo, llegar sabiendo más.',
      'El compañero silencioso del entrenamiento.',
      'Donde el entreno y la aventura se cruzan.',
    ],
    openLong: [
      'No es solo el GPS: es saber dónde estás, cuánto te queda, y qué tal vas comparado contigo mismo.',
      'Llevar la ruta planificada en pantalla cambia lo que te atreves a hacer.',
    ],
    benefit: [
      'Autonomía suficiente para rutas largas reales.',
      'Pantalla legible bajo sol directo.',
      'Conectividad con sensores (potencia, cadencia, pulso) si los tienes.',
      'Sincronización automática con Strava, Komoot y otros.',
    ],
    close: [
      'En tienda te ayudamos a configurarlo y emparejar sensores si lo necesitas.',
      'Verifica compatibilidad con tus apps habituales antes de comprar.',
    ],
  },

  guantes: {
    openShort: [
      'Manos protegidas, agarre seguro.',
      'Lo primero que tocas al subirte a la bici.',
      'Detalles que se notan en la primera bajada.',
      'Comodidad que aguanta toda la ruta.',
      'Buen agarre, sea sudor, lluvia o frío.',
    ],
    openLong: [
      'Las manos son zona crítica — frío, vibraciones, golpes. Llevarlas bien protegidas no es un lujo.',
      'Si has tenido una caída, sabes por qué los guantes existen.',
    ],
    benefit: [
      'Palma con material antideslizante que mantiene el agarre.',
      'Acolchado en zonas clave para amortiguar vibraciones.',
      'Tejido transpirable en el dorso, sin manos sudadas.',
      'Refuerzo en zonas de contacto en caso de caída.',
    ],
    close: [
      'Verifica talla en tienda: los guantes ajustados sin apretar funcionan mejor.',
      'Lavables a mano — los técnicos prefieren no pasar por máquina.',
    ],
  },

  gafas: {
    openShort: [
      'Ojos protegidos, mirada clara.',
      'Sol, polvo, viento — barrera limpia.',
      'Ver bien es seguridad.',
      'Detalles para llegar enteros.',
      'Equipación que no se piensa, se nota.',
    ],
    openLong: [
      'Llevar las gafas correctas evita más caídas de las que uno cree: ver bien es la primera defensa.',
      'En MTB un palo en el ojo es la diferencia entre seguir o volver a casa en coche.',
    ],
    benefit: [
      'Lente que filtra UV y mantiene buen contraste en sombra.',
      'Sujeción que no se mueve aunque bajes técnico.',
      'Patillas y nariz adaptables — no resbalan con sudor.',
      'Ventilación pensada para evitar empañamientos.',
    ],
    close: [
      'Si las quieres polivalentes, mejor lente fotocromática (cambia según luz).',
      'Pruébatelas en tienda — el ajuste evita movimientos en bache.',
    ],
  },

  bolso: {
    openShort: [
      'Llevar lo necesario sin pelearte con la mochila.',
      'Espacio justo, sin sobras.',
      'Compañero de aventura, sea día o semana.',
      'Lo que cargas también importa.',
      'Equipación que aguanta lluvia y kilómetros.',
    ],
    openLong: [
      'Cuando empiezas a hacer rutas largas, descubres que la mochila o alforja no son detalle: son herramienta.',
      'Una buena bolsa cambia lo que puedes salir a buscar.',
    ],
    benefit: [
      'Material resistente al agua para que no temas la lluvia.',
      'Sistema de anclaje seguro que no se mueve.',
      'Bolsillos pensados para cosas concretas: documentación, herramienta, comida.',
      'Volumen útil sin estorbar al pedalear.',
    ],
    close: [
      'Si vas a usarla a diario, verifica que entra en tu portabultos o cuadro.',
    ],
  },

  nutricion: {
    openShort: [
      'Combustible que llega cuando hace falta.',
      'Sin energía no hay bici larga.',
      'Energía rápida, sin esperar.',
      'Lo que separa la pájara del kilómetro 100.',
      'Suplemento pensado para entrenar y competir.',
    ],
    openLong: [
      'A los 80 km el cuerpo te avisa. Si no tienes nada que darle, la salida se acaba ahí.',
      'No hace falta llenarse de productos — basta con uno bueno y bien tomado.',
      'La nutrición deportiva no es un capricho: es lo que te permite acabar lo que empezaste.',
    ],
    benefit: [
      'Carbohidratos de asimilación rápida pensados para esfuerzo.',
      'Electrolitos clave para mantener hidratación bajo calor.',
      'Sabor pensado para tomar fácil en plena ruta.',
      'Formato cómodo de transportar y abrir con guantes.',
    ],
    close: [
      'Pruébalo en entreno antes de competir — los estómagos reaccionan distinto.',
      'Conservar en lugar fresco y seco. Revisa caducidad.',
    ],
  },

  limpieza: {
    openShort: [
      'Bici limpia, bici que dura.',
      'Mantenimiento que se nota en cada salida.',
      'Más kilómetros entre revisiones.',
      'El cuidado básico que evita facturas.',
      'Producto que cuida componentes.',
    ],
    openLong: [
      'La diferencia entre una bici que dura 3 años y una que dura 10 está en cómo se mantiene.',
      'Limpieza no es estética — es prolongar la vida de cada componente.',
    ],
    benefit: [
      'Fórmula específica para componentes de bici sin dañar superficies.',
      'Aplicación sencilla, resultado rápido.',
      'Eficaz contra grasa, barro y residuos de carretera.',
      'Compatible con materiales habituales en ciclismo.',
    ],
    close: [
      'En tienda te explicamos rutina de limpieza completa si nunca lo has hecho.',
      'Aplicar con bici limpia y seca para mejor resultado.',
    ],
  },

  herramienta: {
    openShort: [
      'Lo que cargas para no quedarte tirado.',
      'Resolver in situ vale más que llegar tarde.',
      'Herramienta que aguanta uso real.',
      'Calidad que se nota cuando hace falta.',
      'Componente de taller hecho para durar.',
    ],
    openLong: [
      'La herramienta barata se rompe el día que la necesitas. La buena dura años.',
      'Una buena herramienta en la mochila puede salvar la salida.',
    ],
    benefit: [
      'Acero tratado para uso intensivo.',
      'Diseño ergonómico para apretar/soltar con menos esfuerzo.',
      'Tamaño compacto, fácil de transportar.',
      'Compatible con estándares habituales en ciclismo.',
    ],
    close: [
      'Si no la has usado antes, mejor traer la bici al taller la primera vez.',
    ],
  },

  candado: {
    openShort: [
      'Tranquilidad cuando dejas la bici.',
      'No vale cualquier candado — vale uno bueno.',
      'Protección que se nota.',
      'Para que la bici siga ahí cuando vuelvas.',
      'La pieza más importante que casi nadie valora hasta que es tarde.',
    ],
    openLong: [
      'Un candado barato es una invitación. Uno bueno es disuasión real.',
      'En ciudad o en aparcamiento, la diferencia entre llevarte la bici a casa o no la pone el candado.',
    ],
    benefit: [
      'Material resistente a corte y palanca.',
      'Llave de seguridad con sistema anti-copia.',
      'Tamaño que pasa por cuadro y rueda a un punto fijo.',
      'Peso optimizado: protección sin cargar de más.',
    ],
    close: [
      'Combina con segundo candado (cable + U-lock) para máxima protección.',
      'Anota número de serie y guarda llave de repuesto.',
    ],
  },

  accesorio: {
    openShort: [
      'Detalles que mejoran la bici.',
      'Pequeño accesorio, gran diferencia.',
      'Lo que falta para que esté completa.',
      'Componente útil que se nota en uso diario.',
      'Calidad para piezas que tocas siempre.',
    ],
    openLong: [
      'No es la pieza estrella, pero la usas todos los días.',
      'Los accesorios bien elegidos son los que cambian el día a día sin que te des cuenta.',
    ],
    benefit: [
      'Material y acabado que aguantan uso continuo.',
      'Compatible con estándares habituales (verifica antes de comprar).',
      'Instalación sencilla.',
      'Diseño funcional sin elementos innecesarios.',
    ],
    close: [
      'Verifica compatibilidad con tu cuadro/manillar antes de comprar.',
      'Si tienes dudas, pásate por la tienda y lo vemos.',
    ],
  },

  generico: {
    openShort: [
      'Componente de calidad pensado para uso real.',
      'Producto disponible en nuestra tienda.',
      'Recambio o accesorio para tu bicicleta.',
      'Calidad que se nota en uso.',
      'Disponible en tienda — consulta detalles.',
    ],
    openLong: [
      'Producto pensado para ciclistas que valoran calidad y durabilidad.',
      'Componente disponible en nuestra tienda con asesoramiento incluido.',
    ],
    benefit: [
      'Calidad pensada para uso continuado.',
      'Compatibilidad con estándares habituales en ciclismo.',
      'Diseñado para resistir condiciones reales.',
    ],
    close: [
      'Si tienes dudas sobre compatibilidad, contacta con nosotros.',
      'Pásate por la tienda para más detalle o presupuesto.',
    ],
  },

  bicis: {
    openShort: [
      'Tu próxima compañera de ruta.',
      'Bicicleta disponible para venta presencial.',
      'Lo que llevas debajo importa.',
      'Una bici no se compra: se elige.',
      'Para verla, probarla y decidir bien.',
    ],
    openLong: [
      'Una bici es una decisión que va con uno durante años. Mejor verla en persona.',
      'Llamamos para concretar talla, geometría y prueba previa — la bici correcta cambia la experiencia entera.',
    ],
    benefit: [
      'Disponible en tienda con asesoramiento personalizado de talla y geometría.',
      'Prueba previa para asegurarte de que es la tuya.',
      'Servicio postventa y mantenimiento incluido en tienda.',
      'Garantía de fabricante completa.',
    ],
    close: [
      'Pásate por la tienda o llámanos para concretar disponibilidad y precio actualizado.',
      'Probarla antes de comprarla es siempre la mejor inversión.',
    ],
  },

  alquiler: {
    openShort: [
      'Bicicletas disponibles para alquiler.',
      'Salir a rodar sin comprometerte.',
      'Probar antes de decidir.',
      'Para visitantes o curiosos.',
    ],
    openLong: [
      'Servicio de alquiler para conocer la zona o probar disciplina antes de comprar bici.',
    ],
    benefit: [
      'Mantenimiento al día.',
      'Casco incluido si lo necesitas.',
      'Rutas recomendadas en tienda.',
    ],
    close: [
      'Reserva con antelación recomendable, especialmente en fin de semana.',
    ],
  },
}

// ─── Constructores de descripción ────────────────────────────────────────

function describeShort(name, family, brand, color, size, subcat, seed){
  const pool = POOLS[subcat] || POOLS.generico
  const hook = pick(pool.openShort, seed)
  // Añadir contexto: marca/talla/color si los hay
  const ctx = []
  if (brand && !name.toUpperCase().includes(brand)) ctx.push(brand)
  if (size) ctx.push('talla ' + size)
  if (color) ctx.push(color.toLowerCase())
  const ctxStr = ctx.length ? ' ' + ctx.join(' · ') + '.' : ''
  const result = (hook + ctxStr).substring(0, 160)
  return result
}

function describeLong(name, family, brand, color, size, subcat, discipline, mips, seed){
  const pool = POOLS[subcat] || POOLS.generico
  const parts = []
  parts.push(pick(pool.openLong, seed))
  // 2 benefits distintos
  const benefits = pool.benefit
  const idx1 = seed % benefits.length
  const idx2 = (seed >> 3) % benefits.length
  parts.push(benefits[idx1])
  if (idx2 !== idx1) parts.push(benefits[idx2])
  // Touch contextual (talla/color/marca/disciplina si aplica)
  const touches = []
  if (brand && subcat !== 'generico' && subcat !== 'bicis') {
    touches.push(`Marca ${brand}, referencia en su categoría.`)
  }
  if (size && (subcat === 'cascos' || subcat === 'calzado' || subcat === 'ropa' || subcat === 'guantes')) {
    touches.push(`Talla ${size}.`)
  }
  if (color && (subcat === 'cascos' || subcat === 'calzado' || subcat === 'ropa')) {
    touches.push(`Acabado en ${color.toLowerCase()}.`)
  }
  if (subcat === 'cascos' && mips) {
    touches.push(pick(pool.mips, seed))
  }
  if (discipline && subcat === 'bicis') {
    const map = {
      carretera: 'Pensada para carretera y kilometradas largas.',
      montana: 'Para BTT, sendero y aventura fuera de asfalto.',
      gravel: 'Versátil para gravel: mezcla de carretera, pista y aventura.',
      urbana: 'Urbana para ciudad y desplazamiento diario.',
      electrica: 'Asistencia eléctrica para más rango o terrenos exigentes.',
    }
    if (map[discipline]) touches.push(map[discipline])
  }
  if (touches.length) parts.push(touches.join(' '))
  // Closer
  parts.push(pick(pool.close, seed))
  return parts.filter(Boolean).join(' ')
}

// ─── Main ────────────────────────────────────────────────────────────────

function main(){
  console.log('▶ Leyendo Excel original:', INPUT)
  const wb = XLSX.readFile(INPUT)
  const ws = wb.Sheets['Catálogo']
  if (!ws) throw new Error('No se encuentra la hoja "Catálogo".')

  const rawRows = XLSX.utils.sheet_to_json(ws, { defval: null, header: 1 })
  const dataRows = rawRows.slice(3).filter(r => r[0] && String(r[0]).trim() !== '')
  console.log('▶ Filas de datos:', dataRows.length)

  const stats = { sizes: 0, brands: 0, colors: 0, groups: new Set(), subcats: {} }

  const out = dataRows.map(r => {
    const name = normalize(r[0])
    const tipo = normalize(r[1])
    const familia = normalize(r[2])
    const pvp = r[3]
    const coste = r[4]
    const stock = r[12]
    const ean = r[13] ? String(r[13]).replace(/\.0$/,'') : ''

    const brand = detectBrand(name)
    const color = detectColor(name)
    const size = detectSize(name)
    const discipline = detectDiscipline(name)
    const mips = hasMips(name)
    const subcat = detectSubcategory(name, familia)
    const modelGroup = size ? buildModelGroup(name, size, color) : ''

    if (brand) stats.brands++
    if (color) stats.colors++
    if (size) stats.sizes++
    if (modelGroup) stats.groups.add(modelGroup)
    stats.subcats[subcat] = (stats.subcats[subcat] || 0) + 1

    const seed = hash32(name)
    const descShort = describeShort(name, familia, brand, color, size, subcat, seed)
    const descLong = describeLong(name, familia, brand, color, size, subcat, discipline, mips, seed)

    return {
      'Nombre': name,
      'Familia': familia,
      'Tipo': tipo,
      'Marca': brand,
      'Descripcion Corta': descShort,
      'Descripcion Completa': descLong,
      'Referencia (SKU)': generateSku(name, ean),
      'EAN': ean,
      'PVP c/IVA': pvp ?? 0,
      'Coste s/IVA': coste ?? 0,
      'Stock': stock ?? 0,
      'Talla': size,
      'Grupo Modelo': modelGroup,
      'Color': color,
      'Peso (g)': WEIGHT_BY_FAMILY[familia] ?? 200,
      'Activo': tipo === 'Tienda' && familia !== 'Alquiler' ? 'SI' : 'NO',
      'Comprar Online': 'NO',
    }
  })

  const outWs = XLSX.utils.json_to_sheet(out)
  outWs['!cols'] = [
    {wch:50},{wch:22},{wch:10},{wch:14},{wch:60},{wch:90},{wch:22},{wch:16},
    {wch:10},{wch:10},{wch:8},{wch:8},{wch:30},{wch:14},{wch:10},{wch:8},{wch:14},
  ]

  const outWb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(outWb, outWs, 'Productos')

  const readme = XLSX.utils.aoa_to_sheet([
    ['IMPORTACIÓN PRODUCTOS — DC Bikes Cantabria'],
    [],
    ['Descripciones generadas con pools por subcategoría (cascos, calzado, bidones,'],
    ['transmisión, frenos, ruedas, luz, GPS, guantes, gafas, nutrición, limpieza,'],
    ['herramienta, candados, bicis, etc.) con tono cercano+técnico.'],
    [],
    ['La selección de hook/beneficio/cierre es DETERMINISTA por nombre (hash FNV-1a):'],
    ['un mismo producto siempre genera la misma descripción entre ejecuciones.'],
    [],
    ['Revisa antes de importar:'],
    ['• Productos genéricos placeholder ("X (generico)")'],
    ['• Bicis (la descripción asume venta presencial)'],
    ['• Productos críticos para venta online'],
    [],
    ['Columnas → significado:'],
    ['Nombre, Familia, Tipo (Tienda/Taller), Marca extraída, Descripciones, SKU,'],
    ['EAN, PVP c/IVA, Coste s/IVA, Stock, Talla, Grupo Modelo, Color, Peso (g),'],
    ['Activo (SI/NO), Comprar Online (NO por defecto).'],
  ])
  readme['!cols'] = [{wch:90}]
  XLSX.utils.book_append_sheet(outWb, readme, 'README')

  console.log('▶ Escribiendo:', OUTPUT)
  try {
    XLSX.writeFile(outWb, OUTPUT)
  } catch (e) {
    if (e && (e.code === 'EBUSY' || /busy|locked/i.test(String(e.message)))) {
      console.warn('  ⚠ Archivo primario bloqueado (¿Excel abierto?). Guardando en fallback.')
      OUTPUT = OUTPUT_FALLBACK
      XLSX.writeFile(outWb, OUTPUT)
    } else {
      throw e
    }
  }

  console.log('\n✓ Listo')
  console.log('  Productos:', out.length)
  console.log('  Marcas:', stats.brands, '· Colores:', stats.colors, '· Tallas:', stats.sizes)
  console.log('  Grupos modelo:', stats.groups.size)
  console.log('  Activos:', out.filter(p => p.Activo === 'SI').length)
  console.log('  Subcategorías detectadas:')
  for (const [k, n] of Object.entries(stats.subcats).sort((a,b) => b[1]-a[1])) {
    console.log(`    ${k}: ${n}`)
  }
}

main()

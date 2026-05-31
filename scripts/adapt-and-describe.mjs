// scripts/adapt-and-describe.mjs
//
// Adapta Docs/Productos_importar_Def.xlsx al formato que espera el importador
// del admin (ExcelImporter.tsx) y genera descripción corta + completa VERAZ
// (sin inventar especificaciones) para los productos con stock > 0.
//
// - Incluye las 1226 filas (catálogo completo) para importar de una vez.
// - Descripciones solo en los productos con stock > 0 (decisión del titular).
// - Activo = "No" en todas las filas (nada visible/comprable hasta decidir).
// - Salida: Docs/Productos_importar_ADAPTADO.xlsx (hoja "Productos").
//
// Uso:  node scripts/adapt-and-describe.mjs

import XLSX from 'xlsx'

const SRC = 'Docs/Productos_importar_Def.xlsx'
const OUT = 'Docs/Productos_importar_ADAPTADO.xlsx'

// ── Utilidades ──────────────────────────────────────────────────────────────

// Hash determinista para elegir variantes de frase de forma estable por producto.
function hash(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h)
}
function pick(arr, seed) {
  return arr[seed % arr.length]
}

// Limpia el nombre para usarlo en prosa (espacios, mayúsculas excesivas).
function humanize(raw) {
  let s = String(raw).replace(/\s+/g, ' ').trim()
  // Si está TODO EN MAYÚSCULAS, pasar a Capitalización tipo título suave.
  const letters = s.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, '')
  const upper = letters.replace(/[^A-ZÁÉÍÓÚÜÑ]/g, '')
  if (letters.length > 0 && upper.length / letters.length > 0.8) {
    s = s.toLowerCase().replace(/\b([a-záéíóúüñ])/g, (m, c) => c.toUpperCase())
  }
  return s
}

// ── Detección de marca ────────────────────────────────────────────────────
const BRANDS = [
  ['GIANT', 'Giant'], ['LIV', 'Liv'], ['MONTY', 'Monty'], ['STEVENS', 'Stevens'],
  ['LAZER', 'Lazer'], ['BRYTON', 'Bryton'], ['SHIMANO', 'Shimano'], ['SRAM', 'SRAM'],
  ['MICHELIN', 'Michelin'], ['CONTINENTAL', 'Continental'], ['MAXXIS', 'Maxxis'],
  ['VITTORIA', 'Vittoria'], ['HUTCHINSON', 'Hutchinson'], ['SCHWALBE', 'Schwalbe'],
  ['ETXEONDO', 'Etxeondo'], ['POWERBAR', 'PowerBar'], ['SPIUK', 'Spiuk'],
  ['MASSI', 'Massi'], ['KMC', 'KMC'], ['FINISH LINE', 'Finish Line'],
  ['ELITE', 'Elite'], ['TACX', 'Tacx'], ['SELLE', 'Selle'], ['FIZIK', "fi'zi:k"],
  ['BBB', 'BBB'], ['MAGURA', 'Magura'], ['ROTOR', 'Rotor'], ['FSA', 'FSA'],
  ['DT SWISS', 'DT Swiss'], ['MAVIC', 'Mavic'],
]
function detectBrand(up) {
  for (const [needle, label] of BRANDS) {
    if (up.includes(needle)) return label
  }
  return null
}

// ── Detección de características (truthful: solo si el nombre lo indica) ─────
function detectFeatures(up) {
  const f = []
  if (/\bMIPS\b/.test(up)) f.push('sistema de protección anti-rotacional MIPS')
  if (/\bDI2\b/.test(up)) f.push('cambio electrónico Shimano Di2')
  if (/\bAXS\b/.test(up)) f.push('grupo electrónico SRAM AXS')
  if (/CARBON|CARBONO/.test(up)) f.push('construcción en fibra de carbono')
  if (/TUBELESS|TUBLESS|\bTLR\b/.test(up)) f.push('compatibilidad tubeless')
  if (/PRIMALOFT/.test(up)) f.push('aislamiento térmico PrimaLoft')
  if (/GORE[\s-]?TEX/.test(up)) f.push('membrana impermeable Gore-Tex')
  if (/\bE\+|E-BIKE|ELECTRIC/.test(up)) f.push('asistencia eléctrica')
  if (/\b29\b|29ER|29"/.test(up)) f.push('ruedas de 29 pulgadas')
  else if (/27[.,]5|650B/.test(up)) f.push('ruedas de 27,5 pulgadas')
  else if (/\b26\b|26"/.test(up)) f.push('ruedas de 26 pulgadas')
  return f
}

// Color (solo nombres de color frecuentes en el catálogo).
// Mapeo a la forma masculina canónica ("color negro", "acabado blanco") para
// evitar problemas de concordancia con los sustantivos "color"/"acabado".
const COLORS = {
  NEGRO: 'negro', NEGRA: 'negro', BLANCO: 'blanco', BLANCA: 'blanco', ROJO: 'rojo',
  ROJA: 'rojo', AZUL: 'azul', VERDE: 'verde', GRIS: 'gris', AMARILLO: 'amarillo',
  AMARILLA: 'amarillo', NARANJA: 'naranja', PLATA: 'plata', DORADO: 'dorado',
  DORADA: 'dorado', ROSA: 'rosa', MOSTAZA: 'mostaza', PETROLEO: 'petróleo',
  MARRON: 'marrón', MORADO: 'morado', MORADA: 'morado', CELESTE: 'celeste',
  FUCSIA: 'fucsia', BEIGE: 'beige',
}
function detectColor(up) {
  for (const k of Object.keys(COLORS)) {
    if (new RegExp('\\b' + k + '\\b').test(up)) return COLORS[k]
  }
  return null
}

// Talla (mención, no estructural — importación plana).
function detectTalla(up) {
  let m = up.match(/\bTALLA\s+([A-Z0-9./,-]+)/)
  if (m) return m[1].replace(',', '.')
  m = up.match(/\b(XXL|XL|XS|S\/M|M\/L|L\/XL|S|M|L)\b/)
  if (m) return m[1]
  return null
}

// ── Léxico de componentes (recambios) ───────────────────────────────────────
// Cada entrada: regex sobre el nombre en mayúsculas, sustantivo, y textos veraces
// sobre función y uso. No se inventan medidas ni compatibilidades concretas.
const COMPONENTS = [
  // ── Entradas específicas (prioridad alta) ──────────────────────────────
  { re: /\bPATILLA/, noun: 'patilla de cambio',
    short: 'Patilla de cambio de recambio para proteger la transmisión.',
    body: 'Patilla de cambio (puntera) de recambio, la pieza sacrificable que protege el cambio y el cuadro ante un golpe o caída. Tener una de repuesto del modelo adecuado te ahorra un disgusto mayor.' },
  { re: /SCORPION|PZERO|P ?ZERO|ZAFFIRO|RUBINO|GATORSKIN|TUBULAR|CORSA/, noun: 'cubierta',
    short: 'Cubierta de gama para un buen agarre y rodadura fiable.',
    body: 'Cubierta diseñada para ofrecer un equilibrio fiable entre agarre, durabilidad y rodadura. Renovar el neumático recupera tracción y seguridad en cada salida, ya sea en carretera o en montaña.' },
  { re: /\bOLIVA|LATIGUILLO|\bBANJO\b|TUBO FRENO|PIN OLIVA/, noun: 'recambio de freno hidráulico',
    short: 'Recambio para el circuito de freno hidráulico.',
    body: 'Recambio para el circuito de freno hidráulico (latiguillo, oliva y conexiones) que garantiza un montaje estanco y una frenada fiable. Pieza esencial en cualquier purga o sustitución del sistema de freno.' },
  { re: /V[\s-]?BRAKE/, noun: 'freno V-Brake',
    short: 'Recambio de freno V-Brake para una frenada eficaz en llanta.',
    body: 'Recambio para frenos V-Brake que recupera una frenada eficaz y modulable sobre la llanta. Un componente básico para tu seguridad, fácil de montar y mantener.' },
  { re: /\bCO2\b|BOMBONA/, noun: 'cartucho de CO2',
    short: 'Cartucho de CO2 para inflar el neumático al instante.',
    body: 'Cartucho de CO2 para inflar el neumático de forma rápida tras un pinchazo. La solución más compacta y veloz para volver a rodar sin cargar con un inflador voluminoso.' },
  { re: /ANTIRROBO|CANDADO/, noun: 'candado antirrobo',
    short: 'Candado antirrobo para dejar la bicicleta con tranquilidad.',
    body: 'Candado antirrobo que añade seguridad cuando dejas la bicicleta aparcada. Un accesorio imprescindible para moverte por ciudad con tranquilidad.' },
  { re: /CABALLETE/, noun: 'caballete',
    short: 'Caballete para mantener la bicicleta en pie de forma estable.',
    body: 'Caballete que mantiene la bicicleta en pie de forma estable al aparcarla. Un accesorio práctico para el día a día, especialmente en bicicletas urbanas y de paseo.' },
  { re: /PARCHE|\bMECHAS?\b/, noun: 'kit de reparación de pinchazos',
    short: 'Reparación de pinchazos para resolver una avería sobre la marcha.',
    body: 'Sistema de reparación de pinchazos (parches o mechas) para resolver una avería sobre la marcha y seguir rodando. Imprescindible en el kit de cualquier ciclista previsor.' },
  { re: /CICLOCOMPUTADOR|CUENTAKM|CUENTAKILOM|CICLOCOMP/, noun: 'ciclocomputador',
    short: 'Ciclocomputador para medir velocidad, distancia y tus datos de ruta.',
    body: 'Ciclocomputador que registra velocidad, distancia y los datos esenciales de tu salida. La forma sencilla de seguir tu rendimiento y tu progreso sobre la bicicleta.' },
  { re: /GUARDABARROS|DEFENDER/, noun: 'guardabarros',
    short: 'Guardabarros para rodar protegido del barro y las salpicaduras.',
    body: 'Guardabarros que te protege del barro y las salpicaduras en mojado. Un accesorio que marca la diferencia en confort cuando el terreno o el tiempo se complican.' },
  { re: /CESTO|CESTA|PORTABULTOS|PORTAEQUIPAJE|PORTABAGS/, noun: 'accesorio de transporte',
    short: 'Accesorio de transporte para llevar tus cosas en la bicicleta.',
    body: 'Accesorio de transporte para llevar tus pertenencias cómodamente sobre la bicicleta. Práctico y resistente, suma versatilidad a tu día a día sobre dos ruedas.' },
  { re: /MULTIHERRAMIENTA|HERRAMIENTA|PINZA MECANICA|\bTOOL\b/, noun: 'herramienta',
    short: 'Herramienta de taller para el mantenimiento de tu bicicleta.',
    body: 'Herramienta pensada para el mantenimiento y los ajustes de tu bicicleta. Una aliada práctica para resolver imprevistos en ruta o en el taller de casa.' },
  { re: /CEPILLO|ABRILLANTADOR|\bLIMPIA|DETERGENTE|SMOOTH SEAL|\bCLEAN\b/, noun: 'producto de limpieza',
    short: 'Producto de limpieza para mantener tu bicicleta como nueva.',
    body: 'Producto de limpieza y cuidado para mantener tu bicicleta en perfecto estado. Una limpieza regular alarga la vida de los componentes y conserva el mejor aspecto.' },
  { re: /RETENES|\bRETEN\b/, noun: 'retenes de horquilla',
    short: 'Retenes de recambio para el correcto sellado de la suspensión.',
    body: 'Retenes de recambio para el correcto sellado de la horquilla o el amortiguador. Una sustitución clave en el mantenimiento de la suspensión para conservar su tacto y fiabilidad.' },
  { re: /\bNUCLEO\b/, noun: 'núcleo de rueda libre',
    short: 'Núcleo de recambio para el buje de la rueda.',
    body: 'Núcleo de rueda libre de recambio para el buje, sobre el que se monta el cassette. Pieza clave para una transmisión de potencia firme y un giro fiable de la rueda.' },
  { re: /RODILLO|TRAINER/, noun: 'rodillo de entrenamiento',
    short: 'Rodillo de entrenamiento para rodar en casa todo el año.',
    body: 'Rodillo de entrenamiento para mantener la forma rodando en casa, llueva o haga frío. La herramienta perfecta para entrenar de forma controlada durante todo el año.' },
  { re: /CUBREMANETAS/, noun: 'cubremanetas',
    short: 'Cubremanetas de recambio para proteger el puesto de mando.',
    body: 'Cubremanetas de recambio que protege y mejora el tacto de las manetas. Un detalle que cuida el puesto de mando y prolonga la vida de los componentes.' },
  { re: /\bGRUPO\b/, noun: 'grupo de transmisión',
    short: 'Grupo de transmisión para una mecánica precisa y de alto nivel.',
    body: 'Grupo de transmisión que reúne los componentes clave para un cambio preciso y una entrega de potencia eficiente. La base mecánica sobre la que se construye el rendimiento de la bicicleta.' },
  // ── Entradas generales ─────────────────────────────────────────────────
  { re: /\bCUBIERTA|NEUMATIC/, noun: 'cubierta',
    short: 'Cubierta para bicicleta con buen agarre y rodadura.',
    body: 'Cubierta diseñada para ofrecer un equilibrio fiable entre agarre, durabilidad y rodadura. Una pieza clave del rendimiento de tu bicicleta: renueva el neumático para recuperar tracción y seguridad en cada salida.' },
  { re: /\bCAMARA\b/, noun: 'cámara de aire',
    short: 'Cámara de aire de repuesto para tu bicicleta.',
    body: 'Cámara de aire de repuesto, imprescindible en el kit de cualquier ciclista. Ten siempre una de recambio para resolver un pinchazo sobre la marcha y volver a rodar sin contratiempos.' },
  { re: /\bCADENA\b/, noun: 'cadena',
    short: 'Cadena de transmisión para una pedalada fluida y precisa.',
    body: 'Cadena de transmisión que garantiza cambios precisos y una entrega de potencia eficiente. Sustituirla a tiempo protege platos y cassette, alargando la vida de toda la transmisión.' },
  { re: /\bRODAMIENTO|\bROD\b/, noun: 'rodamiento',
    short: 'Rodamiento de recambio para un giro suave y sin holguras.',
    body: 'Rodamiento de recambio para mantener un giro suave y libre de holguras. Una sustitución sencilla que elimina ruidos y recupera la sensación de fluidez en buje, dirección o pedalier.' },
  { re: /\bPASTILLAS?\b/, noun: 'pastillas de freno',
    short: 'Pastillas de freno para una frenada potente y constante.',
    body: 'Pastillas de freno de repuesto para recuperar una frenada potente, progresiva y silenciosa. Mantener las pastillas en buen estado es esencial para tu seguridad, especialmente en descensos y mojado.' },
  { re: /\bDISCOS?\b/, noun: 'disco de freno',
    short: 'Disco de freno para una frenada fiable y buena disipación.',
    body: 'Disco de freno de recambio que asegura una frenada fiable y una correcta disipación del calor. Pieza fundamental del sistema de frenado de disco, clave para tu seguridad en todo tipo de terreno.' },
  { re: /\bPLATOS?\b/, noun: 'plato',
    short: 'Plato de transmisión para una entrega de potencia eficiente.',
    body: 'Plato de transmisión de recambio para optimizar la entrega de potencia en cada pedalada. Renovar el plato cuando se desgasta mejora el engranaje de la cadena y la precisión del cambio.' },
  { re: /\bPEDALIER\b/, noun: 'pedalier',
    short: 'Pedalier de recambio para un giro de bielas suave y firme.',
    body: 'Pedalier de recambio para mantener un giro de bielas suave, firme y sin juego. Componente central de la transmisión: su buen estado se traduce en eficiencia y ausencia de ruidos al pedalear.' },
  { re: /\bCAS+E?T+E?S?\b/, noun: 'cassette',
    short: 'Cassette de piñones para un escalonado de marchas preciso.',
    body: 'Cassette de piñones de recambio para recuperar un escalonado de marchas preciso y silencioso. Sustituirlo junto a la cadena prolonga la vida de la transmisión y mejora la calidad del cambio.' },
  { re: /\bCABLES?\b|\bFUNDA\b/, noun: 'cable',
    short: 'Cable y funda para un accionamiento preciso de cambio o freno.',
    body: 'Cable de recambio para un accionamiento preciso y suave de cambios o frenos. Renovar cables y fundas elimina durezas y holguras, devolviendo tacto y precisión a las maniobras.' },
  { re: /\bPEDALES?\b|\bPEDAL\b/, noun: 'pedales',
    short: 'Pedales para una conexión firme y eficiente con la bicicleta.',
    body: 'Pedales que aseguran una conexión firme y eficiente entre tú y la bicicleta. Una plataforma estable mejora la transmisión de potencia y la comodidad en cualquier tipo de salida.' },
  { re: /\bCINTA\b/, noun: 'cinta de manillar',
    short: 'Cinta de manillar para un agarre cómodo y antideslizante.',
    body: 'Cinta de manillar que aporta agarre cómodo, amortiguación y un acabado limpio en el cockpit. Renovarla mejora el confort en ruta y la sujeción en mojado o en salidas largas.' },
  { re: /\bADAPTADOR/, noun: 'adaptador',
    short: 'Adaptador para garantizar la correcta compatibilidad de montaje.',
    body: 'Adaptador concebido para resolver la compatibilidad de montaje entre componentes. Una pieza pequeña pero esencial para una instalación correcta, segura y sin holguras.' },
  { re: /\bPORTABIDON/, noun: 'portabidón',
    short: 'Portabidón ligero para llevar la hidratación siempre a mano.',
    body: 'Portabidón ligero y resistente que mantiene el bidón sujeto con firmeza incluso en terreno bacheado. Mantenerte hidratado nunca fue tan sencillo: hidratación accesible en cada salida.' },
  { re: /\bBIDON\b/, noun: 'bidón',
    short: 'Bidón para mantener una hidratación cómoda durante la ruta.',
    body: 'Bidón pensado para una hidratación cómoda y rápida sobre la bicicleta. Su diseño facilita beber sin detenerte, un complemento imprescindible en salidas de cualquier distancia.' },
  { re: /\bPOTENCIA\b/, noun: 'potencia',
    short: 'Potencia para ajustar la posición y la rigidez del cockpit.',
    body: 'Potencia que une manillar y dirección aportando rigidez y control. Permite afinar la posición sobre la bicicleta para ganar comodidad o un pilotaje más reactivo.' },
  { re: /\bSILLIN|SILLA\b/, noun: 'sillín',
    short: 'Sillín diseñado para el confort en salidas de cualquier distancia.',
    body: 'Sillín diseñado para ofrecer apoyo y confort kilómetro tras kilómetro. Una buena elección de sillín marca la diferencia en la comodidad y el rendimiento sobre la bicicleta.' },
  { re: /\bABRAZADERA/, noun: 'abrazadera',
    short: 'Abrazadera para una fijación segura de la tija al cuadro.',
    body: 'Abrazadera de recambio para una fijación segura y sin deslizamientos de la tija al cuadro. Pieza sencilla y esencial para mantener la altura del sillín estable en cada salida.' },
  { re: /\bTIJA\b/, noun: 'tija',
    short: 'Tija de sillín para una sujeción firme y la altura perfecta.',
    body: 'Tija de sillín que sostiene el sillín con firmeza y permite ajustar la altura a tu medida. Componente clave para una posición eficiente y cómoda sobre la bicicleta.' },
  { re: /\bVALVULAS?\b/, noun: 'válvula',
    short: 'Válvula de recambio para el montaje tubeless o la cámara.',
    body: 'Válvula de recambio para sistemas tubeless o cámaras de aire. Un detalle imprescindible para mantener la presión y un montaje estanco y fiable.' },
  { re: /\bLIQUIDO\b|SELLANTE|GARRAFA|CARGA.*TUBELESS/, noun: 'líquido sellante',
    short: 'Líquido sellante tubeless para prevenir pinchazos.',
    body: 'Líquido sellante para montajes tubeless que sella al instante los pequeños pinchazos mientras ruedas. Reduce las paradas por pinchazo y mantiene la presión en tus salidas.' },
  { re: /\bZAPATAS?\b/, noun: 'zapatas de freno',
    short: 'Zapatas de freno para una frenada eficaz en llanta.',
    body: 'Zapatas de freno de recambio para sistemas de freno en llanta. Recuperan una frenada eficaz y modulable, un elemento básico para tu seguridad sobre la bicicleta.' },
  { re: /\bRADIOS?\b/, noun: 'radios',
    short: 'Radios de recambio para mantener la rueda firme y centrada.',
    body: 'Radios de recambio para conservar la tensión, la firmeza y el centrado de la rueda. Sustituir un radio dañado a tiempo evita problemas mayores en el conjunto de la rueda.' },
  { re: /\bACEITE\b|\bCERA\b|LUBRICA/, noun: 'lubricante',
    short: 'Lubricante para una transmisión silenciosa y protegida.',
    body: 'Lubricante específico para la transmisión que reduce la fricción, protege frente al desgaste y mantiene la cadena silenciosa. Un mantenimiento básico que alarga la vida de los componentes.' },
  { re: /DESENGRASANTE/, noun: 'desengrasante',
    short: 'Desengrasante para limpiar a fondo la transmisión.',
    body: 'Desengrasante que elimina la grasa y la suciedad acumuladas en cadena, platos y cassette. Una transmisión limpia rinde mejor, dura más y suena menos.' },
  { re: /\bARAÑA\b/, noun: 'araña de bielas',
    short: 'Araña de bielas de recambio para el montaje de platos.',
    body: 'Araña de bielas de recambio sobre la que se montan los platos. Pieza estructural de la transmisión que garantiza un anclaje firme y una transmisión de potencia eficiente.' },
  { re: /\bROLDANAS?\b|\bPOLEAS?\b/, noun: 'roldanas',
    short: 'Roldanas para un giro suave de la cadena en el cambio.',
    body: 'Roldanas de recambio para el cambio trasero que mantienen un guiado suave y silencioso de la cadena. Renovarlas recupera la precisión y reduce el rozamiento en la transmisión.' },
  { re: /\bDIRECCION\b|JUEGO DE DIR/, noun: 'juego de dirección',
    short: 'Juego de dirección para un giro de manillar preciso y sin holguras.',
    body: 'Juego de dirección que permite un giro de manillar suave, preciso y sin holguras. Componente esencial para un manejo seguro y una conducción libre de ruidos.' },
  { re: /\bPUÑOS?\b/, noun: 'puños',
    short: 'Puños ergonómicos para un agarre firme y cómodo.',
    body: 'Puños de manillar que aportan un agarre firme, ergonómico y antideslizante. Mejoran el control y reducen la fatiga de las manos en salidas largas o terreno técnico.' },
  { re: /\bMANETAS?\b/, noun: 'maneta',
    short: 'Maneta de recambio para un accionamiento preciso del freno o cambio.',
    body: 'Maneta de recambio para recuperar un accionamiento preciso y ergonómico de freno o cambio. Pieza clave del puesto de mando, esencial para el control y la seguridad.' },
  { re: /\bBIELAS?\b/, noun: 'bielas',
    short: 'Bielas para una transmisión de potencia rígida y eficiente.',
    body: 'Bielas que transmiten la fuerza de tu pedalada a la transmisión con rigidez y eficiencia. Un componente central que influye directamente en la sensación de empuje de la bicicleta.' },
  { re: /\bCAMBIO\b/, noun: 'cambio',
    short: 'Cambio para una transmisión precisa entre todos los desarrollos.',
    body: 'Mecanismo de cambio que garantiza transiciones precisas y fiables entre los distintos desarrollos. Un cambio bien ajustado se traduce en eficiencia y comodidad en cualquier terreno.' },
  { re: /\bCALAS?\b/, noun: 'calas',
    short: 'Calas de recambio para la conexión con pedales automáticos.',
    body: 'Calas de recambio para pedales automáticos que garantizan un anclaje firme y una transmisión de potencia óptima. Renovarlas mantiene un enganche seguro y un desenganche fiable.' },
  { re: /\bCIERRE|BLOCAJE/, noun: 'cierre',
    short: 'Cierre rápido para una fijación firme y de montaje sencillo.',
    body: 'Cierre de recambio para una fijación firme y un montaje y desmontaje sencillos. Pieza práctica que facilita el día a día con la bicicleta sin renunciar a la seguridad.' },
  { re: /\bINFLADOR|BOMBA\b/, noun: 'inflador',
    short: 'Inflador para mantener la presión correcta de tus neumáticos.',
    body: 'Inflador práctico para mantener tus neumáticos a la presión adecuada. Rodar con la presión correcta mejora el rendimiento, el confort y la protección frente a pinchazos.' },
  { re: /\bLUZ\b|LUCES|FARO|PILOTO/, noun: 'luz',
    short: 'Luz para ganar visibilidad y seguridad en cualquier condición.',
    body: 'Sistema de iluminación para verte y ser visto en condiciones de baja luz. Un accesorio de seguridad imprescindible para rodar con tranquilidad al amanecer, al atardecer o de noche.' },
  { re: /\bFUNDA\b|\bBOLSA\b/, noun: 'accesorio de transporte',
    short: 'Accesorio práctico para proteger y transportar tu material.',
    body: 'Accesorio pensado para proteger y transportar tu material con comodidad. Una solución práctica que cuida tu equipo y te acompaña en cada salida.' },
  { re: /\bSOPORTE\b/, noun: 'soporte',
    short: 'Soporte para fijar tu accesorio de forma firme y segura.',
    body: 'Soporte de montaje que fija tu accesorio de forma firme y estable sobre la bicicleta. Una sujeción fiable para que todo quede en su sitio, también en terreno bacheado.' },
  { re: /\bRUEDAS?\b/, noun: 'rueda',
    short: 'Rueda de recambio para renovar el rodaje de tu bicicleta.',
    body: 'Rueda de recambio para renovar el rodaje y recuperar prestaciones. Componente determinante en el comportamiento de la bicicleta: rigidez, ligereza y fiabilidad en cada salida.' },
  { re: /\bDESMONTABLES?\b/, noun: 'desmontables',
    short: 'Desmontables de cubierta para cambiar la rueda sin esfuerzo.',
    body: 'Desmontables que facilitan extraer y colocar la cubierta sin dañar la llanta ni la cámara. Una herramienta básica en el kit de cualquier ciclista para resolver un pinchazo.' },
  { re: /\bGRIFO\b|ANILLA|ARANDELA|CLIP|GOMA|PUNTERA/, noun: 'recambio',
    short: 'Pieza de recambio para el mantenimiento de tu bicicleta.',
    body: 'Pieza de recambio para el mantenimiento y la puesta a punto de tu bicicleta. Un pequeño componente que asegura el correcto funcionamiento del conjunto.' },
]

function describeComponent(up, brandLabel, color) {
  const seed = hash(up)
  const comp = COMPONENTS.find(c => c.re.test(up))
  if (comp) {
    let short = comp.short
    let body = comp.body
    if (brandLabel) {
      body += ` Calidad y fiabilidad ${brandLabel === 'Shimano' || brandLabel === 'SRAM' ? 'del referente' : 'de la marca'} ${brandLabel}.`
    }
    if (color) {
      const tail = pick([
        ` Acabado en color ${color}.`,
        ` Disponible en color ${color}.`,
      ], seed)
      body += tail
    }
    return { corta: short, completa: body }
  }
  // Genérico veraz para el long tail de recambios.
  const corta = 'Recambio y accesorio para bicicleta, listo para tu próxima puesta a punto.'
  let completa = 'Componente de recambio para el mantenimiento y la mejora de tu bicicleta. Una pieza pensada para mantener tu equipo a punto y disfrutar de cada salida con plena fiabilidad.'
  if (brandLabel) completa += ` Producto de la marca ${brandLabel}.`
  return { corta, completa }
}

// ── Composers por familia ────────────────────────────────────────────────
function describeBike(up, brand, color, feats, talla) {
  const seed = hash(up)
  const featTxt = feats.length ? ` Incorpora ${feats.join(', ')}.` : ''
  const colTxt = color ? ` Disponible en acabado ${color}.` : ''
  const tallaTxt = talla ? ` Talla ${talla}.` : ''
  const brandTxt = brand ? `${brand} ` : ''
  // El catálogo incluye cuadros sueltos dentro de las familias de bicis.
  const esCuadro = /\bCUADRO\b/.test(up)
  if (esCuadro) {
    const corta = `Cuadro ${brandTxt}para montar la bicicleta a tu medida.`.replace('  ', ' ')
    const intro = pick([
      `Cuadro ${brandTxt}que constituye la base de una bicicleta con carácter y prestaciones.`,
      `Cuadro ${brandTxt}diseñado para servir de punto de partida a un montaje a medida.`,
    ], seed)
    const completa = `${intro}${featTxt} La pieza sobre la que construir tu bicicleta ideal, combinando geometría y comportamiento pensados para disfrutar sobre dos ruedas.${colTxt}${tallaTxt}`.replace(/\s+/g, ' ').trim()
    return { corta, completa }
  }
  const corta = `Bicicleta ${brandTxt}lista para disfrutar de cada ruta con prestaciones de gama actual.`.replace('  ', ' ')
  const intro = pick([
    `Bicicleta ${brandTxt}concebida para ofrecer un rendimiento sólido y una conducción equilibrada.`,
    `Modelo ${brandTxt}que combina prestaciones, fiabilidad y un comportamiento pensado para disfrutar.`,
    `Bicicleta ${brandTxt}diseñada para sacar el máximo partido a cada salida.`,
  ], seed)
  const completa = `${intro}${featTxt} Una montura preparada para acompañarte tanto en tus rutas habituales como en tus nuevos retos sobre dos ruedas.${colTxt}${tallaTxt}`.replace(/\s+/g, ' ').trim()
  return { corta, completa }
}

function describeHelmet(up, brand, color, feats, talla) {
  const seed = hash(up)
  const featTxt = feats.length ? ` Incorpora ${feats.join(', ')}.` : ''
  const colTxt = color ? ` Color ${color}.` : ''
  const tallaTxt = talla ? ` Talla ${talla}.` : ''
  const brandTxt = brand ? `${brand} ` : ''
  const corta = `Casco ${brandTxt}ligero y ventilado para rodar con la máxima protección.`.replace('  ', ' ')
  const intro = pick([
    `Casco ${brandTxt}que combina protección, ligereza y una buena ventilación.`,
    `Casco ${brandTxt}diseñado para ofrecer seguridad y comodidad en cada salida.`,
  ], seed)
  const completa = `${intro}${featTxt} Un ajuste cómodo y un peso contenido para que olvides que lo llevas puesto, sin renunciar a la seguridad que necesitas.${colTxt}${tallaTxt}`.replace(/\s+/g, ' ').trim()
  return { corta, completa }
}

function describeApparel(up, brand, color, feats, talla) {
  const seed = hash(up)
  // Detectar prenda
  let prenda = 'prenda técnica de ciclismo'
  // Orden: lo más específico primero (interior/baselayer antes que camiseta).
  const map = [
    [/BASELAYER|INTERIOR|\bMESH\b/, 'prenda interior técnica'],
    [/CHALECO/, 'chaleco'],
    [/CHAQUETA|CORTAVIENTO|IMPERMEABLE/, 'chaqueta'],
    [/CULOTTE|CULOT|MALLA|PANTALON/, 'culotte'],
    [/BRAGA|CUELLO/, 'braga de cuello'],
    [/MAILLOT|CAMISETA|JERSEY/, 'maillot'],
    [/BIDON/, 'bidón'],
  ]
  for (const [re, n] of map) { if (re.test(up)) { prenda = n; break } }
  const featTxt = feats.length ? ` Incorpora ${feats.join(', ')}.` : ''
  const colTxt = color ? ` Color ${color}.` : ''
  const tallaTxt = talla ? ` Talla ${talla}.` : ''
  const brandTxt = brand ? ` de ${brand}` : ''
  const corta = `${cap(prenda)}${brandTxt} para rodar con comodidad y libertad de movimiento.`
  const intro = pick([
    `${cap(prenda)} técnica${brandTxt} pensada para ofrecer comodidad y un buen comportamiento sobre la bicicleta.`,
    `${cap(prenda)}${brandTxt} que aporta confort, transpirabilidad y libertad de movimiento.`,
  ], seed)
  const completa = `${intro}${featTxt} Una prenda preparada para acompañarte en tus salidas con la sensación de llevar el equipamiento adecuado.${colTxt}${tallaTxt}`.replace(/\s+/g, ' ').trim()
  return { corta, completa }
}

function describeShoe(up, brand, color, feats, talla) {
  const colTxt = color ? ` Color ${color}.` : ''
  const tallaTxt = talla ? ` Talla ${talla}.` : ''
  const brandTxt = brand ? ` de ${brand}` : ''
  const corta = `Zapatilla de ciclismo${brandTxt} para una pedalada eficiente y firme.`
  const completa = `Zapatilla de ciclismo${brandTxt} diseñada para transmitir la potencia de tu pedalada con eficiencia y mantener el pie firme y cómodo. Un calzado preparado para rendir kilómetro tras kilómetro.${colTxt}${tallaTxt}`.replace(/\s+/g, ' ').trim()
  return { corta, completa }
}

function describeGloves(up, brand, color, feats, talla) {
  const colTxt = color ? ` Color ${color}.` : ''
  const tallaTxt = talla ? ` Talla ${talla}.` : ''
  const brandTxt = brand ? ` de ${brand}` : ''
  const corta = `Guantes de ciclismo${brandTxt} para un agarre firme y mayor comodidad.`
  const completa = `Guantes de ciclismo${brandTxt} que aportan agarre, protección y comodidad sobre el manillar. Reducen la fatiga y mejoran el control en cualquier tipo de salida.${colTxt}${tallaTxt}`.replace(/\s+/g, ' ').trim()
  return { corta, completa }
}

function describeSocks(up, brand, color, talla) {
  const colTxt = color ? ` Color ${color}.` : ''
  const tallaTxt = talla ? ` Talla ${talla}.` : ''
  const corta = 'Calcetines técnicos de ciclismo, transpirables y cómodos.'
  const completa = `Calcetines técnicos de ciclismo diseñados para la transpirabilidad y el confort. Mantienen el pie fresco y seco para que disfrutes de cada pedalada.${colTxt}${tallaTxt}`.trim()
  return { corta, completa }
}

function describeGlasses(up, brand, color) {
  const colTxt = color ? ` Color ${color}.` : ''
  const brandTxt = brand ? ` de ${brand}` : ''
  const corta = `Gafas de ciclismo${brandTxt} con protección y visión nítida.`
  const completa = `Gafas de ciclismo${brandTxt} que protegen tus ojos del sol, el viento y las partículas, con una visión nítida en todo momento. Un complemento que suma seguridad y comodidad en cada salida.${colTxt}`.trim()
  return { corta, completa }
}

function describeOvershoe(up, brand, color, talla) {
  const colTxt = color ? ` Color ${color}.` : ''
  const tallaTxt = talla ? ` Talla ${talla}.` : ''
  const corta = 'Cubrezapatillas para proteger del frío, el viento y la lluvia.'
  const completa = `Cubrezapatillas que protegen tus pies del frío, el viento y la lluvia, manteniendo el calor en las salidas más exigentes. Un aliado imprescindible para rodar cómodo en invierno.${colTxt}${tallaTxt}`.trim()
  return { corta, completa }
}

function describeNutrition(up) {
  let tipo = 'producto de nutrición deportiva'
  if (/BARRITA|GOMINOLA|PIRULETA/.test(up)) tipo = 'barrita energética'
  else if (/\bGEL\b/.test(up)) tipo = 'gel energético'
  else if (/BEBIDA|ISOTONIC|HIDRATA/.test(up)) tipo = 'bebida isotónica'
  const corta = `${cap(tipo)} para mantener tu energía durante el esfuerzo.`
  const completa = `${cap(tipo)} pensada para aportar energía de forma rápida y mantener el rendimiento durante el esfuerzo. El complemento ideal para tus salidas largas y tus días más exigentes.`
  return { corta, completa }
}

function describeGps(up, brand, feats) {
  const featTxt = feats.length ? ` Incorpora ${feats.join(', ')}.` : ''
  const brandTxt = brand ? ` ${brand}` : ''
  const corta = `Dispositivo y accesorio GPS${brandTxt} para registrar y guiar tus rutas.`
  const completa = `Dispositivo o accesorio GPS${brandTxt} para registrar tus datos de entrenamiento y guiarte en cada ruta.${featTxt} La tecnología que necesitas para sacar el máximo partido a tus salidas y seguir tu progreso.`.replace(/\s+/g, ' ').trim()
  return { corta, completa }
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1) }

// ── Router principal ────────────────────────────────────────────────────────
function describe(row) {
  const name = String(row['Nombre Artículo'] || '')
  const up = name.toUpperCase()
  const familia = String(row['Familia'] || '')
  const brand = detectBrand(up)
  const color = detectColor(up)
  const feats = detectFeatures(up)
  const talla = detectTalla(up)

  switch (familia) {
    case 'Bicis Montaña':
    case 'Bicis Carretera':
    case 'Bicis Infantiles':
    case 'Cuadros bicis':
      return describeBike(up, brand, color, feats, talla)
    case 'Cascos':
      return describeHelmet(up, brand, color, feats, talla)
    case 'Ropa':
      return describeApparel(up, brand, color, feats, talla)
    case 'Calzado':
      return describeShoe(up, brand, color, feats, talla)
    case 'Guantes':
      return describeGloves(up, brand, color, feats, talla)
    case 'Calcetines':
      return describeSocks(up, brand, color, talla)
    case 'Gafas':
      return describeGlasses(up, brand, color)
    case 'Cubrezapatillas':
      return describeOvershoe(up, brand, color, talla)
    case 'Alimentacion':
      return describeNutrition(up)
    case 'GPS':
      return describeGps(up, brand, feats)
    case 'Accesorios y recambios':
    case 'Herramientas':
    default:
      return describeComponent(up, brand, color)
  }
}

// ── Proceso ───────────────────────────────────────────────────────────────
const wb = XLSX.readFile(SRC)
const src = XLSX.utils.sheet_to_json(wb.Sheets['Sheet1'], { defval: '' })

let described = 0
const out = src.map(row => {
  const stock = Math.max(0, Math.trunc(Number(row['Stock']) || 0))
  const hasStock = stock > 0
  let corta = '', completa = ''
  if (hasStock) {
    const d = describe(row)
    corta = d.corta
    completa = d.completa
    described++
  }
  const ean = row['EAN'] != null && String(row['EAN']).trim() !== '' ? String(row['EAN']).trim() : ''
  return {
    'Nombre': String(row['Nombre Artículo'] || '').replace(/\s+/g, ' ').trim(),
    'Tipo': String(row['Tipo'] || '').trim(),
    'Familia': String(row['Familia'] || '').trim(),
    'Descripcion corta': corta,
    'Descripcion completa': completa,
    'EAN': ean,
    'PVP c/IVA': Number(row['PVP c/IVA']) || 0,
    'Coste s/IVA': row['Coste s/IVA'] === '' ? '' : (Number(row['Coste s/IVA']) || 0),
    'Stock': stock,
    'Activo': 'No',
  }
})

const outWs = XLSX.utils.json_to_sheet(out, {
  header: ['Nombre', 'Tipo', 'Familia', 'Descripcion corta', 'Descripcion completa', 'EAN', 'PVP c/IVA', 'Coste s/IVA', 'Stock', 'Activo'],
})
// Anchos de columna para legibilidad
outWs['!cols'] = [
  { wch: 42 }, { wch: 10 }, { wch: 22 }, { wch: 60 }, { wch: 90 },
  { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 8 },
]
const outWb = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(outWb, outWs, 'Productos')
XLSX.writeFile(outWb, OUT)

console.log(`OK -> ${OUT}`)
console.log(`Filas totales: ${out.length}`)
console.log(`Con descripcion (stock>0): ${described}`)

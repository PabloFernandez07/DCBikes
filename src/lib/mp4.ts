/**
 * Demuxer MP4 mínimo: saca del fichero lo justo para alimentar a WebCodecs.
 *
 * ¿Por qué no mp4box.js / mediabunny? Porque de un demuxer general solo
 * necesitamos cuatro datos (la avcC, el tamaño de cada sample, dónde empieza
 * cada uno, y si es keyframe) de un fichero que controlamos nosotros: pista
 * única de vídeo, all-intra, faststart. mp4box son ~200 KB de bundle para eso.
 * Esto son 150 líneas y no añade nada al vendor.
 *
 * El precio de escribirlo a mano es que hay que ser honesto con lo que NO
 * soporta: si el MP4 no encaja en lo que esperamos (no hay avcC, hay samples
 * que no son sync, hay stsd raro...) esto LANZA en vez de devolver algo medio
 * roto. Quien lo llama cae al <video> de toda la vida, que sigue funcionando.
 */

export interface Mp4Track {
  /** String de códec para VideoDecoder.configure, p. ej. "avc1.64102A". */
  codec: string;
  /** Contenido de la caja avcC (sin la cabecera de 8 bytes). Es el `description`. */
  description: Uint8Array;
  codedWidth: number;
  codedHeight: number;
  /** Offset absoluto en el fichero de cada sample (fotograma). */
  offsets: Uint32Array;
  /** Tamaño en bytes de cada sample. */
  sizes: Uint32Array;
  frameCount: number;
}

interface Box {
  type: string;
  /** Primer byte del contenido (ya saltada la cabecera). */
  start: number;
  /** Primer byte DESPUÉS de la caja. */
  end: number;
}

/** Recorre las cajas hijas dentro de [start, end). */
function children(view: DataView, start: number, end: number): Box[] {
  const out: Box[] = [];
  let p = start;
  while (p + 8 <= end) {
    let size = view.getUint32(p);
    const type = String.fromCharCode(
      view.getUint8(p + 4), view.getUint8(p + 5), view.getUint8(p + 6), view.getUint8(p + 7),
    );
    let header = 8;
    if (size === 1) {
      // size===1 => tamaño de 64 bits en los 8 bytes siguientes.
      const hi = view.getUint32(p + 8);
      const lo = view.getUint32(p + 12);
      size = hi * 2 ** 32 + lo;
      header = 16;
    } else if (size === 0) {
      // size===0 => la caja llega hasta el final del fichero.
      size = end - p;
    }
    if (size < header || p + size > end) break;
    out.push({ type, start: p + header, end: p + size });
    p += size;
  }
  return out;
}

const find = (boxes: Box[], type: string): Box | undefined => boxes.find((b) => b.type === type);

function must(box: Box | undefined, what: string): Box {
  if (!box) throw new Error(`MP4: falta la caja ${what}`);
  return box;
}

export function parseMp4(data: Uint8Array): Mp4Track {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const top = children(view, 0, data.byteLength);
  const moov = must(find(top, 'moov'), 'moov');

  // Puede haber varias traks (vídeo, audio, texto...). Nos quedamos con la de
  // vídeo mirando el handler, no con la primera que aparezca.
  let stbl: Box[] | null = null;
  for (const trak of children(view, moov.start, moov.end).filter((b) => b.type === 'trak')) {
    const mdia = find(children(view, trak.start, trak.end), 'mdia');
    if (!mdia) continue;
    const mdiaKids = children(view, mdia.start, mdia.end);
    const hdlr = find(mdiaKids, 'hdlr');
    if (!hdlr) continue;
    // hdlr: 4 bytes version/flags + 4 pre_defined + 4 handler_type
    const handler = String.fromCharCode(
      view.getUint8(hdlr.start + 8), view.getUint8(hdlr.start + 9),
      view.getUint8(hdlr.start + 10), view.getUint8(hdlr.start + 11),
    );
    if (handler !== 'vide') continue;
    const minf = must(find(mdiaKids, 'minf'), 'minf');
    const stblBox = must(find(children(view, minf.start, minf.end), 'stbl'), 'stbl');
    stbl = children(view, stblBox.start, stblBox.end);
    break;
  }
  if (!stbl) throw new Error('MP4: no hay pista de vídeo');

  // ---- stsd -> avc1 -> avcC ------------------------------------------------
  const stsd = must(find(stbl, 'stsd'), 'stsd');
  // stsd: 4 bytes version/flags + 4 entry_count, luego las sample entries.
  const entries = children(view, stsd.start + 8, stsd.end);
  const avc1 = entries.find((b) => b.type === 'avc1' || b.type === 'avc3');
  if (!avc1) throw new Error(`MP4: se esperaba avc1/avc3 y hay ${entries.map((e) => e.type).join(',')}`);

  // VisualSampleEntry, contando desde el CONTENIDO de la caja avc1:
  //    0..5   reserved[6]
  //    6..7   data_reference_index
  //    8..9   pre_defined      10..11 reserved      12..23 pre_defined[3]
  //   24..25  width            26..27 height          <-- aquí, no en el 16
  //   28..35  h/v resolution   36..39 reserved      40..41 frame_count
  //   42..73  compressorname   74..75 depth         76..77 pre_defined
  //   78..    cajas hijas (avcC, pasp...)
  const codedWidth = view.getUint16(avc1.start + 24);
  const codedHeight = view.getUint16(avc1.start + 26);
  if (codedWidth === 0 || codedHeight === 0) {
    throw new Error('MP4: dimensiones 0 en la sample entry');
  }
  const avcC = must(find(children(view, avc1.start + 78, avc1.end), 'avcC'), 'avcC');
  const description = data.subarray(avcC.start, avcC.end);
  if (description.length < 4) throw new Error('MP4: avcC demasiado corta');

  // avcC: [0]=configurationVersion, [1]=profile, [2]=compat, [3]=level
  const hex = (n: number) => n.toString(16).padStart(2, '0').toUpperCase();
  const codec = `avc1.${hex(description[1])}${hex(description[2])}${hex(description[3])}`;

  // ---- stsz: tamaño de cada sample ----------------------------------------
  const stsz = must(find(stbl, 'stsz'), 'stsz');
  const uniform = view.getUint32(stsz.start + 4);
  const count = view.getUint32(stsz.start + 8);
  const sizes = new Uint32Array(count);
  for (let i = 0; i < count; i++) {
    sizes[i] = uniform !== 0 ? uniform : view.getUint32(stsz.start + 12 + i * 4);
  }

  // ---- stco / co64: offset de cada chunk -----------------------------------
  const stco = find(stbl, 'stco');
  const co64 = find(stbl, 'co64');
  const chunkBox = must(stco ?? co64, 'stco/co64');
  const chunkCount = view.getUint32(chunkBox.start + 4);
  const chunkOffsets = new Float64Array(chunkCount);   // co64 puede pasarse de 2^32
  for (let i = 0; i < chunkCount; i++) {
    chunkOffsets[i] = stco
      ? view.getUint32(chunkBox.start + 8 + i * 4)
      : view.getUint32(chunkBox.start + 8 + i * 8) * 2 ** 32 + view.getUint32(chunkBox.start + 12 + i * 8);
  }

  // ---- stsc: cuántos samples hay en cada chunk -----------------------------
  const stsc = must(find(stbl, 'stsc'), 'stsc');
  const stscCount = view.getUint32(stsc.start + 4);
  const firstChunk = new Uint32Array(stscCount);
  const perChunk = new Uint32Array(stscCount);
  for (let i = 0; i < stscCount; i++) {
    const o = stsc.start + 8 + i * 12;
    firstChunk[i] = view.getUint32(o);
    perChunk[i] = view.getUint32(o + 4);
  }

  // ---- sample -> offset absoluto ------------------------------------------
  const offsets = new Uint32Array(count);
  let sample = 0;
  for (let ci = 0; ci < chunkCount && sample < count; ci++) {
    // Última entrada de stsc cuyo first_chunk (1-based) <= este chunk.
    let spc = perChunk[0] ?? 0;
    for (let k = 0; k < stscCount; k++) {
      if (ci + 1 >= firstChunk[k]) spc = perChunk[k];
    }
    let off = chunkOffsets[ci];
    for (let j = 0; j < spc && sample < count; j++, sample++) {
      offsets[sample] = off;
      off += sizes[sample];
    }
  }
  if (sample !== count) {
    throw new Error(`MP4: mapeados ${sample} samples de ${count}`);
  }

  // ---- stss: TODO fotograma tiene que ser keyframe --------------------------
  // Es la premisa que hace posible el acceso aleatorio: si un fotograma no es
  // intra, descodificarlo suelto da basura. Si stss NO está, por definición del
  // formato todos los samples son sync (que es nuestro caso: -g 1). Si está y
  // no los lista todos, este vídeo no sirve para scrub y hay que abortar.
  const stss = find(stbl, 'stss');
  if (stss) {
    const syncCount = view.getUint32(stss.start + 4);
    if (syncCount !== count) {
      throw new Error(`MP4: no es all-intra (${syncCount} keyframes de ${count}); recodifica con -g 1`);
    }
  }

  return { codec, description, codedWidth, codedHeight, offsets, sizes, frameCount: count };
}

/**
 * pptxService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Dịch vụ Import / Chuyển đổi file PowerPoint (.pptx) thành JSON Canvas.
 *
 * Security layers implemented:
 *  1. Extension whitelist  — chỉ .pptx  (từ chối .ppt, .pptm)
 *  2. Magic bytes check    — xác minh ZIP header (PK\x03\x04)
 *  3. Zip Bomb protection  — tổng dung lượng giải nén ≤ MAX_EXTRACT_BYTES
 *  4. XSS Sanitize         — toàn bộ text từ XML được làm sạch HTML/Script
 *  5. File size limit      — được kiểm soát ở middleware multer (20 MB)
 *
 * Output format: mảng pages theo cấu trúc KanvaPro Canvas JSON.
 */

import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import sanitizeHtml from 'sanitize-html';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

// ── Constants ────────────────────────────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IMAGES_DIR = path.join(__dirname, '..', 'public', 'uploads', 'images');

/** Tổng dung lượng giải nén tối đa: 50 MB (chống Zip Bomb) */
const MAX_EXTRACT_BYTES = 50 * 1024 * 1024;

/** ZIP magic bytes: PK\x03\x04 */
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

/** EMU per pixel @ 96 DPI: 1 inch = 914400 EMU = 96px → 1px = 9525 EMU */
const EMU_PER_PX = 9525;

/** Target canvas dimensions (KanvaPro presentation default) */
const CANVAS_W = 1920;
const CANVAS_H = 1080;

/** XSS allowlist — chỉ cho text thuần, không tag HTML */
const SANITIZE_OPTS: sanitizeHtml.IOptions = {
  allowedTags: [],
  allowedAttributes: {},
};

const XML_PARSER = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  allowBooleanAttributes: true,
  parseAttributeValue: true,
  trimValues: true,
});

// ── Types ────────────────────────────────────────────────────────────────────
export interface PptxPage {
  id: string;
  page_order: number;
  background_color: string;
  width: number;
  height: number;
  elements: PptxElement[];
}

export interface PptxElement {
  id: string;
  type: 'text' | 'image';
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  // text
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  fill?: string;
  fontStyle?: string;
  align?: string;
  // image
  src?: string;
  // meta
  timeline: { start: number; duration: number; lane: number };
  animation: { in: string };
}

// ── Security: Magic Bytes ────────────────────────────────────────────────────
export function validateMagicBytes(buffer: Buffer): void {
  if (buffer.length < 4) throw new Error('File quá nhỏ, không phải PPTX hợp lệ.');
  const magic = buffer.slice(0, 4);
  if (!magic.equals(ZIP_MAGIC)) {
    throw new Error(
      'File không phải định dạng ZIP/PPTX hợp lệ (magic bytes không khớp). ' +
      'Có thể file bị đổi tên từ định dạng khác.'
    );
  }
}

// ── Security: Zip Bomb Protection ───────────────────────────────────────────
async function safeLoadZip(buffer: Buffer): Promise<JSZip> {
  const zip = await JSZip.loadAsync(buffer);
  let totalSize = 0;
  for (const [, file] of Object.entries(zip.files)) {
    if (!file.dir) {
      // file.comment contains original size in ZIP central dir
      const data = await file.async('uint8array');
      totalSize += data.length;
      if (totalSize > MAX_EXTRACT_BYTES) {
        throw new Error(
          `Dung lượng file sau khi giải nén vượt quá giới hạn 50 MB. ` +
          `File có thể là Zip Bomb hoặc quá lớn để xử lý.`
        );
      }
    }
  }
  return zip;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Chuyển EMU → pixel với scale về canvas */
function emuToPx(emu: number, scale: number): number {
  return Math.round((emu / EMU_PER_PX) * scale);
}

/** Đọc màu hex từ node solidFill/srgbClr */
function extractColor(node: any): string {
  try {
    const solid = node?.['a:solidFill'] ?? node?.solidFill;
    if (!solid) return '#000000';
    const srgb = solid?.['a:srgbClr'] ?? solid?.srgbClr;
    if (srgb?.['@_val']) return `#${srgb['@_val']}`;
    return '#000000';
  } catch {
    return '#000000';
  }
}

/** Lấy text thuần từ txBody, gộp tất cả paragraph */
function extractText(txBody: any): string {
  const paras = toArray(txBody?.['a:p'] ?? txBody?.p ?? []);
  return paras
    .map((p: any) => {
      const runs = toArray(p?.['a:r'] ?? p?.r ?? []);
      return runs
        .map((r: any) => {
          const t = r?.['a:t'] ?? r?.t ?? '';
          return typeof t === 'string' ? t : String(t ?? '');
        })
        .join('');
    })
    .filter(Boolean)
    .join('\n');
}

/** Lấy font size (PPTX sz là hundredths of pt → convert sang px) */
function extractFontSize(txBody: any, scaleY: number): number {
  const paras = toArray(txBody?.['a:p'] ?? txBody?.p ?? []);
  for (const p of paras) {
    const runs = toArray(p?.['a:r'] ?? p?.r ?? []);
    for (const r of runs) {
      const rPr = r?.['a:rPr'] ?? r?.rPr;
      const sz = rPr?.['@_sz'];
      if (sz && Number(sz) > 0) {
        // sz in hundredths of pt; 1pt = 96/72px
        const ptSize = Number(sz) / 100;
        return Math.max(8, Math.round(ptSize * (96 / 72) * scaleY));
      }
    }
  }
  return Math.round(18 * scaleY);
}

/** Lấy font color từ run */
function extractTextColor(txBody: any): string {
  const paras = toArray(txBody?.['a:p'] ?? txBody?.p ?? []);
  for (const p of paras) {
    const runs = toArray(p?.['a:r'] ?? p?.r ?? []);
    for (const r of runs) {
      const rPr = r?.['a:rPr'] ?? r?.rPr;
      if (rPr) return extractColor(rPr);
    }
  }
  return '#000000';
}

/** Lấy font style (bold/italic) */
function extractFontStyle(txBody: any): string {
  const paras = toArray(txBody?.['a:p'] ?? txBody?.p ?? []);
  for (const p of paras) {
    const runs = toArray(p?.['a:r'] ?? p?.r ?? []);
    for (const r of runs) {
      const rPr = r?.['a:rPr'] ?? r?.rPr;
      if (!rPr) continue;
      const bold = rPr['@_b'];
      const italic = rPr['@_i'];
      if (bold && italic) return 'bold italic';
      if (bold) return 'bold';
      if (italic) return 'italic';
    }
  }
  return 'normal';
}

/** Lấy text alignment */
function extractAlign(txBody: any): string {
  const paras = toArray(txBody?.['a:p'] ?? txBody?.p ?? []);
  for (const p of paras) {
    const pPr = p?.['a:pPr'] ?? p?.pPr;
    const algn = pPr?.['@_algn'];
    if (algn === 'ctr') return 'center';
    if (algn === 'r') return 'right';
    if (algn === 'just') return 'justify';
  }
  return 'left';
}

/** Normalize to array */
function toArray<T>(v: T | T[] | undefined): T[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

/** Lấy xfrm (position + size) từ spPr */
function extractXfrm(spPr: any): { x: number; y: number; cx: number; cy: number; rot: number } | null {
  const xfrm = spPr?.['a:xfrm'] ?? spPr?.xfrm;
  if (!xfrm) return null;
  const off = xfrm?.['a:off'] ?? xfrm?.off;
  const ext = xfrm?.['a:ext'] ?? xfrm?.ext;
  if (!off || !ext) return null;
  return {
    x: Number(off?.['@_x'] ?? 0),
    y: Number(off?.['@_y'] ?? 0),
    cx: Number(ext?.['@_cx'] ?? 0),
    cy: Number(ext?.['@_cy'] ?? 0),
    rot: Number(xfrm?.['@_rot'] ?? 0) / 60000, // EMU rot is in 1/60000 degree
  };
}

// ── Parse slide relationships ─────────────────────────────────────────────────
async function parseSlideRels(zip: JSZip, slideIndex: number): Promise<Map<string, string>> {
  const relsPath = `ppt/slides/_rels/slide${slideIndex}.xml.rels`;
  const relsFile = zip.file(relsPath);
  const map = new Map<string, string>();
  if (!relsFile) return map;

  const content = await relsFile.async('text');
  const parsed = XML_PARSER.parse(content);
  const rels = toArray(
    parsed?.Relationships?.Relationship ?? []
  );
  for (const rel of rels) {
    const id = rel?.['@_Id'];
    const target = rel?.['@_Target'] as string;
    if (id && target) map.set(String(id), target);
  }
  return map;
}

// ── Layout placeholder key helper ───────────────────────────────────────────
// Derives a stable key from the p:ph element of a slide shape,
// so we can match it against the same placeholder in the slide layout.
function getPhKey(sp: any): string | null {
  const nvSpPr = sp?.['p:nvSpPr'] ?? sp?.nvSpPr;
  const nvPr = nvSpPr?.['p:nvPr'] ?? nvSpPr?.nvPr;
  const ph = nvPr?.['p:ph'] ?? nvPr?.ph;
  if (ph === undefined || ph === null) return null;
  const phType = ph?.['@_type'];
  const phIdx = ph?.['@_idx'];
  // Prefer type match (e.g. 'title'), then index match (e.g. idx:1)
  if (phType) return `type:${phType}`;
  if (phIdx != null) return `idx:${Number(phIdx)}`;
  return 'type:body'; // default (body placeholder with no type attr)
}

// ── Parse slide LAYOUT for all shape positions ────────────────────────────────
// Builds two lookup structures from the slide layout XML:
//  1. phXfrmMap: keyed by placeholder key ('type:title', 'idx:1', ...) → xfrm
//     Used for text p:sp shapes that inherit position from layout.
//  2. picXfrms: ordered array of p:pic xfrm coords
//     Used by index-order matching for slide p:pic without own xfrm.
type LayoutPositions = {
  phXfrmMap: Map<string, { x: number; y: number; cx: number; cy: number; rot: number }>;
  picXfrms: Array<{ x: number; y: number; cx: number; cy: number; rot: number }>;
};

async function getLayoutPositions(
  zip: JSZip,
  slideRels: Map<string, string>
): Promise<LayoutPositions> {
  const empty: LayoutPositions = { phXfrmMap: new Map(), picXfrms: [] };

  const layoutTarget = Array.from(slideRels.values()).find(
    v => v.includes('slideLayout')
  );
  if (!layoutTarget) return empty;

  const layoutPath = layoutTarget.startsWith('../')
    ? `ppt/${layoutTarget.slice(3)}`
    : layoutTarget;

  const layoutFile = zip.file(layoutPath);
  if (!layoutFile) return empty;

  try {
    const content = await layoutFile.async('text');
    const parsed = XML_PARSER.parse(content);
    const sldLayout = parsed?.['p:sldLayout'] ?? parsed?.sldLayout;
    const cSld = sldLayout?.['p:cSld'] ?? sldLayout?.cSld;
    const spTree = cSld?.['p:spTree'] ?? cSld?.spTree;
    if (!spTree) return empty;

    const phXfrmMap = new Map<string, { x: number; y: number; cx: number; cy: number; rot: number }>();
    const picXfrms: Array<{ x: number; y: number; cx: number; cy: number; rot: number }> = [];

    // ── Text shapes (p:sp) in layout ────────────────────────────────────────
    // Collect blipFill xfrms separately — used ONLY as fallback when no p:pic found.
    const blipFillXfrms: Array<{ x: number; y: number; cx: number; cy: number; rot: number }> = [];
    for (const sp of toArray(spTree?.['p:sp'] ?? [])) {
      const spPr = sp?.['p:spPr'] ?? {};
      const xfrm = extractXfrm(spPr);
      if (!xfrm || xfrm.cx <= 0 || xfrm.cy <= 0) continue;

      // Map by placeholder key for text shapes
      const phKey = getPhKey(sp);
      if (phKey) {
        phXfrmMap.set(phKey, xfrm);
      }

      // Collect image-fill shapes separately, NOT mixed into picXfrms yet
      const blipFill = spPr?.['a:blipFill'] ?? spPr?.blipFill;
      if (blipFill) blipFillXfrms.push(xfrm);
    }

    // ── Picture shapes (p:pic) in layout — HIGHEST PRIORITY ─────────────────
    // p:pic positions MUST come first to ensure correct index-based matching.
    // Mixing blipFill before p:pic caused slide 9/15 images to use wrong position.
    for (const pic of toArray(spTree?.['p:pic'] ?? [])) {
      const spPr = pic?.['p:spPr'] ?? {};
      const xfrm = extractXfrm(spPr);
      if (xfrm && xfrm.cx > 0 && xfrm.cy > 0) picXfrms.push(xfrm);
    }

    // Only fall back to blipFill positions when no actual p:pic was found in layout
    if (picXfrms.length === 0) {
      picXfrms.push(...blipFillXfrms);
    }

    console.log(`[PPTX]   layout "${layoutPath}" → ${phXfrmMap.size} text placeholders, ${picXfrms.length} pic xfrms`);
    return { phXfrmMap, picXfrms };

  } catch {
    return empty;
  }
}

// ── Upload extracted image buffer to server ───────────────────────────────────
async function saveImageBuffer(buffer: Buffer, ext: string): Promise<string> {
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
  const fileName = `pptx_${uuidv4()}${ext}`;
  const filePath = path.join(IMAGES_DIR, fileName);
  fs.writeFileSync(filePath, buffer);
  return `/uploads/images/${fileName}`;
}

// ── Parse presentation dimensions ────────────────────────────────────────────
async function parsePresentationDimensions(zip: JSZip): Promise<{ widthEmu: number; heightEmu: number }> {
  const presFile = zip.file('ppt/presentation.xml');
  if (!presFile) return { widthEmu: 9144000, heightEmu: 5143500 };

  const content = await presFile.async('text');
  const parsed = XML_PARSER.parse(content);

  // Navigate to sldSz
  const pres = parsed?.['p:presentation'] ?? parsed?.presentation;
  const sldSz = pres?.['p:sldSz'] ?? pres?.sldSz;
  if (sldSz) {
    return {
      widthEmu: Number(sldSz?.['@_cx'] ?? 9144000),
      heightEmu: Number(sldSz?.['@_cy'] ?? 5143500),
    };
  }
  return { widthEmu: 9144000, heightEmu: 5143500 };
}

// ── Parse background color ────────────────────────────────────────────────────
function parseBackground(slideXml: any): string {
  try {
    const cSld = slideXml?.['p:cSld'] ?? slideXml?.cSld;
    const bg = cSld?.['p:bg'] ?? cSld?.bg;
    const bgPr = bg?.['p:bgPr'] ?? bg?.bgPr;
    const solid = bgPr?.['a:solidFill'] ?? bgPr?.solidFill;
    if (solid) {
      const srgb = solid?.['a:srgbClr'] ?? solid?.srgbClr;
      if (srgb?.['@_val']) return `#${srgb['@_val']}`;
    }
  } catch {}
  return '#ffffff';
}

// ── Robust rEmbed extractor: search any key containing 'embed' ───────────────
// fast-xml-parser preserves namespace prefixes as-is (r:embed → @_r:embed)
// but some PPTX variants may use different namespace aliases.
function extractREmbed(blip: any): string | null {
  if (!blip || typeof blip !== 'object') return null;
  // 1. Standard: @_r:embed
  if (blip['@_r:embed']) return String(blip['@_r:embed']);
  // 2. Fallback: search for any attribute key that ends with ':embed' or equals 'embed'
  for (const key of Object.keys(blip)) {
    if ((key.toLowerCase().endsWith(':embed') || key.toLowerCase() === '@_embed') && blip[key]) {
      return String(blip[key]);
    }
  }
  return null;
}

// ── Shared image element builder ───────────────────────────────────────────────
async function buildImageElement(
  spPr: any,
  blipNode: any,
  rels: Map<string, string>,
  zip: JSZip,
  scaleX: number,
  scaleY: number,
  lane: number,
  slideWidthEmu: number,
  slideHeightEmu: number,
  layoutXfrm?: { x: number; y: number; cx: number; cy: number; rot: number }
): Promise<PptxElement | null> {
  const rEmbed = extractREmbed(blipNode);
  if (!rEmbed) {
    console.warn('[PPTX]   buildImage: extractREmbed returned null. blipNode keys:', blipNode ? Object.keys(blipNode) : 'null');
    return null;
  }

  const spPrKeys = spPr ? Object.keys(spPr) : [];

  // Fallback chain:
  // 1. slide's own p:spPr.a:xfrm (most accurate)
  // 2. slide layout's p:pic.p:spPr.a:xfrm (for layout-inherited pics)
  // 3. full slide size (last resort for truly positionless pics)
  const slideXfrm = extractXfrm(spPr);
  const xfrm = slideXfrm
    ?? layoutXfrm
    ?? { x: 0, y: 0, cx: slideWidthEmu, cy: slideHeightEmu, rot: 0 };

  const xfrmSource = slideXfrm ? 'slide' : layoutXfrm ? 'layout' : 'full-slide-fallback';
  console.log(`[PPTX]   buildImage: rEmbed="${rEmbed}", spPr keys=[${spPrKeys.join(', ')}], xfrm-source=${xfrmSource}`);

  if (xfrm.cx <= 0 || xfrm.cy <= 0) {
    console.warn(`[PPTX]   buildImage: cx=${xfrm.cx}, cy=${xfrm.cy} — skipping`);
    return null;
  }

  const relTarget = rels.get(String(rEmbed));
  if (!relTarget) {
    console.warn(`[PPTX]   buildImage: rId "${rEmbed}" not found in rels`);
    return null;
  }

  // Resolve relative path: ../media/image1.png → ppt/media/image1.png
  const normalizedTarget = relTarget.startsWith('../')
    ? `ppt/${relTarget.slice(3)}`
    : relTarget;

  console.log(`[PPTX]   buildImage: resolved "${rEmbed}" → "${normalizedTarget}"`);

  const mediaFile = zip.file(normalizedTarget);
  if (!mediaFile) {
    // Try alternative path (some PPTX use different casing)
    const altFile = [...Object.keys((zip as any).files)].find(
      k => k.toLowerCase() === normalizedTarget.toLowerCase()
    );
    if (altFile) {
      console.log(`[PPTX]   buildImage: found via case-insensitive match: "${altFile}"`);
      // retry with correct path
      const altMediaFile = zip.file(altFile);
      if (altMediaFile) {
        const ext = path.extname(altFile).toLowerCase() || '.png';
        if (!['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'].includes(ext)) return null;
        try {
          const buf = Buffer.from(await altMediaFile.async('uint8array'));
          const imageUrl = await saveImageBuffer(buf, ext);
          return {
            id: uuidv4(), type: 'image',
            x: emuToPx(xfrm.x, scaleX), y: emuToPx(xfrm.y, scaleY),
            width: emuToPx(xfrm.cx, scaleX), height: emuToPx(xfrm.cy, scaleY),
            rotation: xfrm.rot, src: imageUrl,
            timeline: { start: 0, duration: 5, lane }, animation: { in: 'none' },
          };
        } catch (e) {
          console.warn(`[PPTX]   buildImage: failed to save alt file:`, e);
          return null;
        }
      }
    }
    console.warn(`[PPTX]   buildImage: media file NOT found in zip: "${normalizedTarget}"`);
    // List zip files in ppt/media for debugging
    const mediaFiles = Object.keys((zip as any).files).filter(k => k.includes('media'));
    console.warn('[PPTX]   Zip media files:', mediaFiles.slice(0, 10).join(', '));
    return null;
  }

  const ext = path.extname(normalizedTarget).toLowerCase() || '.png';
  if (!['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.emf', '.wmf'].includes(ext)) {
    console.warn(`[PPTX]   buildImage: unsupported ext "${ext}" for "${normalizedTarget}"`);
    return null;
  }

  try {
    const mediaBuffer = Buffer.from(await mediaFile.async('uint8array'));
    if (ext === '.emf' || ext === '.wmf') return null;
    const imageUrl = await saveImageBuffer(mediaBuffer, ext === '.bmp' ? '.png' : ext);
    console.log(`[PPTX]   buildImage: ✅ saved "${normalizedTarget}" → "${imageUrl}"`);

    return {
      id: uuidv4(),
      type: 'image',
      x: emuToPx(xfrm.x, scaleX),
      y: emuToPx(xfrm.y, scaleY),
      width: emuToPx(xfrm.cx, scaleX),
      height: emuToPx(xfrm.cy, scaleY),
      rotation: xfrm.rot,
      src: imageUrl,
      timeline: { start: 0, duration: 5, lane },
      animation: { in: 'none' },

    };
  } catch (err) {
    console.warn(`[PPTX] Failed to save image "${normalizedTarget}":`, err);
    return null;
  }
}

// ── Core slide parser ─────────────────────────────────────────────────────────
async function parseSlide(
  zip: JSZip,
  slideIndex: number,
  scaleX: number,
  scaleY: number,
  slideWidthEmu: number,
  slideHeightEmu: number
): Promise<PptxElement[]> {
  const slidePath = `ppt/slides/slide${slideIndex}.xml`;
  const slideFile = zip.file(slidePath);
  if (!slideFile) return [];

  const content = await slideFile.async('text');
  const parsed = XML_PARSER.parse(content);

  // Navigate to spTree (shape tree)
  const sld = parsed?.['p:sld'] ?? parsed?.sld;
  const cSld = sld?.['p:cSld'] ?? sld?.cSld;
  const spTree = cSld?.['p:spTree'] ?? cSld?.spTree;
  if (!spTree) {
    console.warn(`[PPTX] Slide ${slideIndex}: spTree not found`);
    return [];
  }

  // Debug: log all top-level keys in spTree to understand the structure
  const spTreeKeys = Object.keys(spTree).filter(k => !k.startsWith('@_'));
  console.log(`[PPTX] Slide ${slideIndex} spTree keys: ${spTreeKeys.join(', ')}`);

  const rels = await parseSlideRels(zip, slideIndex);
  console.log(`[PPTX] Slide ${slideIndex} rels:`, Array.from(rels.entries()).map(([k,v]) => `${k}→${v}`).join(', '));

  // Pre-fetch ALL layout positions (text placeholders + pics)
  const layoutPos = await getLayoutPositions(zip, rels);
  let layoutPicIndex = 0;  // tracks which picXfrm to use next

  const elements: PptxElement[] = [];
  let lane = 0;

  // ─────────────────────────────────────────────────────────────────────────
  // Recursive processor: handles a "shape container" (spTree, grpSp, etc.)
  // Extracts: text (p:sp with txBody), images (p:pic), shapes with blipFill
  // ─────────────────────────────────────────────────────────────────────────
  async function processContainer(container: any, depth = 0): Promise<void> {
    if (!container || depth > 5) return;

    // ── 1. p:sp — Text shapes AND shapes with image fills ──────────────────
    const shapes = toArray(container?.['p:sp'] ?? container?.sp ?? []);
    for (const sp of shapes) {
      const spPr = sp?.['p:spPr'] ?? sp?.spPr;
      const txBody = sp?.['p:txBody'] ?? sp?.txBody;

      if (txBody) {
        // TEXT shape: get position from slide, fall back to layout placeholder position
        const ownXfrm = extractXfrm(spPr);
        let xfrm = ownXfrm;
        if (!xfrm) {
          const phKey = getPhKey(sp);
          if (phKey) xfrm = layoutPos.phXfrmMap.get(phKey) ?? null;
        }
        if (!xfrm || xfrm.cx <= 0 || xfrm.cy <= 0) continue;

        const rawText = extractText(txBody);
        if (!rawText.trim()) continue;
        const cleanText = sanitizeHtml(rawText, SANITIZE_OPTS);
        elements.push({
          id: uuidv4(),
          type: 'text',
          x: emuToPx(xfrm.x, scaleX),
          y: emuToPx(xfrm.y, scaleY),
          width: emuToPx(xfrm.cx, scaleX),
          height: emuToPx(xfrm.cy, scaleY),
          rotation: xfrm.rot,
          text: cleanText,
          fontSize: extractFontSize(txBody, scaleY),
          fontFamily: 'Inter, Arial, sans-serif',
          fill: extractTextColor(txBody),
          fontStyle: extractFontStyle(txBody),
          align: extractAlign(txBody),
          timeline: { start: 0, duration: 5, lane: lane++ },
          animation: { in: 'none' },
        });
      } else {
        // Check for IMAGE FILL on shape (a:blipFill inside p:spPr)
        const blipFill = spPr?.['a:blipFill'] ?? spPr?.blipFill;
        if (blipFill) {
          const blip = blipFill?.['a:blip'] ?? blipFill?.blip;
          const el = await buildImageElement(spPr, blip, rels, zip, scaleX, scaleY, lane, slideWidthEmu, slideHeightEmu);
          if (el) { elements.push(el); lane++; }
        }
      }
    }

    // ── 2. p:pic — Direct picture elements ────────────────────────────────
    const pics = toArray(container?.['p:pic'] ?? container?.pic ?? []);
    console.log(`[PPTX] Slide ${slideIndex} depth=${depth}: found ${pics.length} p:pic`);
    for (const pic of pics) {
      const spPr = pic?.['p:spPr'] ?? pic?.spPr;
      const blipFill = pic?.['p:blipFill'] ?? pic?.blipFill;
      const blip = blipFill?.['a:blip'] ?? blipFill?.blip;
      console.log(`[PPTX]   pic blip keys:`, blip ? Object.keys(blip) : 'null');

      // Use layout xfrm as positional fallback when slide p:spPr has no a:xfrm
      const ownXfrm = extractXfrm(spPr);
      const layoutFallback = ownXfrm ? undefined : layoutPos.picXfrms[layoutPicIndex];
      if (!ownXfrm) layoutPicIndex++; // consume next layout slot only when needed

      const el = await buildImageElement(spPr, blip, rels, zip, scaleX, scaleY, lane, slideWidthEmu, slideHeightEmu, layoutFallback);
      if (el) { elements.push(el); lane++; }
    }

    // ── 3. p:grpSp — Recurse into group shapes ────────────────────────────
    const groups = toArray(container?.['p:grpSp'] ?? container?.grpSp ?? []);
    for (const grp of groups) {
      await processContainer(grp, depth + 1);
    }

    // ── 4. p:graphicFrame — Charts/tables (log but skip) ──────────────────
    const frames = toArray(container?.['p:graphicFrame'] ?? []);
    if (frames.length > 0) {
      console.log(`[PPTX] Slide ${slideIndex}: ${frames.length} graphicFrame(s) skipped (chart/table)`);
    }
  }

  await processContainer(spTree);
  return elements;
}

// ── Count slides in presentation ──────────────────────────────────────────────

async function countSlides(zip: JSZip): Promise<number> {
  let count = 0;
  while (zip.file(`ppt/slides/slide${count + 1}.xml`)) {
    count++;
  }
  return count;
}

// ── Main entry: parsePptx ─────────────────────────────────────────────────────
export async function parsePptx(fileBuffer: Buffer): Promise<PptxPage[]> {
  // 1. Magic bytes
  validateMagicBytes(fileBuffer);

  // 2. Load ZIP with bomb protection
  const zip = await safeLoadZip(fileBuffer);

  // 3. Read slide dimensions from presentation.xml
  const { widthEmu, heightEmu } = await parsePresentationDimensions(zip);
  const slideWidthPx = widthEmu / EMU_PER_PX;
  const slideHeightPx = heightEmu / EMU_PER_PX;
  const scaleX = CANVAS_W / slideWidthPx;
  const scaleY = CANVAS_H / slideHeightPx;

  console.log(`[PPTX] Slide size: ${slideWidthPx.toFixed(0)}x${slideHeightPx.toFixed(0)}px → scale ${scaleX.toFixed(3)}x${scaleY.toFixed(3)}`);

  // 4. Count and parse slides
  const slideCount = await countSlides(zip);
  if (slideCount === 0) throw new Error('File PPTX không có slide nào.');
  if (slideCount > 100) throw new Error('File PPTX có quá nhiều slide (tối đa 100 slide).');

  console.log(`[PPTX] Parsing ${slideCount} slides...`);

  const pages: PptxPage[] = [];
  for (let i = 1; i <= slideCount; i++) {
    // Parse background color
    const slidePath = `ppt/slides/slide${i}.xml`;
    const slideFile = zip.file(slidePath);
    let bgColor = '#ffffff';
    if (slideFile) {
      const content = await slideFile.async('text');
      const parsed = XML_PARSER.parse(content);
      const sld = parsed?.['p:sld'] ?? parsed?.sld;
      bgColor = parseBackground(sld);
    }

    const elements = await parseSlide(zip, i, scaleX, scaleY, widthEmu, heightEmu);

    pages.push({
      id: uuidv4(),
      page_order: i - 1,
      background_color: bgColor,
      width: CANVAS_W,
      height: CANVAS_H,
      elements,
    });
    console.log(`[PPTX] Slide ${i}/${slideCount}: ${elements.length} elements`);
  }

  return pages;
}

// src/lib/ltvPdfParser.ts
// Parse le PDF tableau LTV (format JasperReports, texte natif) pour le mode 2026.
// PORTÉ depuis LIM2 (src/lib/ltvPdfParser.ts) — même logique d'extraction, afin que
// l'éditeur puisse importer exactement le même PDF que l'app cabine.
// Retourne un NormalizedLtvFile compatible avec readLtvNormalizedRowsFromFile.

import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

// Config du worker pdf.js (Vite ?url). Idempotent : on ne l'écrit que si absent.
if (!(pdfjsLib as any).GlobalWorkerOptions.workerSrc) {
  (pdfjsLib as any).GlobalWorkerOptions.workerSrc = workerUrl;
}

// ── Types (identiques au format NormalizedLtvFile de l'app) ─────────────────
export type ManualLtvDisplayRow = {
  code: string;
  section: string;
  via: string;
  kmIni: string;
  kmFin: string;
  speed: string;
  motivo: string;
  fecha1: string;
  hora1: string;
  fecha2: string;
  hora2: string;
  viaCheck: boolean;
  sistema: boolean;
  soloCabeza: boolean;
  csv: boolean;
  observaciones: string;
};

export type NormalizedLtvFile = {
  meta: {
    line: string;
    publishedAt: string;
    adif: {
      source: string;
      fetchedAt: string;
      sourceUpdatedAt: string | null;
      sourceUpdatedFile: string | null;
    };
  };
  rows: ManualLtvDisplayRow[];
  warnings: string[];
};

// ── Limites x0 des colonnes (coordonnées PDF, page A4 paysage 842pt) ────────
const COL = {
  CODE_MAX: 65,
  SECTION_MAX: 187,
  VIA_MAX: 205,
  KM_INI_MAX: 237,
  KM_FIN_MAX: 267,
  SPEED_MAX: 293,
  MOTIVO_MAX: 428,
  FECHA1_MAX: 498,
  FECHA2_MAX: 575,
  VIA_CHECK_MAX: 615,
  SISTEMA_MAX: 654,
  SOLO_CAB_MAX: 680,
  CSV_MAX: 700,
} as const;

interface RawItem {
  str: string;
  x: number; // x0 de l'item (transform[4])
  y: number; // y0 (transform[5]) — origine bas-gauche PDF
}

interface ParsedRow {
  linea: string;
  code: string;
  sectionParts: string[];
  via: string;
  kmIni: string;
  kmFin: string;
  speed: string;
  motivo: string;
  fecha1: string;
  hora1: string;
  fecha2: string;
  hora2: string;
  viaCheck: boolean;
  sistema: boolean;
  soloCabeza: boolean;
  csv: boolean;
  obsParts: string[];
}

function groupByRow(items: RawItem[], yTolerance = 4): RawItem[][] {
  if (!items.length) return [];
  const sorted = [...items].sort((a, b) => b.y - a.y); // desc y (haut → bas)
  const rows: RawItem[][] = [[sorted[0]]];

  for (let i = 1; i < sorted.length; i++) {
    const item = sorted[i];
    const lastY = rows[rows.length - 1][0].y;
    if (Math.abs(item.y - lastY) <= yTolerance) {
      rows[rows.length - 1].push(item);
    } else {
      rows.push([item]);
    }
  }
  return rows.map((r) => r.sort((a, b) => a.x - b.x));
}

function isSectionHeader(row: RawItem[]): boolean {
  const isDataRow = row.some((i) => /^\(\d{6,12}\)$/.test(i.str.trim()));
  if (isDataRow) return false;
  const text = row.map((i) => i.str).join(" ");
  return /L.{0,4}NEA\s+\d{3}/i.test(text);
}

// Lignes ferroviaires dont on extrait les LTV (050 = principale, 066 = courte portion).
const TARGET_LINEAS = ["050", "066"];

function targetLineaOf(row: RawItem[]): string | null {
  if (!isSectionHeader(row)) return null;
  const text = row.map((i) => i.str).join(" ");
  for (const ln of TARGET_LINEAS) {
    const re = new RegExp("L.{0,4}NEA\\s+" + ln + "\\b", "i");
    if (re.test(text) || row.some((i) => i.str.trim() === ln)) return ln;
  }
  return null;
}

function isTableHeader(row: RawItem[]): boolean {
  const text = row.map((i) => i.str.toLowerCase()).join(" ");
  return (
    (text.includes("c") && text.includes("digo")) ||
    text.includes("trayecto") ||
    (text.includes("km") && text.includes("ini")) ||
    text.includes("veloc")
  );
}

function isPrimaryDataRow(row: RawItem[]): boolean {
  if (!row.length) return false;
  const first = row.find((i) => i.x < COL.CODE_MAX);
  if (!first) return false;
  return /^\(\d{6,12}\)$/.test(first.str.trim());
}

function extractCode(row: RawItem[]): string {
  const item = row.find((i) => i.x < COL.CODE_MAX);
  if (!item) return "";
  return item.str.trim().replace(/[()]/g, "");
}

function itemsInRange(row: RawItem[], xMin: number, xMax: number): string {
  return row
    .filter((i) => i.x >= xMin && i.x < xMax)
    .map((i) => i.str.trim())
    .filter(Boolean)
    .join(" ");
}

function hasXInRange(row: RawItem[], xMin: number, xMax: number): boolean {
  return row.some(
    (i) => i.x >= xMin && i.x < xMax && i.str.trim().toUpperCase() === "X"
  );
}

function normalizePk(raw: string): string {
  return raw.replace(",", ".");
}

type DisplayRowWithLinea = ManualLtvDisplayRow & { _linea: string };

function buildDisplayRow(parsed: ParsedRow): DisplayRowWithLinea {
  return {
    _linea: parsed.linea,
    code: parsed.code,
    section: parsed.sectionParts.filter(Boolean).join(" / "),
    via: parsed.via,
    kmIni: normalizePk(parsed.kmIni),
    kmFin: normalizePk(parsed.kmFin),
    speed: parsed.speed,
    motivo: parsed.motivo,
    fecha1: parsed.fecha1,
    hora1: parsed.hora1,
    fecha2: parsed.fecha2,
    hora2: parsed.hora2,
    viaCheck: parsed.viaCheck,
    sistema: parsed.sistema,
    soloCabeza: parsed.soloCabeza,
    csv: parsed.csv,
    observaciones: parsed.obsParts.filter(Boolean).join("\n"),
  };
}

function parseDataRows(
  taggedRows: Array<{ row: RawItem[]; linea: string }>
): DisplayRowWithLinea[] {
  const result: DisplayRowWithLinea[] = [];
  let current: ParsedRow | null = null;

  const flush = () => {
    if (current && current.code) {
      result.push(buildDisplayRow(current));
    }
    current = null;
  };

  for (const { row, linea } of taggedRows) {
    if (!row.length) continue;
    if (isTableHeader(row) || isSectionHeader(row)) {
      flush();
      continue;
    }

    if (isPrimaryDataRow(row)) {
      flush();

      const fecha1Raw = itemsInRange(row, COL.FECHA1_MAX - 70, COL.FECHA1_MAX).split(/\s+/);
      const fecha2Raw = itemsInRange(row, COL.FECHA2_MAX - 77, COL.FECHA2_MAX).split(/\s+/);

      current = {
        linea,
        code: extractCode(row),
        sectionParts: [itemsInRange(row, COL.CODE_MAX, COL.SECTION_MAX)],
        via: itemsInRange(row, COL.SECTION_MAX, COL.VIA_MAX),
        kmIni: itemsInRange(row, COL.VIA_MAX, COL.KM_INI_MAX),
        kmFin: itemsInRange(row, COL.KM_INI_MAX, COL.KM_FIN_MAX),
        speed: itemsInRange(row, COL.KM_FIN_MAX, COL.SPEED_MAX),
        motivo: itemsInRange(row, COL.SPEED_MAX, COL.MOTIVO_MAX),
        fecha1: fecha1Raw[0] ?? "",
        hora1: fecha1Raw[1] ?? "",
        fecha2: fecha2Raw[0] ?? "",
        hora2: fecha2Raw[1] ?? "",
        viaCheck: hasXInRange(row, COL.FECHA2_MAX, COL.VIA_CHECK_MAX),
        sistema: hasXInRange(row, COL.VIA_CHECK_MAX, COL.SISTEMA_MAX),
        soloCabeza: hasXInRange(row, COL.SISTEMA_MAX, COL.SOLO_CAB_MAX),
        csv: hasXInRange(row, COL.SOLO_CAB_MAX, COL.CSV_MAX),
        obsParts: [itemsInRange(row, COL.CSV_MAX, 842)],
      };
    } else if (current) {
      const sectionCont = itemsInRange(row, COL.CODE_MAX, COL.SECTION_MAX);
      const obsCont = itemsInRange(row, COL.CSV_MAX, 842);
      if (sectionCont) current.sectionParts.push(sectionCont);
      if (obsCont) current.obsParts.push(obsCont);
    }
  }

  flush();
  return result;
}

export async function parseLtvPdf2026(file: File): Promise<NormalizedLtvFile> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const doc = await Promise.race([
    loadingTask.promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => {
        loadingTask.destroy();
        reject(
          new Error(
            "Extraction impossible (moteur PDF non disponible — vérifiez la connexion réseau)."
          )
        );
      }, 15_000)
    ),
  ]);
  const numPages = doc.numPages;

  const allTargetRows: Array<{ row: RawItem[]; linea: string }> = [];
  let currentLinea: string | null = null;
  let pdfPublishedAt: string | null = null;

  for (let p = 1; p <= numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();

    const rotate: number = (page as any).rotate ?? 0;
    const view: number[] = (page as any).view ?? [0, 0, 595, 842];
    const pw = view[2] - view[0];
    const ph = view[3] - view[1];

    const toVisual = (xPdf: number, yPdf: number) => {
      if (rotate === 90) return { x: yPdf, y: pw - xPdf };
      if (rotate === 270) return { x: ph - yPdf, y: xPdf };
      if (rotate === 180) return { x: pw - xPdf, y: ph - yPdf };
      return { x: xPdf, y: yPdf };
    };

    const items: RawItem[] = (content.items as any[])
      .filter((i) => typeof i.str === "string" && i.str.trim())
      .map((i) => {
        const xPdf = (i.transform as number[])[4];
        const yPdf = (i.transform as number[])[5];
        const { x, y } = toVisual(xPdf, yPdf);
        return { str: i.str as string, x, y };
      });

    if (p === 1 && !pdfPublishedAt) {
      const dateItem = items.find((i) =>
        /^\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}$/.test(i.str.trim())
      );
      if (dateItem) pdfPublishedAt = dateItem.str.trim();
    }

    const rows = groupByRow(items);

    for (const row of rows) {
      if (isSectionHeader(row)) {
        currentLinea = targetLineaOf(row);
        continue;
      }
      if (isTableHeader(row)) continue;
      if (currentLinea) allTargetRows.push({ row, linea: currentLinea });
    }
  }

  const allRows = parseDataRows(allTargetRows);
  const counts = TARGET_LINEAS.map(
    (ln) => `${ln}: ${allRows.filter((r) => r._linea === ln).length}`
  ).join(", ");
  console.log(`[ltvPdf] extraction terminée : ${allRows.length} LTV (${counts})`);

  doc.destroy();

  const now = new Date().toISOString();
  const publishedAtIso = (() => {
    if (!pdfPublishedAt) return now;
    const m = pdfPublishedAt.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/);
    if (!m) return now;
    return `${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:00`;
  })();

  // On retire le tag interne _linea des rows exportées.
  const rows: ManualLtvDisplayRow[] = allRows.map(({ _linea, ...rest }) => {
    void _linea;
    return rest;
  });

  return {
    meta: {
      line: TARGET_LINEAS.join("+"),
      publishedAt: publishedAtIso,
      adif: {
        source: "pdf-2026",
        fetchedAt: now,
        sourceUpdatedAt: publishedAtIso,
        sourceUpdatedFile: file.name,
      },
    },
    rows,
    warnings: [],
  };
}

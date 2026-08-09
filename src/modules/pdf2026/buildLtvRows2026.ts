// src/modules/pdf2026/buildLtvRows2026.ts
//
// Charge les LTV actuelles (même source que `ltv-viewer` et l'ancien export PDF :
// route serverless `/api/ltv/current`, fichier canonique dans lim-logs) et les
// convertit en `PdfLtvRow[]` pour le bloc LTV du PDF — réutilise TEL QUEL le
// composant `PdfBlocLtv` existant (demande utilisateur explicite : ne pas
// reconstruire, brancher les bonnes données). Tableau COMPLET, pas filtré par
// parcours de train (même convention que l'export existant).
import { fetchRemoteLtvNormalizedJson } from "../../data/ligneFTSource";
import { readLtvNormalizedRowsFromFile, readLtvNormalizedFileInfo } from "../ft-editor/utils/ftEditorUtils";
import type { PdfLtvRow } from "../../components/pdf/LimPdf";

export async function fetchLtvRows2026(): Promise<{
  rows: PdfLtvRow[];
  publishedAt: string | null;
  errorMessage: string | null;
}> {
  const result = await fetchRemoteLtvNormalizedJson();
  if (!result.ok) {
    return { rows: [], publishedAt: null, errorMessage: result.errorMessage };
  }
  const editorRows = readLtvNormalizedRowsFromFile(result.data);
  const fileInfo = readLtvNormalizedFileInfo(result.data);
  const rows: PdfLtvRow[] = editorRows.map((r) => ({
    code: r.code,
    section: r.section,
    via: r.via,
    kmIni: r.kmIni,
    kmFin: r.kmFin,
    speed: r.speed,
    motivo: r.motivo,
    fecha1: r.fecha1,
    hora1: r.hora1,
    fecha2: r.fecha2,
    hora2: r.hora2,
    viaCheck: r.viaCheck,
    sistema: r.sistema,
    soloCabeza: r.soloCabeza,
    csv: r.csv,
    observaciones: r.observaciones,
  }));
  return { rows, publishedAt: fileInfo?.publishedAt ?? null, errorMessage: null };
}

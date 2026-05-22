import { Document, Page, StyleSheet, Font, Text, View } from "@react-pdf/renderer";

Font.register({
  family: "DejaVu",
  fonts: [
    {
      src: "https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.3/ttf/DejaVuSans.ttf",
      fontWeight: "normal",
    },
    {
      src: "https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.3/ttf/DejaVuSans-Bold.ttf",
      fontWeight: "bold",
    },
    {
      src: "https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.3/ttf/DejaVuSans-BoldOblique.ttf",
      fontWeight: "bold",
      fontStyle: "italic",
    },
  ],
});
import PdfBlocInfo from "./PdfBlocInfo";
import PdfBlocLtv from "./PdfBlocLtv";
import PdfBlocFt from "./PdfBlocFt";

export type PdfFtRow = {
  id: string;
  type: "data" | "note" | "context";
  bloqueo: string;
  vmax: string;
  sitKm: string;
  dependencia: string;
  com: string;
  hora: string;
  tecn: string;
  conc: string;
  radio: string;
  rampCaract: string;
  etcs: string;
  csv: boolean;
  notes: string[];
  ltvNote: string;
  // champs calculés pour le rendu
  showBloqueo: boolean;
  showBloqueoBar: boolean;
  showBloqueoText: boolean;
  bloqueoTextBelow: string; // texte à afficher dans la ligne intermédiaire suivante
  showRadio: boolean;
  showRadioBar: boolean;
  showRadioText: boolean;
  radioTextBelow: string;
  showVBar: boolean;
  showVmaxText: boolean;
  vmaxDisplayValue: string;
  vmaxTextBelow: string;
  showRcBar: boolean;
  showRcText: boolean;
  rampCaractTextBelow: string;
  highlight: boolean;
  csvHighlight: "none" | "lower" | "full" | "upper";
  pkInterne: string; // PK interne monotone (pour le matching LTV)
};

export type PdfLtvRow = {
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

export type LimPdfProps = {
  trainNumber: string;
  categorieEspagne: string;
  origine: string;
  destination: string;
  dateFormatted: string;
  composition: string;
  materiel: string;
  ligne: string;
  longueur: number | undefined;
  masse: number | undefined;
  ltvRows: PdfLtvRow[];
  ftRows: PdfFtRow[];
};

// ── Constantes de hauteur (en points) ────────────────────────────────────────

const PAGE_MARGIN = 20;
const A4_H = 842;
const FOOTER_H = 14; // footer absolu en bas (7pt texte + 6pt bottom + marge)
const PAGE_PADDING_BOTTOM = PAGE_MARGIN + FOOTER_H; // 34 pt — react-pdf réserve cet espace sous le contenu
const USABLE_H = A4_H - PAGE_MARGIN - PAGE_PADDING_BOTTOM; // 788 pt

const BLOC_INFO_H = 95;
const BLOC_LTV_BASE_H = 58; // en-tête + marges fixes du bloc LTV (marginBottom: 4 inclus)
const BLOC_LTV_ROW_H = 15; // hauteur par ligne LTV
const BLOC_GAP = 6;         // espace entre blocs

const FT_HEADER_H = 28;  // hauteur de la ligne d'en-tête des colonnes FT
const FT_FOOTER_H = 20;  // hauteur de la ligne footer composition/longueur
const FT_ROW_H = 16;     // hauteur de base d'une ligne data ou note
const FT_LTV_LINE_H = 7; // hauteur par ligne LTV dans une ligne intermédiaire
const FT_NOTE_LINE_H = 7; // hauteur par ligne de note dans une note row

// ── Estimation de hauteur par ligne FT ───────────────────────────────────────

function estimateFtUnitH(row: PdfFtRow, allRows: PdfFtRow[], i: number): number {
  // Hauteur de la ligne elle-même
  const rowH =
    row.type === "note"
      ? Math.max(
          FT_ROW_H,
          row.notes
            .flatMap((n) => n.split("\n").filter((l) => l.trim() !== ""))
            .length * FT_NOTE_LINE_H
        )
      : FT_ROW_H;

  // Hauteur de la ligne intermédiaire qui suit (uniquement pour les data rows)
  let interH = 0;
  if (row.type === "data") {
    const hasNextData = allRows.slice(i + 1).some((r) => r.type === "data");
    if (hasNextData) {
      const ltvLines = row.ltvNote
        .split("\n")
        .filter((l) => l.trim() !== "").length;
      interH = Math.max(FT_ROW_H, ltvLines * FT_LTV_LINE_H);
    }
  }

  return rowH + interH;
}

// ── Réparation des groupes coupés par un saut de page ────────────────────────
// Quand la ligne "texte" d'un groupe (bloqueo/radio/rampCaract) se retrouve sur
// la page suivante, on force l'affichage sur la dernière ligne du groupe visible
// dans ce segment.

function fixSegmentGroupText(rows: PdfFtRow[]): PdfFtRow[] {
  const fixed = rows.map((r) => ({ ...r }));

  const configs = [
    { valKey: "bloqueo" as const,    textKey: "showBloqueoText" as const },
    { valKey: "radio" as const,      textKey: "showRadioText" as const },
    { valKey: "rampCaract" as const, textKey: "showRcText" as const },
  ];

  for (const { valKey, textKey } of configs) {
    // Indices des lignes data dans ce segment (les note rows n'appartiennent pas aux groupes)
    const dataIdxs = fixed.reduce<number[]>(
      (acc, row, i) => (row.type === "data" ? [...acc, i] : acc),
      []
    );

    let groupStart = 0;

    const flushGroup = (endGI: number) => {
      const val = fixed[dataIdxs[groupStart]][valKey] as string;
      if (!val) return;
      const idxs = dataIdxs.slice(groupStart, endGI + 1);
      if (!idxs.some((i) => fixed[i][textKey])) {
        const mid = Math.floor((idxs.length - 1) / 2);
        fixed[idxs[mid]][textKey] = true;
      }
    };

    for (let gi = 1; gi < dataIdxs.length; gi++) {
      if (
        (fixed[dataIdxs[gi]][valKey] as string) !==
        (fixed[dataIdxs[gi - 1]][valKey] as string)
      ) {
        flushGroup(gi - 1);
        groupStart = gi;
      }
    }
    if (dataIdxs.length > 0) flushGroup(dataIdxs.length - 1);
  }

  return fixed;
}

// ── Suppression des barres orphelines aux limites de page ────────────────────
// Si la dernière ligne data d'un segment a des barres (transition de groupe juste
// avant un saut de page), on la déplace au début du segment suivant, puis on
// supprime les barres de la première ligne data de chaque segment (rien au-dessus).

function createContextRow(prevRows: PdfFtRow[], firstNewRow: PdfFtRow, segIdx: number): PdfFtRow {
  const prevDataRows = prevRows.filter((r) => r.type === "data");
  const last = prevDataRows[prevDataRows.length - 1];
  const lastVmaxRow = [...prevRows].reverse().find((r) => r.showVmaxText);
  const lastVmax = lastVmaxRow?.vmaxDisplayValue ?? "";

  // La ligne contexte hérite du surlignage de la première ligne data en dessous
  const highlight = firstNewRow.highlight;

  return {
    id: `__ctx_${segIdx}__`,
    type: "context",
    bloqueo: last.bloqueo,
    vmax: lastVmax,
    sitKm: "", dependencia: "", com: "", hora: "", tecn: "", conc: "", etcs: "",
    radio: last.radio,
    rampCaract: last.rampCaract,
    csv: false, notes: [], ltvNote: "",
    showBloqueo: last.bloqueo !== "",
    showBloqueoBar: false,
    showBloqueoText: firstNewRow.showBloqueoBar && last.bloqueo !== "",
    bloqueoTextBelow: "",
    showRadio: last.radio !== "",
    showRadioBar: false,
    showRadioText: firstNewRow.showRadioBar && last.radio !== "",
    radioTextBelow: "",
    showVBar: false,
    showVmaxText: firstNewRow.showVBar && lastVmax !== "",
    vmaxDisplayValue: lastVmax,
    vmaxTextBelow: "",
    showRcBar: false,
    showRcText: firstNewRow.showRcBar && last.rampCaract !== "",
    rampCaractTextBelow: "",
    highlight,
    csvHighlight: firstNewRow.csvHighlight !== "none" ? "full" : "none", pkInterne: "",
  };
}

function fixSegmentBars(segments: PdfFtRow[][]): PdfFtRow[][] {
  const result = segments.map((seg) => seg.map((r) => ({ ...r })));
  const barFields = ["showBloqueoBar", "showRadioBar", "showRcBar", "showVBar"] as const;
  const hasAnyBar = (r: PdfFtRow) => barFields.some((f) => r[f]);

  // Étape 1 : déplacer les lignes avec barre en fin de segment vers le segment suivant
  for (let s = 0; s < result.length - 1; s++) {
    let lastDataIdx = -1;
    for (let i = result[s].length - 1; i >= 0; i--) {
      if (result[s][i].type === "data") { lastDataIdx = i; break; }
    }
    const dataCount = result[s].filter((r) => r.type === "data").length;
    if (lastDataIdx !== -1 && hasAnyBar(result[s][lastDataIdx]) && dataCount > 1) {
      const moved = result[s].splice(lastDataIdx);
      result[s + 1].unshift(...moved);
    }
  }

  // Étape 2 : insérer une ligne de contexte avant chaque première barre de segment
  for (let s = 1; s < result.length; s++) {
    const firstDataIdx = result[s].findIndex((r) => r.type === "data");
    if (firstDataIdx === -1) continue;
    const firstDataRow = result[s][firstDataIdx];
    if (!hasAnyBar(firstDataRow)) continue;
    const prevDataRows = result[s - 1].filter((r) => r.type === "data");
    if (prevDataRows.length === 0) continue;
    const ctx = createContextRow(result[s - 1], firstDataRow, s);
    result[s].splice(firstDataIdx, 0, ctx);
  }

  return result;
}

// ── Découpage des lignes FT en segments de page ───────────────────────────────

function splitFtRows(
  ftRows: PdfFtRow[],
  page1Available: number,
  pageNAvailable: number
): PdfFtRow[][] {
  if (ftRows.length === 0) return [[]];

  const segments: PdfFtRow[][] = [];
  let current: PdfFtRow[] = [];
  let remaining = page1Available;

  for (let i = 0; i < ftRows.length; i++) {
    const unitH = estimateFtUnitH(ftRows[i], ftRows, i);

    if (current.length > 0 && remaining < unitH) {
      segments.push(current);
      current = [ftRows[i]];
      remaining = pageNAvailable - unitH;
    } else {
      current.push(ftRows[i]);
      remaining -= unitH;
    }
  }

  if (current.length > 0) segments.push(current);
  return segments;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  page: {
    paddingTop: PAGE_MARGIN,
    paddingBottom: PAGE_PADDING_BOTTOM,
    paddingHorizontal: PAGE_MARGIN,
    fontFamily: "Helvetica",
    backgroundColor: "#ffffff",
  },
  pageFooter: {
    position: "absolute",
    bottom: 6,
    left: PAGE_MARGIN,
    right: PAGE_MARGIN,
    textAlign: "center",
    fontSize: 7,
    fontFamily: "Helvetica-Oblique",
    color: "#9ca3af",
  },
});

// ── Composant ─────────────────────────────────────────────────────────────────

export default function LimPdf({
  trainNumber,
  categorieEspagne,
  origine,
  destination,
  dateFormatted,
  composition,
  materiel,
  ligne,
  longueur,
  masse,
  ltvRows,
  ftRows,
}: LimPdfProps) {
  const ltvBlocH = BLOC_LTV_BASE_H + Math.max(ltvRows.length, 1) * BLOC_LTV_ROW_H;

  const page1Available =
    USABLE_H
    - BLOC_INFO_H - BLOC_GAP
    - ltvBlocH - BLOC_GAP
    - FT_HEADER_H
    - FT_FOOTER_H;

  // FT_ROW_H soustrait en marge pour le context row inséré par fixSegmentBars après le découpage
  const pageNAvailable = USABLE_H - FT_HEADER_H - FT_FOOTER_H - FT_ROW_H;

  const segments = fixSegmentBars(
    splitFtRows(ftRows, page1Available, pageNAvailable)
  ).map(fixSegmentGroupText);

  return (
    <Document>
      {/* Page 1 : info + LTV + premier segment FT */}
      <Page size="A4" style={styles.page}>
        <PdfBlocInfo
          trainNumber={trainNumber}
          categorieEspagne={categorieEspagne}
          origine={origine}
          destination={destination}
          dateFormatted={dateFormatted}
          composition={composition}
          materiel={materiel}
          ligne={ligne}
          longueur={longueur}
          masse={masse}
        />
        <PdfBlocLtv rows={ltvRows} />
        <PdfBlocFt
          rows={segments[0] ?? []}
          composition={composition}
          longueur={longueur}
          masse={masse}
          showTableFooter={segments.length === 1}
        />
        <Text
          style={styles.pageFooter}
          render={({ pageNumber, totalPages }) =>
            `LIM ${trainNumber} du ${dateFormatted} - Page ${pageNumber} sur ${totalPages}`
          }
        />
      </Page>

      {/* Pages de continuation : en-tête FT + segment */}
      {segments.slice(1).map((seg, idx) => (
        <Page key={idx + 1} size="A4" style={styles.page}>
          <PdfBlocFt
            rows={seg}
            composition={composition}
            longueur={longueur}
            masse={masse}
            showTableFooter={idx === segments.length - 2}
          />
          <Text
            style={styles.pageFooter}
            render={({ pageNumber, totalPages }) =>
              `LIM ${trainNumber} du ${dateFormatted} - Page ${pageNumber} sur ${totalPages}`
            }
          />
        </Page>
      ))}
    </Document>
  );
}

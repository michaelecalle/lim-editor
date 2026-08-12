// src/modules/pdf2026/paginateFt2026.ts
//
// Pagination du bloc FT au format 2026 — porte les MÊMES règles que l'ancien
// pipeline (`../../components/pdf/LimPdf.tsx::splitFtRows/fixSegmentBars/
// fixSegmentGroupText`, lignes ~124-303), confirmées applicables telles quelles
// par l'utilisateur (09/08, « c'est exactement ça »). Seules les CONSTANTES de
// hauteur changent (nouveau bloc info, nouvel en-tête FT à une seule ligne) —
// mesurées empiriquement sur un rendu réel (bandes de bordure détectées par
// analyse pixel), pas estimées à l'oeil. Étendu pour couvrir ETCS (barre +
// réaffichage de groupe par page), absent de l'ancien pipeline.
import type { PdfFtRow2026 } from "./buildFtRows2026";
import type { PdfLtvRow } from "../../components/pdf/LimPdf";

// ── Constantes de hauteur (en points) ────────────────────────────────────────
// Mesurées sur un rendu réel (train 9705, scale 4, détection des bordures
// pleine-largeur) : bloc info 20.25→134.00pt (≈114pt), en-tête FT 219.75→239.62pt
// (≈20pt, cohérent avec `headerRow.minHeight:20` dans PdfBlocFt2026.tsx).
const PAGE_MARGIN = 20;
const A4_H = 842;
// Page 2026 actuelle : padding uniforme 20pt, PAS de pied de page numéroté
// (contrairement à l'ancien pipeline) — pas de marge basse à réserver en plus.
const USABLE_H = A4_H - PAGE_MARGIN - PAGE_MARGIN; // 802 pt

const BLOC_INFO_2026_H = 114;
const BLOC_LTV_BASE_H = 58; // formule du bloc LTV réutilisé tel quel de l'ancien pipeline
const BLOC_LTV_ROW_H = 15;
const BLOC_GAP = 6;

const FT_HEADER_2026_H = 20; // en-tête FT à une seule ligne (vs 28 dans l'ancien, 2 lignes)
const FT_ROW_H = 16; // dataRow / intermediateRow minHeight (PdfBlocFt2026.tsx)
const FT_NOTE_LINE_H = 7; // hauteur par ligne de note rouge OU note LTV (fontSize 6, italique)

// Colonne "(CÓD.) Trayecto / Estación" du bloc LTV (`PdfBlocLtv.tsx::COL.section`,
// 118pt) — SEULE colonne à largeur fixe et texte non protégé contre le retour à la
// ligne (les autres colonnes texte-libre, motivo/observaciones, sont auto-élargies
// à la valeur la plus longue). Avec de vraies LTV (trajets combinés du type
// "LIMITE ADIF - LFPSA- / FIGUERES-VILAFANT"), cette colonne passe fréquemment sur
// 2 lignes — jamais couvert tant que testé avec des tableaux LTV vides (cf. mémoire
// projet). Mesuré empiriquement (12/08) sur un rendu réel du bloc avec les 10
// vraies LTV du train 9714 (`PdfBlocLtv.tsx` isolé, positions des lignes de texte
// extraites via pdfjs-dist) : une ligne de 30 caractères tient sur 1 ligne, une de
// 41 caractères passe à 2 — chaque ligne supplémentaire ajoute ≈5.5pt à la hauteur
// réelle de la ligne (mesuré : 14.4-15pt/ligne simple vs 19.9-20.5pt/ligne à 2
// niveaux). Repli conservateur si aucune ligne ne dépasse (comportement identique
// à avant ce correctif). Seuil réel confirmé sur les 10 lignes du train 9714 :
// 30 caractères tiennent sur 1 ligne, 32 passent à 2 (soit ≈3.65pt/caractère,
// PAS le `CHAR_W = 3.6` conservateur utilisé par `PdfBlocLtv.tsx::autoWidth` pour
// les colonnes auto-élargies — cohérent avec l'observation que même CES colonnes
// (ex. "motivo") ont débordé sur 2 lignes lors de la même mesure, donc `CHAR_W`
// legèrement optimiste là aussi — non corrigé ici, seule la pagination compte.
const LTV_SECTION_COL_W = 118;
const LTV_SECTION_USABLE_W = LTV_SECTION_COL_W - 4; // padding 2pt de chaque côté
const LTV_SECTION_CHAR_W = 3.65; // mesuré empiriquement, cf. commentaire ci-dessus
const LTV_ROW_EXTRA_LINE_H = 5.5; // mesuré empiriquement, cf. commentaire ci-dessus

function estimateLtvRowH(row: PdfLtvRow): number {
  const sectionLines = Math.max(1, Math.ceil((row.section.length * LTV_SECTION_CHAR_W) / LTV_SECTION_USABLE_W));
  return BLOC_LTV_ROW_H + (sectionLines - 1) * LTV_ROW_EXTRA_LINE_H;
}

export function computePage1Available(ltvRows: PdfLtvRow[]): number {
  const ltvRowsH = ltvRows.length === 0 ? BLOC_LTV_ROW_H : ltvRows.reduce((sum, r) => sum + estimateLtvRowH(r), 0);
  const ltvBlocH = BLOC_LTV_BASE_H + ltvRowsH;
  return USABLE_H - BLOC_INFO_2026_H - BLOC_GAP - ltvBlocH - BLOC_GAP - FT_HEADER_2026_H;
}

export function computePageNAvailable(): number {
  // FT_ROW_H réservé en marge pour l'éventuelle ligne contexte insérée par
  // fixSegmentBars2026 après le découpage (même principe que l'ancien pipeline).
  return USABLE_H - FT_HEADER_2026_H - FT_ROW_H;
}

// ── Estimation de hauteur par ligne FT ───────────────────────────────────────

function estimateFtUnitH(row: PdfFtRow2026, allRows: PdfFtRow2026[], i: number): number {
  const rowH =
    row.type === "note"
      ? Math.max(
          FT_ROW_H,
          row.notes.flatMap((n) => n.split("\n").filter((l) => l.trim() !== "")).length * FT_NOTE_LINE_H
        )
      : FT_ROW_H;

  // Ligne intermédiaire qui suit (uniquement pour les data rows avec une
  // prochaine data row) — grandit si la note LTV ancrée sur cette ligne tient
  // sur plusieurs lignes (même principe que l'ancien pipeline, `FT_LTV_LINE_H`).
  let interH = 0;
  if (row.type === "data") {
    const hasNextData = allRows.slice(i + 1).some((r) => r.type === "data");
    if (hasNextData) {
      const ltvLines = row.ltvNote.split("\n").filter((l) => l.trim() !== "").length;
      interH = Math.max(FT_ROW_H, ltvLines * FT_NOTE_LINE_H);
    }
  }

  return rowH + interH;
}

// ── Découpage des lignes FT en segments de page ───────────────────────────────

function splitFtRows(rows: PdfFtRow2026[], page1Available: number, pageNAvailable: number): PdfFtRow2026[][] {
  if (rows.length === 0) return [[]];

  const segments: PdfFtRow2026[][] = [];
  let current: PdfFtRow2026[] = [];
  let remaining = page1Available;

  for (let i = 0; i < rows.length; i++) {
    const unitH = estimateFtUnitH(rows[i], rows, i);

    if (current.length > 0 && remaining < unitH) {
      segments.push(current);
      current = [rows[i]];
      remaining = pageNAvailable - unitH;
    } else {
      current.push(rows[i]);
      remaining -= unitH;
    }
  }

  if (current.length > 0) segments.push(current);
  return segments;
}

// ── Réparation des barres orphelines aux limites de page ────────────────────
// Une page ne se termine jamais sur une ligne qui ouvre une nouvelle zone
// (Bloc/Radio/Rampe/Vmax/ETCS) ; cette ligne est déplacée au début de la page
// suivante, précédée d'une ligne "contexte" qui rappelle les valeurs de zone
// en cours (sans KM/établissement/horaires).

function createContextRow(prevRows: PdfFtRow2026[], firstNewRow: PdfFtRow2026, segIdx: number): PdfFtRow2026 {
  const prevDataRows = prevRows.filter((r) => r.type === "data");
  const last = prevDataRows[prevDataRows.length - 1];
  const lastVmaxRow = [...prevRows].reverse().find((r) => r.showVmaxText);
  const lastVmax = lastVmaxRow?.vmaxDisplayValue ?? "";

  return {
    id: `__ctx_${segIdx}__`,
    type: "data",
    bloc: last.bloc,
    vmax: lastVmax,
    csv: false,
    km: "",
    etablissement: "",
    arrivee: "",
    passage: "",
    depart: "",
    radio: last.radio,
    rampe: last.rampe,
    etcs: last.etcs,
    notes: [],
    ltvNote: "",
    notesSurlignees: false,
    showBlocBar: false,
    showBlocText: firstNewRow.showBlocBar && last.bloc !== "",
    blocTextBelow: "",
    showRadioBar: false,
    showRadioText: firstNewRow.showRadioBar && last.radio !== "",
    radioTextBelow: "",
    showRampeBar: false,
    showRampeText: firstNewRow.showRampeBar && last.rampe !== "",
    rampeTextBelow: "",
    showVBar: false,
    showVmaxText: firstNewRow.showVBar && lastVmax !== "",
    vmaxDisplayValue: lastVmax,
    vmaxTextBelow: "",
    showEtcsBar: false,
    showEtcsText: firstNewRow.showEtcsBar && last.etcs !== "",
    etcsTextBelow: "",
    highlight: firstNewRow.highlight,
    csvHighlight: firstNewRow.csvHighlight !== "none" ? "full" : "none",
    crossingNumero: "",
  };
}

function fixSegmentBars(segments: PdfFtRow2026[][]): PdfFtRow2026[][] {
  const result = segments.map((seg) => seg.map((r) => ({ ...r })));
  const barFields = ["showBlocBar", "showRadioBar", "showRampeBar", "showVBar", "showEtcsBar"] as const;
  const hasAnyBar = (r: PdfFtRow2026) => barFields.some((f) => r[f]);

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

// ── Réaffichage du libellé de zone par page ──────────────────────────────────
// Si une zone (Bloc/Radio/Rampe/ETCS/Vmax) est coupée entre deux pages, sa
// valeur doit apparaître SUR CHAQUE page, correctement centrée par rapport à
// la portion visible sur CETTE page — pas seulement « au moins une fois »
// (bug signalé par l'utilisateur le 09/08 : une zone Vmax dont la position
// milieu globale tombait sur la page 2 n'apparaissait PAS du tout sur la
// page 1 ; et quand une valeur était bien réaffichée par la 1re version de ce
// correctif, elle restait positionnée à l'ancienne position "milieu global"
// au lieu d'être recentrée sur la portion locale, donc visuellement décalée).
// ⚠️ Donc TOUJOURS recalculer le milieu à partir des lignes LOCALES à ce
// segment (pas seulement "si absent") — un groupe non coupé retombe sur le
// même résultat que le calcul global d'origine, aucune régression.

function fixSegmentGroupText(rows: PdfFtRow2026[]): PdfFtRow2026[] {
  const fixed = rows.map((r) => ({ ...r }));
  const dataIdxs = fixed.reduce<number[]>((acc, row, i) => (row.type === "data" ? [...acc, i] : acc), []);

  // Bloc/Radio/Rampe/ETCS : valeur nue, jamais vide sur une ligne de donnée
  // (les notes sont déjà exclues de dataIdxs) — comparaison directe. Réplique
  // le même branchement hasBar&&len===1 → texte reporté sous la ligne
  // (`xxxTextBelow`) que `buildFtRows2026.ts::buildGroupSets`, sinon un
  // groupe local d'une seule ligne affiche la valeur EN PLUS de celle déjà
  // posée par le calcul global d'origine (dupliquée sur deux lignes
  // adjacentes — même bug que celui trouvé sur Vmax, corrigé en même temps).
  const simpleConfigs = [
    { valKey: "bloc" as const, textKey: "showBlocText" as const, belowKey: "blocTextBelow" as const },
    { valKey: "radio" as const, textKey: "showRadioText" as const, belowKey: "radioTextBelow" as const },
    { valKey: "rampe" as const, textKey: "showRampeText" as const, belowKey: "rampeTextBelow" as const },
    { valKey: "etcs" as const, textKey: "showEtcsText" as const, belowKey: "etcsTextBelow" as const },
  ];

  for (const { valKey, textKey, belowKey } of simpleConfigs) {
    dataIdxs.forEach((i) => { fixed[i][textKey] = false; fixed[i][belowKey] = ""; });

    let groupStart = 0;
    const flushGroup = (endGI: number) => {
      const val = fixed[dataIdxs[groupStart]][valKey];
      if (!val) return;
      const idxs = dataIdxs.slice(groupStart, endGI + 1);
      const len = idxs.length;
      const hasBar = groupStart > 0 && groupStart + len < dataIdxs.length;
      if (hasBar && len === 1) {
        fixed[idxs[0]][belowKey] = val;
      } else {
        const mid = hasBar && len > 1 ? 1 + Math.floor((len - 2) / 2) : Math.floor((len - 1) / 2);
        fixed[idxs[mid]][textKey] = true;
      }
    };
    for (let gi = 1; gi < dataIdxs.length; gi++) {
      if (fixed[dataIdxs[gi]][valKey] !== fixed[dataIdxs[gi - 1]][valKey]) {
        flushGroup(gi - 1);
        groupStart = gi;
      }
    }
    if (dataIdxs.length > 0) flushGroup(dataIdxs.length - 1);
  }

  // Vmax : clé = couple (valeur, csv), valeurs vides SAUTÉES (ne cassent pas
  // le groupe) — même règle que `buildFtRows2026.ts::vmaxGroups`. Réplique
  // aussi le même branchement hasBar&&len===1 → texte reporté SOUS la ligne
  // (`vmaxTextBelow`) plutôt qu'en ligne — sinon un groupe local d'une seule
  // ligne (transitions courtes très fréquentes) se retrouve avec la valeur
  // affichée EN PLUS de celle déjà posée par le calcul global d'origine,
  // dupliquée sur deux lignes adjacentes (bug trouvé en vérifiant à l'écran :
  // "140" apparaissait deux fois de suite). `hasBar` est réévalué LOCALEMENT
  // (`start > 0` = pas la 1re ligne de CETTE page) — sémantiquement correct :
  // un groupe qui commence en tout début de page est une continuation, pas
  // une vraie transition visible sur cette page.
  dataIdxs.forEach((i) => { fixed[i].showVmaxText = false; fixed[i].vmaxTextBelow = ""; });
  {
    const keyOf = (i: number) => (fixed[i].vmax === "" ? "" : `${fixed[i].vmax}|${fixed[i].csv}`);
    const groups: { start: number; len: number }[] = [];
    let gs = 0;
    let lastKey = "";
    for (let i = 0; i < dataIdxs.length; i++) {
      const key = keyOf(dataIdxs[i]);
      if (i > 0 && key !== "" && key !== lastKey) {
        groups.push({ start: gs, len: i - gs });
        gs = i;
      }
      if (i === dataIdxs.length - 1) groups.push({ start: gs, len: dataIdxs.length - gs });
      if (key !== "") lastKey = key;
    }
    for (const { start, len } of groups) {
      const idxsInGroup = dataIdxs.slice(start, start + len);
      const repIdx = idxsInGroup.find((i) => fixed[i].vmax !== "");
      if (repIdx === undefined) continue;
      const value = fixed[repIdx].vmax;
      const hasBar = start > 0;
      if (hasBar && len === 1) {
        fixed[dataIdxs[start]].vmaxTextBelow = value;
      } else {
        const mid = hasBar && len > 1 ? 1 + Math.floor((len - 2) / 2) : Math.floor((len - 1) / 2);
        const targetIdx = dataIdxs[start + mid];
        fixed[targetIdx].showVmaxText = true;
        fixed[targetIdx].vmaxDisplayValue = value;
      }
    }
  }

  return fixed;
}

// ── Point d'entrée ────────────────────────────────────────────────────────────

export function paginateFtRows2026(rows: PdfFtRow2026[], ltvRows: PdfLtvRow[]): PdfFtRow2026[][] {
  const page1Available = computePage1Available(ltvRows);
  const pageNAvailable = computePageNAvailable();
  return fixSegmentBars(splitFtRows(rows, page1Available, pageNAvailable)).map(fixSegmentGroupText);
}

// src/modules/pdf2026/buildFtRows2026.ts
//
// Construit les lignes du bloc FT (tableau principal) au format 2026, à partir des
// données ligne (LignePoint[]) + horaires du train. Duplique fidèlement la logique
// de `buildPdfPropsForTrain.ts::buildFtRows` (barres de zone Bloc/Radio/Rampe/Vmax,
// détection + rendu des zones CSV) — PAS réécrite, l'utilisateur a confirmé cette
// logique fiable et coûteuse à refaire ; seule la construction des lignes horaires
// change (Arr/Pass/Dép explicites, plus de calcul com/hora/tecn/conc).
// ⚠️ Copié plutôt qu'importé de l'ancien fichier (non exporté, et principe de
// coexistence : ne pas toucher au pipeline ancien format en le touchant/réexportant).
// ⚠️ PREMIER JET SANS PAGINATION (demande explicite utilisateur, 08/08 très tard) :
// pas de découpage manuel en pages, pas de lignes "context" de raccord — react-pdf
// gère un débordement multi-page basique par défaut. La logique de pagination
// existante (espace restant vs hauteur d'en-tête dynamique, pas de coupure avant une
// barre) sera reportée ici avec adaptation à la nouvelle hauteur d'en-tête.
import { detectCsvZones } from "../ft-editor/utils/csvZoneDetection";
import type { PdfLtvRow } from "../../components/pdf/LimPdf";

type LignePointLike = {
  type?: "note";
  surligne?: boolean; // note uniquement
  bloc: string;
  vmax: string;
  csv?: boolean;
  radio: string;
  rampe: string;
  etcs: string;
  etablissement: string;
  pkAdif: string;
  pkLfp: string;
  pkRac: string;
  pkRfn: string;
  texte?: string; // note uniquement
};

export type PdfFtRow2026 = {
  id: string;
  type: "data" | "note";
  bloc: string;
  vmax: string;
  csv: boolean;
  km: string;
  etablissement: string;
  arrivee: string;
  passage: string;
  depart: string;
  radio: string;
  rampe: string;
  etcs: string;
  notes: string[];
  notesSurlignees: boolean;
  ltvNote: string;
  showBlocBar: boolean;
  showBlocText: boolean;
  blocTextBelow: string;
  showRadioBar: boolean;
  showRadioText: boolean;
  radioTextBelow: string;
  showRampeBar: boolean;
  showRampeText: boolean;
  rampeTextBelow: string;
  showVBar: boolean;
  showVmaxText: boolean;
  vmaxDisplayValue: string;
  vmaxTextBelow: string;
  showEtcsBar: boolean;
  showEtcsText: boolean;
  etcsTextBelow: string;
  highlight: boolean;
  csvHighlight: "none" | "lower" | "full" | "upper";
};

// PK empilés (transition réseau) — même principe que `kmValues()` de
// `Normalise2026Tab.tsx` : les valeurs non vides, dans l'ordre du sens de parcours.
function kmDisplay(p: LignePointLike, direction: "sudNord" | "nordSud"): string {
  const order =
    direction === "sudNord"
      ? (["pkAdif", "pkLfp", "pkRac", "pkRfn"] as const)
      : (["pkRfn", "pkRac", "pkLfp", "pkAdif"] as const);
  return order
    .map((f) => p[f])
    .filter((v) => v !== "")
    .join("\n");
}

export function buildFtRows2026(
  allPoints: LignePointLike[],
  direction: "sudNord" | "nordSud",
  origine: string,
  destination: string,
  horaires: Record<string, { arrivee: string; passage: string; depart: string }>,
  ltvRows: PdfLtvRow[] = []
): PdfFtRow2026[] {
  const identityKey = (p: LignePointLike) => `${p.pkAdif}|${p.pkLfp}|${p.pkRac}|${p.pkRfn}`;

  // Tronque la séquence entre origine et destination (notes comprises), comme
  // l'ancien pipeline — recherche par nom d'établissement, premier/dernier match.
  const startIdx = allPoints.findIndex((p) => p.type !== "note" && p.etablissement === origine);
  const endIdxFromEnd = [...allPoints].reverse().findIndex((p) => p.type !== "note" && p.etablissement === destination);
  const endIdx = endIdxFromEnd === -1 ? -1 : allPoints.length - 1 - endIdxFromEnd;
  const points = startIdx !== -1 && endIdx !== -1 && endIdx >= startIdx ? allPoints.slice(startIdx, endIdx + 1) : allPoints;

  const rawRows: Omit<
    PdfFtRow2026,
    | "showBlocBar" | "showBlocText" | "blocTextBelow"
    | "showRadioBar" | "showRadioText" | "radioTextBelow"
    | "showRampeBar" | "showRampeText" | "rampeTextBelow"
    | "showVBar" | "showVmaxText" | "vmaxDisplayValue" | "vmaxTextBelow"
    | "showEtcsBar" | "showEtcsText" | "etcsTextBelow"
    | "highlight" | "csvHighlight"
  >[] = points.map((p, i) => {
    if (p.type === "note") {
      return {
        id: `note-${i}`,
        type: "note",
        bloc: "", vmax: "", csv: false, km: "", etablissement: "",
        arrivee: "", passage: "", depart: "", radio: "", rampe: "", etcs: "",
        notes: [p.texte ?? ""],
        notesSurlignees: p.surligne === true,
        ltvNote: "",
      };
    }
    const h = horaires[identityKey(p)] ?? { arrivee: "", passage: "", depart: "" };
    return {
      id: `pt-${i}`,
      type: "data",
      bloc: p.bloc, vmax: p.vmax, csv: p.csv === true, km: kmDisplay(p, direction),
      etablissement: p.etablissement,
      arrivee: h.arrivee, passage: h.passage, depart: h.depart,
      radio: p.radio, rampe: p.rampe, etcs: p.etcs,
      notes: [],
      notesSurlignees: false,
      ltvNote: "",
    };
  });

  const dataRowsOnly = rawRows.filter((r) => r.type === "data");
  const dataRowCount = dataRowsOnly.length;

  // --- Groupes de zone (Bloc/Radio/Rampe) : barre au 1er changement + texte au
  // milieu du run (ou reporté sur la ligne intermédiaire suivante si run de 1 seul
  // point avec barre) — logique identique à l'ancien pipeline, cf. commentaire d'en-tête.
  const buildGroups = (getVal: (r: (typeof dataRowsOnly)[0]) => string) => {
    const groups: { start: number; len: number }[] = [];
    let gs = 0;
    for (let i = 1; i <= dataRowsOnly.length; i++) {
      if (i === dataRowsOnly.length || getVal(dataRowsOnly[i]) !== getVal(dataRowsOnly[i - 1])) {
        groups.push({ start: gs, len: i - gs });
        gs = i;
      }
    }
    return groups;
  };

  const buildGroupSets = (
    groups: { start: number; len: number }[],
    middleIds: Set<string>,
    textBelowMap: Map<string, string>,
    getVal: (r: (typeof dataRowsOnly)[0]) => string
  ) => {
    for (const { start, len } of groups) {
      const hasBar = start > 0 && start < dataRowCount - 1;
      if (hasBar && len === 1) {
        textBelowMap.set(dataRowsOnly[start].id, getVal(dataRowsOnly[start]));
      } else {
        const mid = hasBar && len > 1 ? 1 + Math.floor((len - 2) / 2) : Math.floor((len - 1) / 2);
        middleIds.add(dataRowsOnly[start + mid].id);
      }
    }
  };

  const blocMiddleIds = new Set<string>();
  const blocTextBelowMap = new Map<string, string>();
  buildGroupSets(buildGroups((r) => r.bloc), blocMiddleIds, blocTextBelowMap, (r) => r.bloc);

  const radioMiddleIds = new Set<string>();
  const radioTextBelowMap = new Map<string, string>();
  buildGroupSets(buildGroups((r) => r.radio), radioMiddleIds, radioTextBelowMap, (r) => r.radio);

  const rampeMiddleIds = new Set<string>();
  const rampeTextBelowMap = new Map<string, string>();
  buildGroupSets(buildGroups((r) => r.rampe), rampeMiddleIds, rampeTextBelowMap, (r) => r.rampe);

  // --- ETCS : même principe que Bloc/Radio/Rampe, mais "" est une valeur réelle ici
  // (niveau ETCS absent hors zone ADIF) — pas de saut des valeurs vides comme pour
  // Vmax : la transition "1" → "" doit produire une barre comme n'importe quel autre
  // changement (même règle que `etcsBarIndexes` dans l'éditeur, Normalise2026Tab.tsx).
  const etcsMiddleIds = new Set<string>();
  const etcsTextBelowMap = new Map<string, string>();
  buildGroupSets(buildGroups((r) => r.etcs), etcsMiddleIds, etcsTextBelowMap, (r) => r.etcs);

  // --- Vmax : variante qui saute les valeurs vides (un point de transition sans
  // vmax ne casse pas le groupe). Barre au changement du COUPLE (vitesse, csv), pas
  // de la vitesse seule — sinon deux zones à vitesse identique dont l'une est CSV et
  // l'autre non se retrouvent fusionnées sans barre (même règle que l'éditeur,
  // `updateVmax`/propagation par couple ; oubliée dans le 1er jet, corrigée suite au
  // retour utilisateur).
  const vmaxGroups: { start: number; len: number }[] = [];
  {
    let gs = 0;
    let lastKey = "";
    for (let i = 0; i < dataRowsOnly.length; i++) {
      const v = dataRowsOnly[i].vmax;
      const key = v === "" ? "" : `${v}|${dataRowsOnly[i].csv}`;
      if (i > 0 && key !== "" && key !== lastKey) {
        vmaxGroups.push({ start: gs, len: i - gs });
        gs = i;
      }
      if (i === dataRowsOnly.length - 1) vmaxGroups.push({ start: gs, len: dataRowsOnly.length - gs });
      if (key !== "") lastKey = key;
    }
  }
  const vmaxBarIds = new Set<string>();
  const vmaxMiddleIds = new Set<string>();
  const vmaxTextBelowMap = new Map<string, string>();
  const vmaxDisplayValueMap = new Map<string, string>();
  for (const { start, len } of vmaxGroups) {
    const hasBar = start > 0;
    const value = dataRowsOnly[start].vmax;
    if (hasBar) vmaxBarIds.add(dataRowsOnly[start].id);
    if (hasBar && len === 1) {
      vmaxTextBelowMap.set(dataRowsOnly[start].id, value);
    } else {
      const mid = hasBar && len > 1 ? 1 + Math.floor((len - 2) / 2) : Math.floor((len - 1) / 2);
      vmaxMiddleIds.add(dataRowsOnly[start + mid].id);
      vmaxDisplayValueMap.set(dataRowsOnly[start + mid].id, value);
    }
  }

  // --- CSV : détection de zones (par ordre de parcours, l'index du point dans la
  // séquence déjà triée sert de "PK interne" ordinal) + rendu bas/plein/haut,
  // identique à l'ancien pipeline (système à 3 états, PAS le simple fond plein de
  // l'éditeur — précision explicite de l'utilisateur, 08/08 très tard).
  // `detectCsvZones` réordonne en interne selon `direction` (croissant en sudNord,
  // décroissant en nordSud) en présumant une échelle PK physique fixe. Nos index sont
  // déjà dans l'ordre de PARCOURS (0 = premier point rencontré, quel que soit le
  // sens) — en nordSud il faut donc INVERSER l'index pour que le tri décroissant de
  // la fonction restitue notre ordre d'origine.
  const csvInput = dataRowsOnly.map((r, i) => ({
    id: r.id,
    csv: r.csv,
    pkInterne: String(direction === "sudNord" ? i : dataRowsOnly.length - 1 - i),
    type: "data" as const,
  }));
  const csvZones = detectCsvZones(csvInput, direction);
  const csvHighlightMap = new Map<string, "lower" | "full" | "upper">();
  const csvTrueIdSet = new Set<string>();
  for (const zone of csvZones.filter((z) => !z.startsAtFirstLine)) {
    zone.csvTrueIds.forEach((id, idx) => {
      csvTrueIdSet.add(id);
      csvHighlightMap.set(id, idx === 0 ? "lower" : "full");
    });
    if (zone.endId) csvHighlightMap.set(zone.endId, "upper");
  }
  let inZone = false;
  for (const row of rawRows) {
    if (row.type === "data") {
      inZone = csvTrueIdSet.has(row.id);
    } else if (inZone) {
      csvHighlightMap.set(row.id, "full");
    }
  }

  // --- LTV intégrées à la fiche train : porté de
  // `buildPdfPropsForTrain.ts::filterAndAssembleFtRows` (ancien pipeline), même
  // algorithme — la note est ancrée sur la DERNIÈRE ligne de donnée dont le PK est
  // encore avant l'entrée dans la zone LTV (sens de circulation pris en compte),
  // affichée dans la ligne intermédiaire qui suit. Utilise `pkAdif` (les LTV sont
  // toujours sur le réseau ADIF) là où l'ancien utilisait un `pkInterne` unifié.
  // ⚠️ "→" remplacé par "->" : le glyphe Unicode ne s'affiche pas en Helvetica
  // standard (même piège que la flèche d'en-tête Rampe, cf. mémoire projet) — pas
  // de police DejaVu chargée ici contrairement à l'ancien pipeline.
  const parsePk = (s: string): number | null => {
    const n = parseFloat(s.replace(",", ".").trim());
    return Number.isNaN(n) ? null : n;
  };
  const pointPks = points
    .map((p, i) => ({ id: `pt-${i}`, pk: p.type === "note" ? null : parsePk(p.pkAdif) }))
    .filter((r): r is { id: string; pk: number } => r.pk !== null);

  const filteredLtv = (() => {
    if (pointPks.length === 0) return ltvRows;
    const routeMin = Math.min(...pointPks.map((r) => r.pk));
    const routeMax = Math.max(...pointPks.map((r) => r.pk));
    return ltvRows.filter((ltv) => {
      const pkIni = parsePk(ltv.kmIni);
      const pkFin = parsePk(ltv.kmFin);
      if (pkIni === null || pkFin === null) return true;
      const minPk = Math.min(pkIni, pkFin);
      const maxPk = Math.max(pkIni, pkFin);
      return maxPk >= routeMin && minPk <= routeMax;
    });
  })();

  const isIncreasing = direction === "sudNord";
  const ltvNoteMap = new Map<string, string[]>();
  for (const ltv of filteredLtv) {
    const pkIni = parsePk(ltv.kmIni);
    const pkFin = parsePk(ltv.kmFin);
    if (pkIni === null || pkFin === null) continue;
    const entryPk = isIncreasing ? Math.min(pkIni, pkFin) : Math.max(pkIni, pkFin);
    let targetId: string | null = null;
    for (const { id, pk } of pointPks) {
      if (isIncreasing ? pk <= entryPk : pk >= entryPk) targetId = id;
      else break;
    }
    if (!targetId) continue;
    const speed = ltv.speed.trim();
    const [firstPkStr, secondPkStr] =
      isIncreasing
        ? pkIni <= pkFin ? [ltv.kmIni, ltv.kmFin] : [ltv.kmFin, ltv.kmIni]
        : pkIni >= pkFin ? [ltv.kmIni, ltv.kmFin] : [ltv.kmFin, ltv.kmIni];
    const note = `LTV ${speed} - PK ${firstPkStr} -> ${secondPkStr}`;
    if (!ltvNoteMap.has(targetId)) ltvNoteMap.set(targetId, []);
    ltvNoteMap.get(targetId)!.push(note);
  }

  let dataRowIndex = 0;
  let lastBloc = "";
  let lastRadio = "";
  let lastRampe = "";
  let lastEtcs = "";

  return rawRows.map((row) => {
    let showVBar = false, showRampeBar = false, showBlocBar = false, showRadioBar = false, showEtcsBar = false;

    // ⚠️ lastBloc/lastRadio/lastRampe ne doivent être comparés/mis à jour QUE sur les
    // lignes "data" — une ligne "note" porte bloc/radio/rampe="" en interne, et les
    // utiliser aurait fait croire à un changement de zone juste après une note (barre
    // fantôme sur la 1re ligne de donnée suivante). Bug réel trouvé le 09/08 : les 4
    // positions signalées par l'utilisateur (623.8/627.7/716.8/749.6) suivaient
    // TOUTES une note.
    if (row.type === "data") {
      const isFirst = dataRowIndex === 0;
      const isLast = dataRowIndex === dataRowCount - 1;
      showBlocBar = row.bloc !== lastBloc && !isFirst && !isLast;
      showRadioBar = row.radio !== lastRadio && !isFirst && !isLast;
      showRampeBar = row.rampe !== lastRampe && !isFirst && !isLast;
      showEtcsBar = row.etcs !== lastEtcs && !isFirst && !isLast;
      showVBar = vmaxBarIds.has(row.id);
      lastBloc = row.bloc;
      lastRadio = row.radio;
      lastRampe = row.rampe;
      lastEtcs = row.etcs;
      dataRowIndex++;
    }

    // Surlignage jaune : présence d'un arrêt (arrivée et/ou départ) — règle établie
    // cette session pour l'éditeur (isStopIndex), reprise à l'identique ici.
    const highlight = row.type === "data" && (row.arrivee !== "" || row.depart !== "");

    return {
      ...row,
      showBlocBar,
      showBlocText: blocMiddleIds.has(row.id),
      blocTextBelow: blocTextBelowMap.get(row.id) ?? "",
      showRadioBar,
      showRadioText: radioMiddleIds.has(row.id),
      radioTextBelow: radioTextBelowMap.get(row.id) ?? "",
      showRampeBar,
      showRampeText: rampeMiddleIds.has(row.id),
      rampeTextBelow: rampeTextBelowMap.get(row.id) ?? "",
      showVBar,
      showVmaxText: vmaxMiddleIds.has(row.id),
      vmaxDisplayValue: vmaxDisplayValueMap.get(row.id) ?? "",
      vmaxTextBelow: vmaxTextBelowMap.get(row.id) ?? "",
      showEtcsBar,
      showEtcsText: etcsMiddleIds.has(row.id),
      etcsTextBelow: etcsTextBelowMap.get(row.id) ?? "",
      highlight,
      csvHighlight: (csvHighlightMap.get(row.id) ?? "none") as "none" | "lower" | "full" | "upper",
      ltvNote: ltvNoteMap.get(row.id)?.join("\n") ?? "",
    };
  });
}

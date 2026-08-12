// src/lib/importer/parseLigneModele.ts
//
// Parseur de feuilles FT (jalons 2-5 de l'importateur, 07-08/08). Lit une feuille
// (modèle vierge ou fiche train) d'un classeur Excel source ADIF et restitue la
// séquence complète : points de ligne (Bloc/Vmax+CSV/Radio/Rampe/ETCS/Établissements/
// PK), horaires Arr/Pass/Dép (fiches train), et notes (texte/ancrage/surlignage),
// pour un sens de circulation.
//
// PRINCIPES (leçons de la session, cf. mémoire projet_remise_a_plat_2026) :
//   - Chaque colonne est lue avec le signal LE PLUS FIABLE qu'elle offre :
//       Rampe  → zones délimitées par les BORDURES épaisses (border.bottom "thick",
//                colonne I) — signal exact, confiance haute.
//       Vmax   → pas de bordures de zone dans le fichier (vérifié) → attribution
//                « valeur → dernier KM au-dessus », avec CONFIANCE BASSE marquée sur
//                les cas structurellement ambigus (collision de deux valeurs sur le
//                même KM, attribution sur un point de transition). Signaler, pas
//                deviner : ces cas remonteront « à vérifier » dans la modale d'import.
//       Bloc   → balayage séquentiel (valeur portée par ses marqueurs \x82BCA etc.).
//       Radio  → présence du glyphe Ⓖ n'importe où → "G" (une seule zone connue).
//       ETCS   → déduit du bloc (BCA → "1", sinon "") — le doc ne le porte pas par ligne.
//   - Les PK renvoyés sont ceux DU DOCUMENT (jamais « corrigés » ici — la confrontation
//     aux PK canoniques/ancres GPS appartient à l'étape de DIFF, pas au parseur).
//   - Points de TRANSITION réseau (2 PK sur des lignes adjacentes) : fusionnés en un
//     point ; les valeurs de zone (bloc/vmax/rampe) sont celles du canton ABORDÉ
//     (2e ligne), conformément à la convention validée.
//   - Sauts de page : la ligne-frontière est répétée en tête de page suivante →
//     dédoublonnée (en absorbant les valeurs imprimées seulement sur la 2e occurrence).
//
// PAS ENCORE COUVERT (incréments suivants) :
//   - CSV + valeurs Vmax des zones CSV : portées par des FORMES FLOTTANTES orange
//     (xl/drawings/drawingN.xml), pas par des cellules → nécessite le parsing des
//     drawings. En attendant, ces zones héritent de la valeur précédente (faux) —
//     d'où l'importance du diff de validation en aval.
//   - Notes (texte bordeaux) : détectées (pour ne pas polluer les établissements)
//     mais pas encore restituées comme points de note.
//   - Horaires (colonnes Arr/Pass/Dép des fiches train).

import ExcelJS from "exceljs/dist/exceljs.min.js";
import JSZip from "jszip";

// Note (remarque rouge du document), restituée comme entrée à part entière,
// intercalée dans l'ordre kilométrique. Ancrage : note de SEGMENT (contient une
// plage "x al y") → "en-dessous" (collée au KM de début, la ligne précédente) ;
// note PONCTUELLE → "au-dessus" (collée à la ligne suivante). Surligné = fond
// pêche de la cellule. Règles validées durant la construction manuelle du socle.
export type ImportedNote = {
  type: "note";
  texte: string;
  position: "au-dessus" | "en-dessous";
  surligne: boolean;
  sourceRow: number;
};

export type ImportedLigneRow = ImportedLignePoint | ImportedNote;

export type ImportedLignePoint = {
  bloc: string;
  vmax: string;
  csv: boolean;
  // Horaires (feuilles TRAIN uniquement ; vides sur les feuilles modèles). Suffixe
  // "+" du document conservé tel quel (ex. "16:43+").
  arr: string;
  pass: string;
  dep: string;
  radio: string;
  rampe: string;
  etcs: string;
  etablissement: string;
  pkAdif: string;
  pkLfp: string;
  pkRac: string;
  pkRfn: string;
  // Diagnostic (pas dans le format normalisé final) :
  sourceRow: number;
  vmaxConfidence: "haute" | "basse";
  rampeConfidence: "haute" | "basse";
};

// ---------------------------------------------------------------------------
// CSV (Changement Significatif de Vitesse) : dans le fichier source, la zone CSV
// n'est PAS une cellule mais une FORME FLOTTANTE orange (fond FFC000) dessinée
// par-dessus la colonne Vmax (xl/drawings/drawingN.xml), dont le TEXTE porte la
// valeur Vmax de la zone. L'ancrage `from.row` de la forme tombe sur la ligne KM
// qui DÉBUTE la zone (vérifié : CT→PPN → 30@620.2, 45@626.7, 125@709.9 —
// exactement le socle validé). exceljs n'expose pas ces formes → lecture du XML
// brut via jszip.
type CsvShape = { fromRow: number; toRow: number; value: string };

// Classeur OUVERT UNE SEULE FOIS (exceljs + jszip) puis passé aux parseurs de
// feuilles : recharger le classeur entier à chaque feuille (≈ 20 chargements par
// import) mettait le navigateur à genoux.
export type Classeur = {
  workbook: ExcelJS.Workbook;
  zip: JSZip;
};

export async function openClasseur(buffer: ArrayBuffer): Promise<Classeur> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const zip = await JSZip.loadAsync(buffer);
  return { workbook, zip };
}

// Charge le XML du dessin (drawing) associé à une feuille — partagé par toutes les
// extractions de formes flottantes (CSV, étiquettes KM) pour ne lire le zip qu'une fois.
async function loadDrawingXml(zip: JSZip, sheetName: string): Promise<string | null> {
  const workbook = await zip.file("xl/workbook.xml")?.async("string");
  const wbRels = await zip.file("xl/_rels/workbook.xml.rels")?.async("string");
  if (!workbook || !wbRels) return null;
  const sheet = [...workbook.matchAll(/<sheet name="([^"]+)"[^>]*r:id="(rId\d+)"/g)].find(
    (m) => m[1] === sheetName
  );
  if (!sheet) return null;
  const relMap = new Map(
    [...wbRels.matchAll(/Id="(rId\d+)"[^>]*Target="([^"]+)"/g)].map((m) => [m[1], m[2]])
  );
  const sheetFile = "xl/" + (relMap.get(sheet[2]) ?? "").replace(/^\//, "");
  const sheetRelsPath = sheetFile.replace("worksheets/", "worksheets/_rels/") + ".rels";
  const sheetRels = await zip.file(sheetRelsPath)?.async("string");
  if (!sheetRels) return null;
  const drawingTarget = [...sheetRels.matchAll(/Type="[^"]*\/drawing"[^>]*Target="([^"]+)"/g)].map(
    (m) => m[1]
  )[0];
  if (!drawingTarget) return null;
  return (await zip.file("xl/drawings/" + drawingTarget.split("/").pop())?.async("string")) ?? null;
}

function shapeAnchors(drawingXml: string): Array<{ fromRow: number; toRow: number; text: string; raw: string }> {
  const out: Array<{ fromRow: number; toRow: number; text: string; raw: string }> = [];
  for (const anchor of drawingXml.match(/<xdr:twoCellAnchor[\s\S]*?<\/xdr:twoCellAnchor>/g) ?? []) {
    const from = anchor.match(/<xdr:from><xdr:col>\d+<\/xdr:col>.*?<xdr:row>(\d+)<\/xdr:row>/s);
    const to = anchor.match(/<xdr:to><xdr:col>\d+<\/xdr:col>.*?<xdr:row>(\d+)<\/xdr:row>/s);
    const text = [...anchor.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]).join("").trim();
    if (!from || !to) continue;
    // Lignes du XML en base 0 → base 1 (comme exceljs).
    out.push({ fromRow: Number(from[1]) + 1, toRow: Number(to[1]) + 1, text, raw: anchor });
  }
  return out;
}

async function extractCsvShapes(zip: JSZip, sheetName: string): Promise<CsvShape[]> {
  const drawingXml = await loadDrawingXml(zip, sheetName);
  if (!drawingXml) return [];
  return shapeAnchors(drawingXml)
    .filter((a) => a.raw.includes("FFC000"))
    .map((a) => ({ fromRow: a.fromRow, toRow: a.toRow, value: a.text }));
}

// Étiquette de KM en forme flottante : certains points n'ont AUCUNE cellule KM
// imprimée (leur ligne est absorbée par le surlignage d'une note voisine) — le
// document compense en dessinant le PK par-dessus, en texte simple (sans le
// remplissage orange des formes CSV). Signature : texte COURT, décimal, un seul
// chiffre après le point (cas confirmé : "619.9"). Retourne ligne → texte KM.
async function extractKmLabelShapes(zip: JSZip, sheetName: string): Promise<Map<number, string>> {
  const drawingXml = await loadDrawingXml(zip, sheetName);
  const out = new Map<number, string>();
  if (!drawingXml) return out;
  for (const a of shapeAnchors(drawingXml)) {
    if (/^\d{1,3}\.\d$/.test(a.text)) out.set(a.fromRow, a.text);
  }
  return out;
}

// Note en forme flottante : certaines notes ne sont PAS des valeurs de cellule
// mais des zones de texte dessinées par-dessus le tableau (cas confirmé : la
// note « 60km/h ... KM 619.500 al 619.933 » de CT→BCW, invisible en lecture de
// cellule alors que visible à l'écran — bug signalé 12/08). Signature : couleur
// de texte bordeaux 9B0C36 (même couleur que NOTE_FONT_ARGB pour les notes en
// cellule), et PAS le remplissage orange FFC000 des zones CSV. Une note peut
// être scindée en plusieurs formes adjacentes (titre + détail « KM x al y » sur
// des ancrages séparés, comme les notes multi-lignes en cellule) — fusionnées à
// la même passe que les notes de cellule (Passe 7), pas ici.
async function extractNoteShapes(
  zip: JSZip,
  sheetName: string
): Promise<Array<{ row: number; texte: string; surligne: boolean }>> {
  const drawingXml = await loadDrawingXml(zip, sheetName);
  if (!drawingXml) return [];
  return shapeAnchors(drawingXml)
    .filter((a) => a.text.trim() !== "" && !a.raw.includes("FFC000") && /9B0C36/i.test(a.raw))
    .map((a) => ({
      row: a.fromRow,
      texte: a.text.trim(),
      // Fond pêche (accent2 éclairci) = surligné, même signal que isSurligneCell
      // pour les notes en cellule ; pas d'exemple connu de note flottante SANS
      // ce fond à ce jour — <a:noFill/> (fragment "détail" d'une note scindée)
      // hérite quand même surligne=true via la fusion Passe 7 (OU logique).
      surligne: /accent2/i.test(a.raw),
    }));
}

type KmField = "pkAdif" | "pkLfp" | "pkRac" | "pkRfn";

// Plages numériques de PK par réseau, propres à la ligne Barcelona-Perpignan.
// Heuristique valable pour CETTE ligne uniquement (LFP > 10, RAC < 10, jamais de
// chevauchement).
function classifyReseau(km: number): KmField {
  if (km >= 600 && km < 800) return "pkAdif";
  if (km >= 450 && km < 480) return "pkRfn";
  if (km >= 10 && km < 55) return "pkLfp";
  if (km >= 0 && km < 10) return "pkRac";
  throw new Error(`PK hors plage connue, réseau indéterminable : ${km}`);
}

// Notes = texte bordeaux (ARGB confirmé sur les feuilles sources).
const NOTE_FONT_ARGB = "FF9B0C36";
function isNoteCell(cell: ExcelJS.Cell): boolean {
  const color = cell.font?.color as { argb?: string } | undefined;
  return color?.argb === NOTE_FONT_ARGB;
}

// Surlignage pêche d'une note : remplissage de cellule (couleur de THÈME 5 très
// éclaircie, tint ≈ 0.8 — relevé sur les fichiers sources ; le rendu visuel est le
// pêche #FBE2D5 du document).
function isSurligneCell(cell: ExcelJS.Cell): boolean {
  const fill = cell.fill as { fgColor?: { theme?: number; tint?: number } } | undefined;
  return fill?.fgColor?.theme === 5 && (fill?.fgColor?.tint ?? 0) > 0.5;
}

// Note de SEGMENT : contient une plage kilométrique "x al y" (nombres de part et
// d'autre du "al" — "80 AL PASO V3" n'en est pas une).
function isSegmentNote(texte: string): boolean {
  return /\d[\d.,]*\s+al\s+\d[\d.,]*/i.test(texte);
}

// Marqueurs de contrôle (U+0080-U+009F, ex. \x82) accolés aux libellés de bloc.
function stripControlMarkers(s: string): string {
  return s.replace(/[-]/g, "");
}

function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  // Heures Excel natives : exceljs les rend en Date UTC → "H:MM" (sans zéro de tête,
  // convention de l'app). Les heures à suffixe ("16:43+") restent des CHAÎNES et
  // passent par la branche String.
  if (value instanceof Date) {
    return `${value.getUTCHours()}:${String(value.getUTCMinutes()).padStart(2, "0")}`;
  }
  if (typeof value === "object" && "richText" in (value as object)) {
    return (value as { richText: { text: string }[] }).richText.map((r) => r.text).join("");
  }
  if (typeof value === "object" && ("error" in (value as object) || "formula" in (value as object))) {
    return "";
  }
  return String(value).trim();
}

// Heure de fiche : "H:MM" ou "HH:MM", suffixe "+" éventuel conservé tel quel.
function horaireText(value: ExcelJS.CellValue): string {
  const raw = cellText(value);
  const m = raw.match(/^(\d{1,2}):(\d{2})(\+?)$/);
  if (!m) return "";
  return `${Number(m[1])}:${m[2]}${m[3]}`;
}

// Nettoie un établissement : points de suite, n° de train accolé aux transitions,
// placeholders "XXXXX" des feuilles modèles.
function cleanEtablissement(raw: string): string {
  return raw
    .replace(/[.…]{2,}/g, " ")
    .replace(/…/g, " ")
    .replace(/\s+X{3,}\s*$/, "")
    .replace(/\s{2,}\d{3,6}\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function parseLigneSheet(
  classeur: Classeur,
  sheetName: string
): Promise<ImportedLigneRow[]> {
  const sheet = classeur.workbook.getWorksheet(sheetName);
  if (!sheet) throw new Error(`Feuille "${sheetName}" introuvable dans le classeur.`);
  const kmLabelShapes = await extractKmLabelShapes(classeur.zip, sheetName);
  const noteShapes = await extractNoteShapes(classeur.zip, sheetName);

  // ---- Passe 1 : balayage des lignes -> événements bruts --------------------------
  type Scan = {
    r: number;
    kmRaw: string;
    etab: string;
    bloc: string; // "" si rien sur la ligne
    arr: string;
    pass: string;
    dep: string;
  };
  const scans: Scan[] = [];
  const vmaxEvents: Array<{ row: number; value: string }> = [];
  const rampeValues: Array<{ row: number; value: string }> = [];
  const rampeBoundaries: number[] = []; // lignes à bordure basse épaisse (col I)
  let sawRadio = false;
  const noteEvents: Array<{ row: number; texte: string; surligne: boolean }> = [];
  const blocEvents: Array<{ row: number; value: string }> = [];

  for (let r = 1; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const cBloc = row.getCell(1);
    const cVmax = row.getCell(2);
    const cKm = row.getCell(3);
    const cEtab = row.getCell(4);
    const cArr = row.getCell(5);
    const cPass = row.getCell(6);
    const cDep = row.getCell(7);
    const cRadio = row.getCell(8);
    const cRampe = row.getCell(9);

    // Bandeaux de page (titre/relation/avertissement : colonnes A..D fusionnées
    // ensemble), lignes d'en-tête de colonnes et pieds de page — ignorés en entier.
    const rawA = cellText(cBloc.value);
    const isBanner = cVmax.master?.address === cBloc.master?.address;
    if (isBanner || rawA === "Bloc" || rawA === "#VALUE!") continue;

    if (cRampe.border?.bottom?.style === "thick") rampeBoundaries.push(r);
    // Valeur rampe = 1-2 chiffres. Écarte l'en-tête "k" ET les pieds de page "1/3"
    // (dont la ligne échappe au filtre de bandeau : sa cellule A est une ERREUR
    // #VALUE!, pas un texte).
    const rampeRaw = cellText(cRampe.value);
    if (/^\d{1,2}$/.test(rampeRaw)) rampeValues.push({ row: r, value: rampeRaw });

    if (cellText(cRadio.value)) sawRadio = true;

    // Vmax : ne retenir la valeur QU'UNE FOIS par cellule/fusion (cellule maître),
    // sinon chaque ligne couverte par la fusion répéterait la valeur.
    const isVmaxMaster = !cVmax.isMerged || cVmax.master?.address === cVmax.address;
    const vmaxRaw = cellText(cVmax.value);
    if (isVmaxMaster && vmaxRaw && vmaxRaw !== "Vmax") vmaxEvents.push({ row: r, value: vmaxRaw });

    // KM : espaces parasites possibles ("654. 1") — nettoyés avant conversion.
    // KM en cellule d'abord ; à défaut, étiquette flottante dessinée sur cette ligne
    // (cas confirmé : le KM tombe dans une cellule autrement vide, recouverte par le
    // surlignage d'une note — le document compense en dessinant le chiffre par-dessus).
    const kmRaw = (cellText(cKm.value) || kmLabelShapes.get(r) || "").replace(/\s+/g, "");
    let etab = cellText(cEtab.value);
    if (isNoteCell(cEtab)) {
      if (etab) {
        // Note multi-lignes DANS une seule cellule : retours à la ligne → « — ».
        noteEvents.push({
          row: r,
          texte: etab.replace(/\s*\n\s*/g, " — "),
          surligne: isSurligneCell(cEtab),
        });
      }
      etab = "";
    }
    scans.push({
      r,
      kmRaw,
      etab,
      bloc: stripControlMarkers(rawA).trim(),
      arr: horaireText(cArr.value),
      pass: horaireText(cPass.value),
      dep: horaireText(cDep.value),
    });
  }

  // ---- Passe 2 : points bruts (un par ligne à KM), bloc séquentiel ---------------
  type RawPoint = ImportedLignePoint & { field: KmField; km: number };
  const raw: RawPoint[] = [];
  let bloc = "";
  for (const s of scans) {
    if (s.bloc) {
      bloc = s.bloc;
      blocEvents.push({ row: s.r, value: s.bloc });
    }
    if (s.kmRaw === "") continue;
    const km = Number(s.kmRaw.replace(",", "."));
    if (!Number.isFinite(km)) continue;
    const field = classifyReseau(km);
    const p: RawPoint = {
      bloc,
      vmax: "",
      csv: false,
      arr: s.arr,
      pass: s.pass,
      dep: s.dep,
      radio: sawRadio ? "G" : "",
      rampe: "",
      etcs: "",
      etablissement: cleanEtablissement(s.etab),
      pkAdif: "",
      pkLfp: "",
      pkRac: "",
      pkRfn: "",
      sourceRow: s.r,
      vmaxConfidence: "haute",
      rampeConfidence: "haute",
      field,
      km,
    };
    p[field] = s.kmRaw;
    raw.push(p);
  }

  // ---- Passe 3 : Vmax — chaque valeur s'attache au dernier KM au-dessus ----------
  // (une valeur au-dessus du premier KM = zone de départ → premier KM). Collision =
  // deux valeurs sur le même KM → la 1re gagne, la région passe en confiance basse.
  // Les formes CSV comptent comme des événements Vmax à part entière (leur texte est
  // la valeur de la zone) ET marquent le point de début de zone csv=true — l'ancrage
  // `fromRow` tombant sur la ligne KM de début, l'attachement standard suffit.
  const csvShapes = await extractCsvShapes(classeur.zip, sheetName);
  const allEvents = [
    ...vmaxEvents.map((e) => ({ ...e, csv: false })),
    ...csvShapes.filter((s) => /^\d{1,3}$/.test(s.value)).map((s) => ({ row: s.fromRow, value: s.value, csv: true })),
  ].sort((a, b) => a.row - b.row);
  const attached = new Map<number, string>(); // index de point -> valeur
  const lowConfidenceFrom = new Set<number>();
  for (const ev of allEvents) {
    let idx = -1;
    for (let i = 0; i < raw.length; i++) {
      if (raw[i].sourceRow <= ev.row) idx = i;
      else break;
    }
    if (idx === -1) idx = 0; // valeur avant le premier KM = zone de départ
    if (attached.has(idx)) {
      lowConfidenceFrom.add(idx); // collision : signal ambigu, à vérifier
    } else {
      attached.set(idx, ev.value);
      if (ev.csv) raw[idx].csv = true;
    }
  }
  let currentVmax = "";
  let lowVmax = false;
  raw.forEach((p, i) => {
    if (attached.has(i)) {
      currentVmax = attached.get(i)!;
      lowVmax = lowConfidenceFrom.has(i);
    }
    p.vmax = currentVmax;
    if (lowVmax) p.vmaxConfidence = "basse";
  });
  // LIMITE CONNUE (documentée, pas corrigée automatiquement) : quand une valeur de
  // zone est imprimée dans une cellule fusionnée dont le KM-frontière est absorbé
  // par la fusion précédente (ou tombe dans un blanc juste avant que la nouvelle
  // valeur ne soit imprimée), l'attribution "dernier point imprimé avant la ligne de
  // l'événement" peut se tromper d'un point — confirmé et cross-vérifié avec
  // l'ancien normalisé sur au moins deux cas (PK 713.2 et 641.9 nord-sud). Tentative
  // de règle générale de confiance abandonnée : elle sur-signalait aussi des zones
  // correctement déterminées (essai du 08/08, cassait 3 points du banc CT→PPN,
  // annulé). Ces cas restent donc en confiance "haute" mais potentiellement faux ;
  // ils sont couverts par le mécanisme des refus mémorisés une fois vérifiés
  // manuellement (le diff est déterministe pour un même document).

  // ---- Passe 4 : Rampe — valeur au plus près, sans franchir de bordure épaisse ---
  // Deux layouts observés : valeur RÉPÉTÉE sur chaque ligne (feuilles modèles) ou
  // imprimée une fois par zone (fiches train). Résolution robuste aux deux :
  //   1. valeur présente sur la ligne du point → prise directement ;
  //   2. sinon, plus proche valeur EN DESSOUS sans franchir de bordure épaisse
  //      (la bordure basse épaisse à la ligne t sépare t de t+1) ;
  //   3. sinon, plus proche valeur AU-DESSUS, même contrainte ;
  //   4. sinon héritage du point précédent, confiance basse.
  {
    const valueAt = new Map<number, string>();
    for (const rv of rampeValues) valueAt.set(rv.row, rv.value);
    const thick = new Set(rampeBoundaries);
    const maxRow = sheet.rowCount;
    const resolve = (r: number): string | undefined => {
      if (valueAt.has(r)) return valueAt.get(r);
      // Point SUR une ligne-frontière (bordure épaisse au bas de sa propre ligne) :
      // il appartient à la zone ABORDÉE (en dessous, sens de lecture = sens de
      // circulation) — on franchit délibérément SA frontière, pas les suivantes.
      // Cas réel : Bif. MOLLET 640.5 nord-sud (18→30), validé par l'utilisateur.
      const startBelow = r + 1;
      for (let k = startBelow; k <= maxRow; k++) {
        if (k > startBelow && thick.has(k - 1)) break; // frontière franchie entre k-1 et k
        if (!thick.has(r) && thick.has(k - 1)) break; // (point non-frontière : aucune traversée)
        if (valueAt.has(k)) return valueAt.get(k);
      }
      for (let k = r - 1; k >= 1; k--) {
        if (thick.has(k)) break; // frontière franchie entre k et k+1
        if (valueAt.has(k)) return valueAt.get(k);
      }
      return undefined;
    };
    let prevRampe = "";
    for (const p of raw) {
      const v = resolve(p.sourceRow);
      if (v !== undefined) {
        p.rampe = v;
        prevRampe = v;
      } else {
        p.rampe = prevRampe;
        p.rampeConfidence = "basse";
      }
    }
  }

  // ---- Passe 5 : dédoublonnage des sauts de page ---------------------------------
  // La ligne-frontière est réimprimée en tête de page suivante : même PK sur deux
  // points consécutifs → fusion (la 2e occurrence apporte parfois des valeurs que la
  // 1re n'avait pas, ex. la Vmax répétée en tête de page).
  const dedup: RawPoint[] = [];
  for (const p of raw) {
    const prev = dedup[dedup.length - 1];
    if (prev && prev.field === p.field && prev.km === p.km) {
      if (!prev.vmax && p.vmax) prev.vmax = p.vmax;
      if (p.csv) prev.csv = true;
      if (!prev.arr && p.arr) prev.arr = p.arr;
      if (!prev.pass && p.pass) prev.pass = p.pass;
      if (!prev.dep && p.dep) prev.dep = p.dep;
      if (!prev.rampe && p.rampe) prev.rampe = p.rampe;
      if (!prev.etablissement && p.etablissement) prev.etablissement = p.etablissement;
      continue;
    }
    dedup.push(p);
  }

  // ---- Passe 6 : fusion des points de TRANSITION réseau --------------------------
  // Deux lignes STRICTEMENT adjacentes (écart 1 — un écart de 2 englobait à tort un
  // vrai point voisin, ex. Saut de Mouton) de réseaux différents = un point de
  // transition à 2 PK. Cas particulier : de part et d'autre de la limite LFP/RAC, les
  // DEUX PK peuvent être < 10 (ex. 1.2/4.5, 2.8/0.8) et la classification par plage
  // les met dans le même réseau → désambiguïsation par CONTEXTE : le 1er PK prend le
  // réseau du point PRÉCÉDENT (réseau quitté), le 2e celui du point SUIVANT (abordé).
  // Les valeurs de zone (bloc/vmax/rampe/etcs) sont celles de la 2e ligne (canton
  // ABORDÉ, convention validée). Attribution Vmax sur une transition = fragile → basse.
  const merged: RawPoint[] = [];
  for (let i = 0; i < dedup.length; i++) {
    const a = dedup[i];
    const b = dedup[i + 1];
    const isPair =
      b !== undefined &&
      b.sourceRow - a.sourceRow <= 1 &&
      (a.etablissement === "" || b.etablissement === "") &&
      (a.field !== b.field || (a.km < 10 && b.km < 10));
    if (!isPair) {
      merged.push(a);
      continue;
    }
    let fa = a.field;
    let fb = b.field;
    if (fa === fb) {
      const prevField = merged[merged.length - 1]?.field;
      if (prevField && prevField !== fb) fa = prevField;
      else {
        const nextField = dedup[i + 2]?.field;
        if (nextField && nextField !== fa) fb = nextField;
      }
    }
    const point: RawPoint = {
      ...b, // valeurs de zone du canton ABORDÉ
      etablissement: a.etablissement || b.etablissement,
      arr: a.arr || b.arr,
      pass: a.pass || b.pass,
      dep: a.dep || b.dep,
      pkAdif: "",
      pkLfp: "",
      pkRac: "",
      pkRfn: "",
      sourceRow: a.sourceRow,
      vmaxConfidence: "basse",
      field: fb,
    };
    point[fa] = a[a.field];
    point[fb] = b[b.field];
    merged.push(point);
    i++; // b consommé
  }
  // Les points adjacents à une transition héritent aussi d'une attribution fragile.
  // Et le BLOC d'une transition (canton abordé) doit intégrer un éventuel marqueur
  // imprimé juste SOUS la paire (ex. \x82BCA une ligne sous Limite ADIF-LFPSA au sens
  // nord-sud, que le balayage séquentiel rate) — mais PAS le marqueur de la zone
  // d'après quand deux transitions se suivent sans point intermédiaire (RAC-RFF puis
  // LGV-RAC) : on ne regarde que les marqueurs entre la fin de la paire et le point
  // suivant.
  merged.forEach((p, i) => {
    const isTransition = [p.pkAdif, p.pkLfp, p.pkRac, p.pkRfn].filter((v) => v !== "").length >= 2;
    if (!isTransition) return;
    p.vmaxConfidence = "basse";
    if (merged[i + 1]) merged[i + 1].vmaxConfidence = "basse";
    const pairEnd = p.sourceRow + 1;
    const nextRow = merged[i + 1]?.sourceRow ?? Number.POSITIVE_INFINITY;
    const late = blocEvents.filter((e) => e.row > pairEnd && e.row <= nextRow);
    if (late.length > 0) p.bloc = late[late.length - 1].value;
  });

  // ---- Finalisation : ETCS déduit du bloc ---------------------------------------
  for (const p of merged) p.etcs = p.bloc === "BCA" ? "1" : "";

  const points: ImportedLignePoint[] = merged.map(({ field: _f, km: _k, ...rest }) => rest);

  // ---- Passe 7 : notes — fusion multi-lignes puis intercalage kilométrique -------
  // Deux notes sur des lignes CONSÉCUTIVES = une seule note du document imprimée sur
  // deux lignes (ex. 38510 : "60km/h…" puis "KM619.933 al 619.500") → fusion « — ».
  // Notes de cellule ET notes en forme flottante fusionnées dans le MÊME passage
  // (triées par ligne) : une note scindée peut avoir un fragment de chaque sorte
  // (bug 12/08 : le titre ET le détail PK de cette note précise sont tous deux des
  // formes flottantes, mais rien n'empêche un futur cas mixte).
  const allNoteEvents = [...noteEvents, ...noteShapes].sort((a, b) => a.row - b.row);
  const mergedNotes: Array<{ row: number; texte: string; lastRaw: string; surligne: boolean }> = [];
  for (const n of allNoteEvents) {
    const prev = mergedNotes[mergedNotes.length - 1];
    if (prev && n.row - prev.row <= 1) {
      // Cellule étalée sur plusieurs lignes : le MÊME texte se répète → une seule
      // occurrence. Texte différent = 2e ligne de la note du document → « — ».
      if (n.texte !== prev.lastRaw) {
        prev.texte += ` — ${n.texte}`;
        prev.lastRaw = n.texte;
      }
      prev.row = n.row;
      prev.surligne = prev.surligne || n.surligne;
    } else {
      mergedNotes.push({ ...n, lastRaw: n.texte });
    }
  }
  const rows: ImportedLigneRow[] = [...points];
  // Insertion de la fin vers le début pour ne pas invalider les indices.
  for (const n of [...mergedNotes].reverse()) {
    const note: ImportedNote = {
      type: "note",
      texte: n.texte,
      position: isSegmentNote(n.texte) ? "en-dessous" : "au-dessus",
      surligne: n.surligne,
      sourceRow: n.row,
    };
    // Position dans la séquence : avant le premier point STRICTEMENT en dessous de la
    // ligne de la note (une note partageant la ligne d'un point — ex. 80km/h sur la
    // ligne du 621.7 — se place donc APRÈS ce point, cohérent avec son ancrage
    // « en-dessous »).
    let at = rows.findIndex((r) => !("type" in r) && (r as ImportedLignePoint).sourceRow > n.row);
    if (at === -1) at = rows.length;
    rows.splice(at, 0, note);
  }

  return rows;
}

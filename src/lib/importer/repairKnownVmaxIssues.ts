// src/lib/importer/repairKnownVmaxIssues.ts
//
// Corrige, AVANT tout parsing, 3 divergences Vmax connues et confirmées où le
// document source place la valeur plusieurs lignes après le point physique où
// elle change réellement (points-frontières réseau + zones à cellule fusionnée
// absorbant le KM-frontière, cf. mémoire projet 18/08 — Limite LGV-Rac 300→160,
// PK 713.2 120→125, PK 641.9 195→185, valeurs physiques cross-vérifiées contre
// l'ancien normalisé). Appliqué de façon transparente à l'import : l'utilisateur
// dépose le fichier « mal formé » tel que livré par le créateur du document, cette
// fonction le traite comme s'il était déjà réparé, sans jamais lui renvoyer de
// fichier corrigé (le fichier réparé produit visuellement un artefact — texte
// résiduel d'une fusion défaite — inacceptable pour un humain qui l'éditerait,
// cf. mémoire projet ; mais totalement invisible ici puisque le fichier réparé
// ne quitte jamais la mémoire de l'import).
//
// ⚠️ PATCH XML CHIRURGICAL (JSZip), JAMAIS ExcelJS.load()+writeFile() : un
// aller-retour complet via ExcelJS corrompt silencieusement des formes flottantes
// ailleurs dans la feuille (zone CSV `30@620.2` perdue lors d'un essai réel,
// vérifié). La LOCALISATION des cellules à corriger peut en revanche passer par
// ExcelJS (lecture seule, sans écriture, donc sans risque).
//
// Localisation par CONTENU (établissement/KM), pas par numéro de ligne fixe :
// un futur document peut décaler ces lignes (ex. l'ajout d'une note ailleurs dans
// le classeur, déjà observé entre les versions 07/08 et 10/08). Si le contenu
// attendu n'est pas trouvé (structure du document différente, déjà réparé,
// valeur déjà présente...), le correctif concerné est simplement IGNORÉ — jamais
// d'erreur bloquante pour l'import.
import ExcelJS from "exceljs";
import JSZip from "jszip";

type VmaxFix = {
  sheetName: string;
  label: string;
  value: string;
  matchKm?: string;
  matchEtablissement?: string;
};

const KNOWN_FIXES: VmaxFix[] = [
  { sheetName: "CT→PPN", label: "Limite LGV-Rac (sudNord)", value: "160", matchEtablissement: "Limite LGV-Rac" },
  { sheetName: "PPN→BCW", label: "PK 713.2 (nordSud)", value: "125", matchKm: "713.2" },
  { sheetName: "PPN→BCW", label: "PK 641.9 (nordSud)", value: "185", matchKm: "641.9" },
];

function cellText(v: ExcelJS.CellValue): string {
  if (v == null) return "";
  if (typeof v === "object" && "richText" in v) return (v as any).richText.map((r: any) => r.text).join("");
  return String(v).trim();
}

type Located = { row: number; unmergeFromRow: number | null };

// Colonnes fixes du gabarit (Bloc/Vmax/KM/Établissements), communes à toutes les
// feuilles modèles — mêmes indices que `parseLigneModele.ts`.
const COL_VMAX = 2;
const COL_KM = 3;
const COL_ETAB = 4;

function locateRow(sheet: ExcelJS.Worksheet, fix: VmaxFix): Located | null {
  for (let r = 1; r <= sheet.rowCount; r++) {
    const km = cellText(sheet.getCell(r, COL_KM).value).replace(/\s+/g, "");
    const etab = cellText(sheet.getCell(r, COL_ETAB).value);
    const matches = fix.matchKm !== undefined ? km === fix.matchKm : etab === fix.matchEtablissement;
    if (!matches) continue;

    const vmaxCell = sheet.getCell(r, COL_VMAX);

    if (vmaxCell.isMerged && vmaxCell.master && vmaxCell.master.address !== vmaxCell.address) {
      // Cellule SUIVEUSE d'une fusion venant d'une ligne au-dessus (cas
      // GIRONA/PK 713.2) : ExcelJS renvoie la valeur de la cellule MAÎTRE via
      // `.value` (ex. "120"), pas une valeur vide — il ne faut donc PAS la
      // traiter comme « déjà une valeur propre ». Il faut défusionner pour lui
      // donner sa propre valeur.
      const masterRow = Number(vmaxCell.master.address.match(/\d+/)?.[0]);
      if (!Number.isFinite(masterRow)) return null;
      return { row: r, unmergeFromRow: masterRow };
    }

    if (cellText(vmaxCell.value) !== "") return null; // déjà sa propre valeur : rien à faire
    return { row: r, unmergeFromRow: null };
  }
  return null;
}

async function findSheetXmlPath(zip: JSZip, sheetName: string): Promise<string | null> {
  const workbookXml = await zip.file("xl/workbook.xml")?.async("string");
  const wbRels = await zip.file("xl/_rels/workbook.xml.rels")?.async("string");
  if (!workbookXml || !wbRels) return null;
  const sheet = [...workbookXml.matchAll(/<sheet name="([^"]+)"[^>]*r:id="(rId\d+)"/g)].find(
    (m) => m[1] === sheetName
  );
  if (!sheet) return null;
  const relMap = new Map(
    [...wbRels.matchAll(/Id="(rId\d+)"[^>]*Target="([^"]+)"/g)].map((m) => [m[1], m[2]])
  );
  const target = relMap.get(sheet[2]);
  if (!target) return null;
  return "xl/" + target.replace(/^\//, "");
}

// Remplace le contenu exact d'une cellule <c r="B{row}" .../> (vide, éventuellement
// sous fusion) par une valeur numérique, en conservant son style existant tel quel.
// Si `unmergeFromRow` est fourni, retire d'abord l'entrée <mergeCell> correspondante
// et décrémente le compteur `<mergeCells count="N">`.
function patchCellXml(xml: string, col: string, row: number, value: string, unmergeFromRow: number | null): string | null {
  const cellRe = new RegExp(`<c r="${col}${row}"([^>]*?)(?:/>|>.*?</c>)`);
  const match = xml.match(cellRe);
  if (!match) return null;
  const attrs = match[1]; // ex. ' s="7"' ou '' — style existant conservé tel quel.
  const replacement = `<c r="${col}${row}"${attrs}><v>${value}</v></c>`;
  let next = xml.slice(0, match.index) + replacement + xml.slice(match.index! + match[0].length);

  if (unmergeFromRow !== null) {
    const mergeRef = `<mergeCell ref="${col}${unmergeFromRow}:${col}${row}"/>`;
    if (!next.includes(mergeRef)) return null;
    next = next.replace(mergeRef, "");
    next = next.replace(/<mergeCells count="(\d+)">/, (_m, n) => `<mergeCells count="${Number(n) - 1}">`);
  }
  return next;
}

export async function repairKnownVmaxIssues(buffer: ArrayBuffer): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer); // lecture seule — jamais réécrit via ExcelJS.

  const toApply: Array<{ sheetName: string; located: Located; fix: VmaxFix }> = [];
  for (const fix of KNOWN_FIXES) {
    const sheet = workbook.getWorksheet(fix.sheetName);
    if (!sheet) continue;
    const located = locateRow(sheet, fix);
    if (located) toApply.push({ sheetName: fix.sheetName, located, fix });
  }
  if (toApply.length === 0) return buffer;

  const zip = await JSZip.loadAsync(buffer);
  for (const { sheetName, located, fix } of toApply) {
    const sheetPath = await findSheetXmlPath(zip, sheetName);
    if (!sheetPath) continue;
    const xmlFile = zip.file(sheetPath);
    if (!xmlFile) continue;
    const xml = await xmlFile.async("string");
    const patched = patchCellXml(xml, "B", located.row, fix.value, located.unmergeFromRow);
    if (patched === null) {
      console.warn(`[repairKnownVmaxIssues] Correctif « ${fix.label} » repéré mais non applicable (structure XML inattendue) — ignoré.`);
      continue;
    }
    zip.file(sheetPath, patched);
  }
  return await zip.generateAsync({ type: "arraybuffer" });
}

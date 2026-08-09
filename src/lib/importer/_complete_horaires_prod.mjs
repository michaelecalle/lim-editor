// Complète les horaires du fichier de staging depuis l'Excel source :
//  - ajoute les heures des points ajoutés (5 PCA × trains) + lacunes historiques
//    (ex. 9710 à Tunnel du Perthus - tête sud), extraites de l'Excel ;
//  - supprime les heures DUPLIQUÉES de Bif. MOLLET 640.9 côté sudNord (l'ancien
//    fichier portait l'heure du 641.3 sur les deux lignes ; le document n'en a
//    qu'au 641.3) — côté nordSud le 640.9 a une heure LÉGITIME, non touchée.
// Script jetable (préfixe _), lancé via node depuis le repo (exceljs).
import ExcelJS from "exceljs";
import { readFileSync, writeFileSync } from "node:fs";

const STAGING = "S:/Dev/lim-editor/_maj_normalise_2026-08-08";
const XL_SN = "C:/Users/micha/Dropbox/LIM/logs/Logs2/Livret/FT_TGV_INOUI_BCW-PPN 04-08-2026_20260807_085437.xlsx";
const XL_NS = "C:/Users/micha/Dropbox/LIM/logs/Logs2/Livret/FT_TGV_INOUI_PPN-BCW 04-08-2026_20260807_085440.xlsx";

const MAP = [
  ["9705", XL_SN, "9704-5", "sudNord"],
  ["9707", XL_SN, "9706-7", "sudNord"],
  ["9709", XL_SN, "9708-9", "sudNord"],
  ["39819", XL_SN, "39819", "sudNord"],
  ["9710", XL_NS, "9711-0", "nordSud"],
  ["9712", XL_NS, "9713-2", "nordSud"],
  ["9714", XL_NS, "9715-4", "nordSud"],
  ["38510", XL_NS, "38510", "nordSud"],
];

const doc = JSON.parse(readFileSync(`${STAGING}/ligneFT.normalized.json`, "utf8"));

function cellText(v) {
  if (v == null) return "";
  if (v instanceof Date) return `${v.getUTCHours()}:${String(v.getUTCMinutes()).padStart(2, "0")}`;
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((x) => x.text).join("");
    if ("result" in v) return cellText(v.result);
    return "";
  }
  return String(v).trim();
}
const normTime = (s) => {
  const m = String(s).trim().match(/^(\d{1,2}):(\d{2})\+?$/);
  return m ? `${Number(m[1])}:${m[2]}` : null;
};

function buildRowIndex(section) {
  const bySit = new Map();
  const byNet = new Map();
  for (const r of doc[section].rows) {
    if (r.type !== "data") continue;
    bySit.set(String(Number(r.sitKm)), r);
    if (r.pkLfp) byNet.set("L" + String(Number(r.pkLfp)), r);
    if (r.pkRfn) byNet.set("F" + String(Number(r.pkRfn)), r);
    if (r.pkAdif) byNet.set("A" + String(Number(r.pkAdif)), r);
  }
  return { bySit, byNet };
}

const wbCache = new Map();
async function getSheet(path, name) {
  if (!wbCache.has(path)) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(readFileSync(path).buffer);
    wbCache.set(path, wb);
  }
  return wbCache.get(path).getWorksheet(name);
}

let added = 0;
for (const [train, xlPath, sheetName, section] of MAP) {
  const sheet = await getSheet(xlPath, sheetName);
  const { bySit, byNet } = buildRowIndex(section);
  const t = doc.trains[train];
  const variants = Array.isArray(t?.variants) ? t.variants : [t];

  for (let r = 1; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const kmRaw = cellText(row.getCell(3).value).replace(/\s+/g, "");
    if (!/^\d+([.,]\d+)?$/.test(kmRaw)) continue;
    const km = String(Number(kmRaw.replace(",", ".")));
    const arr = normTime(cellText(row.getCell(5).value));
    const pass = normTime(cellText(row.getCell(6).value));
    const dep = normTime(cellText(row.getCell(7).value));
    const hora = dep ?? pass ?? arr; // convention ancien format
    if (!hora) continue;
    const target =
      byNet.get("L" + km) ?? byNet.get("F" + km) ?? byNet.get("A" + km) ?? bySit.get(km);
    if (!target) continue; // points à PK document divergent : déjà couverts via PK canonique
    for (const v of variants) {
      v.byRowKey ??= {};
      if (!v.byRowKey[target.rowKey]?.hora) {
        v.byRowKey[target.rowKey] = { ...(v.byRowKey[target.rowKey] ?? {}), hora };
        added++;
        console.log(`+ ${train} ${target.sitKm} ${target.dependencia || "(sans nom)"} → ${hora}`);
      }
    }
  }
}

// Suppression des heures dupliquées : Bif. MOLLET 640.9, section sudNord uniquement.
const sn6409 = doc.sudNord.rows.find((r) => r.type === "data" && r.sitKm === "640.9");
if (!sn6409) throw new Error("640.9 sudNord introuvable");
let removed = 0;
for (const [num, t] of Object.entries(doc.trains)) {
  const variants = Array.isArray(t.variants) ? t.variants : [t];
  for (const v of variants) {
    if (v.byRowKey?.[sn6409.rowKey]) {
      console.log(`− ${num} : suppression byRowKey ${sn6409.rowKey} (640.9 sudNord)`, JSON.stringify(v.byRowKey[sn6409.rowKey]));
      delete v.byRowKey[sn6409.rowKey];
      removed++;
    }
  }
}

console.log(`\n${added} heure(s) ajoutée(s), ${removed} entrée(s) 640.9 supprimée(s)`);

const buildTs = (data) =>
  `import type { LigneFTNormalized } from "../types/ligneFTNormalized";\n\nexport const LIGNE_FT_NORMALIZED: LigneFTNormalized = ${JSON.stringify(data, null, 2)};\n`;
writeFileSync(`${STAGING}/ligneFT.normalized.json`, JSON.stringify(doc, null, 2));
writeFileSync(`${STAGING}/ligneFT.normalized.ts`, buildTs(doc));
console.log(`Fichiers de staging mis à jour dans ${STAGING}`);

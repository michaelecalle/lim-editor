// Vérification : les horaires du normalisé (version GitHub que l'on vient de mettre à
// jour — byRowKey inchangés) correspondent-ils au document Excel source ?
// Convention ancien format : hora = Dép si présent, sinon Pass, sinon Arr (terminus).
import ExcelJS from "exceljs";
import { readFileSync } from "node:fs";

const NORMALISE = "S:/Dev/lim-editor/_maj_normalise_2026-08-08/ligneFT.normalized.json";
const XL_SN = "C:/Users/micha/Dropbox/LIM/logs/Logs2/Livret/FT_TGV_INOUI_BCW-PPN 04-08-2026_20260807_085437.xlsx";
const XL_NS = "C:/Users/micha/Dropbox/LIM/logs/Logs2/Livret/FT_TGV_INOUI_PPN-BCW 04-08-2026_20260807_085440.xlsx";

// train du normalisé -> [classeur, feuille, section du normalisé]
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

const doc = JSON.parse(readFileSync(NORMALISE, "utf8"));

// Index des lignes du normalisé par section : clé kilométrique -> rowKey/nom.
// Clés possibles : sitKm, pkLfp, pkRfn (les feuilles Excel utilisent le PK réseau).
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

function cellText(v) {
  if (v == null) return "";
  if (v instanceof Date) {
    return `${v.getUTCHours()}:${String(v.getUTCMinutes()).padStart(2, "0")}`;
  }
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((x) => x.text).join("");
    if ("result" in v) return cellText(v.result);
    return "";
  }
  return String(v).trim();
}

function normTime(s) {
  const m = String(s).trim().match(/^(\d{1,2}):(\d{2})(\+?)$/);
  if (!m) return null;
  return { t: `${Number(m[1])}:${m[2]}`, plus: m[3] === "+" };
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

for (const [train, xlPath, sheetName, section] of MAP) {
  const sheet = await getSheet(xlPath, sheetName);
  if (!sheet) { console.log(`✗ feuille ${sheetName} introuvable`); continue; }
  const { bySit, byNet } = buildRowIndex(section);

  // Extraction Excel : sur chaque ligne à KM, heures Arr(E=5)/Pass(F=6)/Dép(G=7).
  const excel = []; // { km, name, arr, pass, dep, row }
  for (let r = 1; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const kmRaw = cellText(row.getCell(3).value).replace(/\s+/g, "");
    if (!/^\d+([.,]\d+)?$/.test(kmRaw)) continue;
    const arr = normTime(cellText(row.getCell(5).value));
    const pass = normTime(cellText(row.getCell(6).value));
    const dep = normTime(cellText(row.getCell(7).value));
    if (!arr && !pass && !dep) continue;
    excel.push({
      km: String(Number(kmRaw.replace(",", "."))),
      name: cellText(row.getCell(4).value).slice(0, 30),
      arr, pass, dep, row: r,
    });
  }

  // byRowKey du normalisé (variante 0 ; signale si les variantes divergent).
  const t = doc.trains[train];
  const variants = Array.isArray(t?.variants) ? t.variants : [t];
  if (variants.length > 1) {
    const all = variants.map((v) => JSON.stringify(v.byRowKey ?? {}));
    if (new Set(all).size > 1) console.log(`⚠️ ${train} : variantes aux horaires DIFFÉRENTS`);
  }
  const byRowKey = variants[0].byRowKey ?? {};
  const horaByRowKey = new Map(
    Object.entries(byRowKey)
      .filter(([, e]) => e?.hora)
      .map(([rk, e]) => [rk, e])
  );

  const issues = [];
  let matches = 0;
  const consumed = new Set();

  for (const e of excel) {
    // point correspondant dans le normalisé : PK réseau d'abord, sinon sitKm
    const r =
      byNet.get("L" + e.km) ?? byNet.get("F" + e.km) ?? byNet.get("A" + e.km) ?? bySit.get(e.km);
    const expected = e.dep ?? e.pass ?? e.arr; // convention hora
    if (!r) { issues.push(`  ? point Excel sans équivalent normalisé : KM ${e.km} ${e.name}`); continue; }
    const entry = horaByRowKey.get(r.rowKey);
    consumed.add(r.rowKey);
    if (!entry) {
      issues.push(`  + Excel a une heure, normalisé NON : ${e.km} ${r.dependencia || e.name} → ${expected.t}${expected.plus ? "+" : ""}`);
      continue;
    }
    const got = normTime(entry.hora);
    if (!got || got.t !== expected.t) {
      issues.push(`  ✗ ÉCART : ${e.km} ${r.dependencia || e.name} — Excel ${expected.t} vs normalisé ${entry.hora}`);
    } else {
      matches++;
      if (expected.plus) issues.push(`  ~ suffixe "+" Excel non porté par le normalisé : ${e.km} (${expected.t}+)`);
      // com : au terminus/arrêt, Dép−Arr doit égaler com
      if (e.arr && e.dep && entry.com) {
        const toMin = (x) => { const [h, mm] = x.t.split(":").map(Number); return h * 60 + mm; };
        const diff = toMin(e.dep) - toMin(e.arr);
        if (String(diff) !== String(entry.com)) issues.push(`  ✗ com : ${e.km} — Excel Dép−Arr=${diff} vs com=${entry.com}`);
      }
    }
  }
  for (const [rk, entry] of horaByRowKey) {
    if (!consumed.has(rk)) {
      const r = [...doc[section].rows].find((x) => x.rowKey === rk);
      issues.push(`  − normalisé a une heure, Excel NON : ${r?.sitKm} ${r?.dependencia || "(sans nom)"} → ${entry.hora}`);
    }
  }

  console.log(`\n=== ${train} (feuille ${sheetName}) : ${matches} concordances, ${issues.length} remarque(s) ===`);
  for (const i of issues) console.log(i);
}

// Fumée horaires nord-sud (9711-0) : cas des heures SÉPARÉES 640.5/641.3 + départ "13:06+"-style.
import { readFileSync } from "node:fs";
import { openClasseur, parseLigneSheet, type ImportedLignePoint } from "./parseLigneModele";

const buf = readFileSync("C:/Users/micha/Dropbox/LIM/logs/Logs2/Livret/FT_TGV_INOUI_PPN-BCW 04-08-2026_20260807_085440.xlsx");
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
const pts = (await parseLigneSheet(await openClasseur(ab), "9711-0")).filter(
  (r): r is ImportedLignePoint => !("type" in r)
);
const timed = pts.filter((p) => p.arr || p.pass || p.dep);
console.log("9711-0 :", pts.length, "points dont", timed.length, "horodatés");
for (const pk of ["640.5", "641.3"]) {
  const p = pts.find((x) => x.pkAdif === pk);
  console.log(" ", pk, p ? `arr=${p.arr} pass=${p.pass} dep=${p.dep} ${p.etablissement}` : "INTROUVABLE");
}
const perp = pts.find((x) => x.pkRfn === "467.5");
console.log("  467.5", perp ? `arr=${perp.arr} pass=${perp.pass} dep=${perp.dep} ${perp.etablissement}` : "INTROUVABLE");
const lgv = pts.find((x) => x.etablissement.includes("LGV"));
console.log("  LGV-RAC", lgv ? `pks=L${lgv.pkLfp}/R${lgv.pkRac} pass=${lgv.pass}` : "INTROUVABLE");

// Banc de test horaires : parse de la feuille TRAIN "9704-5" et confrontation à la
// référence triple-validée du 9705 (Excel + ancien normalisé + dictée utilisateur).
// Clé = PK document (la feuille est restituée telle quelle, PK 640.5/662.1/etc.).
import { readFileSync } from "node:fs";
import { openClasseur, parseLigneSheet, type ImportedLignePoint } from "./parseLigneModele";

// [pk document, arr, pass, dep]
const EXPECTED: Array<[string, string, string, string]> = [
  ["621.0", "", "", "15:17"],
  ["621.7", "", "", ""],
  ["623.8", "", "", ""],
  ["624.3", "", "", ""],
  ["626.7", "", "", ""],
  ["627.7", "", "15:23", ""],
  ["629.4", "", "", ""],
  ["630.7", "", "", ""],
  ["632.4", "", "", ""],
  ["639.8", "", "", ""],
  ["640.5", "", "", ""],
  ["641.3", "", "15:32", ""],
  ["641.9", "", "", ""],
  ["643.6", "", "", ""],
  ["644.3", "", "15:34", ""],
  ["654.1", "", "15:37", ""],
  ["662.1", "", "15:39", ""],
  ["670.5", "", "15:42", ""],
  ["678.1", "", "15:45", ""],
  ["682.0", "", "15:46", ""],
  ["691.9", "", "15:49", ""],
  ["703.5", "", "15:53", ""],
  ["709.9", "", "", ""],
  ["710.7", "", "15:55", ""],
  ["713.2", "", "", ""],
  ["714.7", "15:58", "", "16:01"],
  ["715.5", "", "", ""],
  ["716.8", "", "", ""],
  ["726.2", "", "16:07", ""],
  ["738.2", "", "16:11", ""],
  ["748.9", "16:16", "", "16:19"],
  ["752.4", "", "16:24", ""], // transition ADIF-LFPSA (heure sur la 1re ligne de la paire)
  ["25.6", "", "16:28", ""],
  ["24.6", "", "16:29", ""],
  ["17.1", "", "16:31", ""],
  ["12.9", "", "16:32", ""],
  ["4.5", "", "16:37", ""], // transition LGV-RAC — hmm : l'heure est sur la ligne 4.5 (2e de la paire 1.2/4.5)
  ["471", "", "", ""],
  ["467.5", "16:43+", "", ""],
];

const buf = readFileSync("C:/Users/micha/Dropbox/LIM/logs/Logs2/Livret/FT_TGV_INOUI_BCW-PPN 04-08-2026_20260807_085437.xlsx");
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
const parsed = (await parseLigneSheet(await openClasseur(ab), "9704-5")).filter((r): r is ImportedLignePoint => !("type" in r));

console.log(`Parsé : ${parsed.length} points. Attendu : ${EXPECTED.length}.`);
let mismatches = 0;
for (const [pk, arr, pass, dep] of EXPECTED) {
  const p = parsed.find(
    (x) => [x.pkAdif, x.pkLfp, x.pkRac, x.pkRfn].some((v) => String(Number(v || "NaN")) === String(Number(pk)))
  );
  if (!p) {
    console.log(`✗ point ${pk} introuvable côté parseur`);
    mismatches++;
    continue;
  }
  const diffs: string[] = [];
  if (p.arr !== arr) diffs.push(`arr "${p.arr}" ≠ "${arr}"`);
  if (p.pass !== pass) diffs.push(`pass "${p.pass}" ≠ "${pass}"`);
  if (p.dep !== dep) diffs.push(`dep "${p.dep}" ≠ "${dep}"`);
  if (diffs.length) {
    console.log(`✗ ${pk} ${p.etablissement} :`, diffs.join(" | "));
    mismatches++;
  }
}
console.log(mismatches === 0 ? "\n✅ HORAIRES CONFORMES" : `\n❌ ${mismatches} écart(s)`);

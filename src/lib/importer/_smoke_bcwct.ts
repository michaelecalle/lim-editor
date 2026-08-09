// Fumée : feuille modèle BCW→CT (Barcelona→Can Tunis) — cas de l'erreur document 130.
import { readFileSync } from "node:fs";
import { openClasseur, parseLigneSheet, type ImportedLignePoint } from "./parseLigneModele";

const buf = readFileSync("C:/Users/micha/Dropbox/LIM/logs/Logs2/Livret/FT_TGV_INOUI_PPN-BCW 04-08-2026_20260807_085440.xlsx");
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
const rows = await parseLigneSheet(await openClasseur(ab), "BCW→CT");
const pts = rows.filter((r): r is ImportedLignePoint => !("type" in r));
for (const n of rows.filter((r) => "type" in r)) console.log("NOTE:", JSON.stringify(n));
for (const p of pts) {
  console.log(
    (p.pkAdif || p.pkRfn).padEnd(8),
    ("v=" + p.vmax).padEnd(7) + (p.csv ? "[CSV]" : "     "),
    "rampe=" + p.rampe,
    p.etablissement
  );
}

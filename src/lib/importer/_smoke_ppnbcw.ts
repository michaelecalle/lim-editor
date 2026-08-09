// Fumée : parse de la feuille modèle nord-sud, dump compact pour inspection.
import { readFileSync } from "node:fs";
import { openClasseur, parseLigneSheet, type ImportedLignePoint } from "./parseLigneModele";

const path = "C:/Users/micha/Dropbox/LIM/logs/Logs2/Livret/FT_TGV_INOUI_PPN-BCW 04-08-2026_20260807_085440.xlsx";
const buf = readFileSync(path);
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
const points = (await parseLigneSheet(await openClasseur(ab), "PPN→BCW")).filter(
  (r): r is ImportedLignePoint => !("type" in r)
);
console.log(`${points.length} points`);
for (const p of points) {
  const pks = [p.pkAdif && `A${p.pkAdif}`, p.pkLfp && `L${p.pkLfp}`, p.pkRac && `R${p.pkRac}`, p.pkRfn && `F${p.pkRfn}`]
    .filter(Boolean)
    .join("+");
  const flags = [p.vmaxConfidence === "basse" ? "v?" : "", p.rampeConfidence === "basse" ? "r?" : ""].filter(Boolean).join(",");
  console.log(
    `${pks.padEnd(14)} ${p.bloc.padEnd(5)} v=${p.vmax.padEnd(3)}${p.csv ? "[CSV]" : "     "} rampe=${p.rampe.padEnd(2)} etcs=${p.etcs || "-"} ${flags.padEnd(5)} ${p.etablissement}`
  );
}

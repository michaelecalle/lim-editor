// Banc de test de l'APPLICATION : accepter TOUTES les divergences ligne des vrais
// classeurs, appliquer sur le socle, re-differ → CONVERGENCE attendue (zéro
// divergence restante). Preuve que diff + apply forment une boucle fermée cohérente.
import { readFileSync } from "node:fs";
import { buildCandidateLigne, openClasseur } from "./buildCandidateLigne";
import { diffLignePoints } from "./diffLigne";
import { applyLigneActions } from "./applyDiffs";
import {
  DEFAULT_LIGNE_SUD_NORD,
  DEFAULT_LIGNE_NORD_SUD,
} from "../../components/tabs/Normalise2026Tab";

const load = (p: string): ArrayBuffer => {
  const b = readFileSync(p);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};
const cand = await buildCandidateLigne([
  await openClasseur(load("C:/Users/micha/Dropbox/LIM/logs/Logs2/Livret/FT_TGV_INOUI_BCW-PPN 04-08-2026_20260807_085437.xlsx")),
  await openClasseur(load("C:/Users/micha/Dropbox/LIM/logs/Logs2/Livret/FT_TGV_INOUI_PPN-BCW 04-08-2026_20260807_085440.xlsx")),
]);

let failures = 0;
for (const [direction, current, candidate] of [
  ["sudNord", DEFAULT_LIGNE_SUD_NORD, cand.sudNord],
  ["nordSud", DEFAULT_LIGNE_NORD_SUD, cand.nordSud],
] as const) {
  const d1 = diffLignePoints(current, candidate, direction);
  const applied = applyLigneActions(current, d1.map((d) => d.apply));
  const d2 = diffLignePoints(applied, candidate, direction);
  console.log(`[${direction}] ${d1.length} divergences appliquées → re-diff : ${d2.length}`);
  for (const d of d2) {
    console.log(`  ✗ résiduelle : ${d.categorie} ${d.cible} « ${d.courant} » → « ${d.candidat} »`);
    failures++;
  }
}
console.log(failures === 0 ? "\n✅ CONVERGENCE : appliquer tout puis re-differ → zéro" : `\n❌ ${failures} résiduelle(s)`);

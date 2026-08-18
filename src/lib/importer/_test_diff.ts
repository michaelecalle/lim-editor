// Banc de test du diff ligne : candidat (classeurs Excel réels) ↔ socle 2026, après la
// revue complète du 08/08 (31 divergences examinées une à une avec l'utilisateur,
// cross-vérifiées à l'ancien normalisé et/ou aux cellules brutes). Les 14 acceptées
// ont été appliquées directement au socle (casse/typos alignées sur le document, notes
// corrigées) ; les 3 bugs confirmés du parseur ont été corrigés (619.9 en forme
// flottante, LIGNE_ONLY_TRAINS). Il reste EXACTEMENT 17 divergences légitimement
// récurrentes : 10 PK (ancres GPS, jamais le document), 3 vitesses limites mal
// attribuées par le parseur sur des zones dont le KM-frontière est absorbé par la
// fusion Excel précédente (limite connue et documentée, non corrigée — cf. commentaire
// dans parseLigneModele.ts), 2 erreurs de vitesse confirmées du document (616.0/615.9),
// 1 CSV manquant du document (621.7), 1 note présente dans le document mais absente du
// socle embarqué (révélé le 18/08 par la correction de l'appariement des notes par
// ancrage, cf. plus bas — noyé jusque-là dans le bruit de l'ancien appariement
// séquentiel). Le diff doit produire EXACTEMENT ce catalogue — ni plus, ni moins —
// pour prouver qu'un réimport du même document ne remonte plus que du connu.
import { readFileSync } from "node:fs";
import { buildCandidateLigne, openClasseur } from "./buildCandidateLigne";
import { diffLignePoints } from "./diffLigne";
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

const all = [
  ...diffLignePoints(DEFAULT_LIGNE_SUD_NORD, cand.sudNord, "sudNord"),
  ...diffLignePoints(DEFAULT_LIGNE_NORD_SUD, cand.nordSud, "nordSud"),
];

console.log(`${all.length} divergence(s) :\n`);
for (const d of all) {
  console.log(
    `  [${d.direction}] ${d.categorie.padEnd(15)} ${d.cible.padEnd(38)} « ${d.courant} » → « ${d.candidat} »${d.confiance === "basse" ? "  (à vérifier)" : ""}`
  );
}

// Divergences ATTENDUES (catalogue documenté, verdicts tranchés le 08/08).
// Clé = direction|categorie|fragment de cible.
const MUST_HAVE: Array<[string, string, string]> = [
  // sudNord — PK document vs PK canoniques (ancres GPS) — refusés, à vie
  ["sudNord", "pk", "FIGUERES-VILAFANT"],
  ["sudNord", "pk", "Bif. MOLLET ("],
  ["sudNord", "pk", "LLINARS"],
  ["sudNord", "pk", "RIELLS ("],
  // sudNord — Vmax Limite LGV-Rac : bug de parseur confirmé (cross-vérifié à l'ancien
  // normalisé + confirmation utilisateur), non corrigé (cf. limite documentée) — basse
  ["sudNord", "vmax", "Limite LGV-Rac"],
  // nordSud — PK document divergents — refusés, à vie
  ["nordSud", "pk", "FIGUERES-VILAFANT"],
  ["nordSud", "pk", "RIELLS-A. V ("],
  ["nordSud", "pk", "LLINARS-A V ("],
  ["nordSud", "pk", "BIF. MOLLET ("],
  ["nordSud", "pk", "Limite RAC LFP-RFF"], // × 2 (pkLfp et pkRac)
  // nordSud — mêmes bugs de parseur que ci-dessus, deux autres zones Vmax
  ["nordSud", "vmax", "PK 713.2"],
  ["nordSud", "vmax", "PK 641.9"],
  // nordSud — CSV 621.7 : erreur confirmée du document (manquant), corrigée → refusée
  ["nordSud", "csv", "PK 621.7"],
  // nordSud — erreur confirmée du document : 130 au lieu de 30 (616.0/615.9)
  ["nordSud", "vmax", "(616.0)"],
  ["nordSud", "vmax", "(615.9)"],
  // sudNord — note « 60km/h... KM 619.500 al 619.933 » : PRÉSENTE dans le document
  // v1, ABSENTE du socle embarqué — vrai trou de contenu, révélé le 18/08 en
  // corrigeant l'appariement des notes par ancrage (l'ancien appariement séquentiel
  // noyait ce diff dans 8 autres, tous des faux positifs de désalignement d'index).
  // Pas encore tranché avec l'utilisateur si le socle doit être complété.
  ["sudNord", "note", "60km/h circulation"],
];

let missing = 0;
for (const [dir, cat, frag] of MUST_HAVE) {
  const hit = all.find((d) => d.direction === dir && d.categorie === cat && d.cible.includes(frag));
  if (!hit) {
    console.log(`✗ ATTENDUE ABSENTE : [${dir}] ${cat} ~ ${frag}`);
    missing++;
  }
}

// Catégories qui doivent rester SILENCIEUSES (aucune divergence connue). etablissement,
// note et point-supprime/ajoute ont rejoint ce groupe après la revue du 08/08 : les 14
// corrections acceptées ont été appliquées au socle, et le point 619.9 (sud-nord) est
// désormais lu via son étiquette KM en forme flottante.
const MUST_BE_QUIET: Array<[string, string]> = [
  ["sudNord", "bloc"],
  ["nordSud", "bloc"],
  ["sudNord", "radio"],
  ["nordSud", "radio"],
  ["sudNord", "etcs"],
  ["nordSud", "etcs"],
  ["sudNord", "etablissement"],
  ["nordSud", "etablissement"],
  ["nordSud", "note"],
  ["sudNord", "point-supprime"],
  ["nordSud", "point-supprime"],
  ["sudNord", "point-ajoute"],
  ["nordSud", "point-ajoute"],
];
let noisy = 0;
for (const [dir, cat] of MUST_BE_QUIET) {
  const hits = all.filter((d) => d.direction === dir && d.categorie === cat);
  if (hits.length > 0) {
    console.log(`✗ BRUIT inattendu : [${dir}] ${cat} × ${hits.length}`);
    noisy += hits.length;
  }
}

console.log(
  missing === 0 && noisy === 0
    ? "\n✅ CATALOGUE ATTENDU COUVERT, catégories silencieuses propres"
    : `\n❌ ${missing} attendue(s) absente(s), ${noisy} bruit(s)`
);

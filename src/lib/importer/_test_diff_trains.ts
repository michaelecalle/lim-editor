// Banc de test du diff TRAINS.
// 1) Vrais classeurs vs fixture des 6 trains courants (horaires triple-validés
//    pendant la construction du Normalisé 2026) → ZÉRO divergence attendue.
// 2) Mutations synthétiques de la fixture (heure changée, train retiré, heure en
//    trop) → le diff doit détecter exactement ces changements, ni plus ni moins.
import { readFileSync } from "node:fs";
import { buildCandidateTrains, type CandidateTrain } from "./buildCandidateTrains";
import { openClasseur } from "./parseLigneModele";
import { diffTrains, type CurrentTrain } from "./diffTrains";
import {
  DEFAULT_LIGNE_SUD_NORD,
  DEFAULT_LIGNE_NORD_SUD,
} from "../../components/tabs/Normalise2026Tab";

type H = [string, string, string, string]; // clé canonique, arr, pass, dep
const T = (
  numero: string,
  direction: "sudNord" | "nordSud",
  origine: string,
  destination: string,
  hs: H[]
): CurrentTrain => ({
  numero,
  direction,
  origine,
  destination,
  validityStartDate: "2026-08-04",
  horaires: Object.fromEntries(hs.map(([k, arrivee, passage, depart]) => [k, { arrivee, passage, depart }])),
});

// Clés sud→nord dans l'ordre du parcours.
const SN = (h: string[][]): H[] => h as H[];

const CURRENT: CurrentTrain[] = [
  T("9705", "sudNord", "BARCELONA SANTS", "PERPIGNAN BV", SN([
    ["621.0|||", "", "", "15:17"],
    ["627.7|||", "", "15:23", ""],
    ["641.3|||", "", "15:32", ""],
    ["644.3|||", "", "15:34", ""],
    ["654.1|||", "", "15:37", ""],
    ["662.5|||", "", "15:39", ""],
    ["670.5|||", "", "15:42", ""],
    ["679.3|||", "", "15:45", ""],
    ["682.0|||", "", "15:46", ""],
    ["691.9|||", "", "15:49", ""],
    ["703.5|||", "", "15:53", ""],
    ["710.7|||", "", "15:55", ""],
    ["714.7|||", "15:58", "", "16:01"],
    ["726.2|||", "", "16:07", ""],
    ["738.2|||", "", "16:11", ""],
    ["749.6|||", "16:16", "", "16:19"],
    ["752.4|44.4||", "", "16:24", ""],
    ["|25.6||", "", "16:28", ""],
    ["|24.6||", "", "16:29", ""],
    ["|17.1||", "", "16:31", ""],
    ["|12.9||", "", "16:32", ""],
    ["|1.2|4.5|", "", "16:37", ""],
    ["|||467.5", "16:43+", "", ""],
  ])),
  T("9707", "sudNord", "BARCELONA SANTS", "PERPIGNAN BV", SN([
    ["621.0|||", "", "", "16:24"],
    ["627.7|||", "", "16:30", ""],
    ["641.3|||", "", "16:39", ""],
    ["644.3|||", "", "16:41", ""],
    ["654.1|||", "", "16:44", ""],
    ["662.5|||", "", "16:46", ""],
    ["670.5|||", "", "16:49", ""],
    ["679.3|||", "", "16:52", ""],
    ["682.0|||", "", "16:53", ""],
    ["691.9|||", "", "16:56", ""],
    ["703.5|||", "", "17:00", ""],
    ["710.7|||", "", "17:02", ""],
    ["714.7|||", "17:05", "", "17:08"],
    ["726.2|||", "", "17:14", ""],
    ["738.2|||", "", "17:18", ""],
    ["749.6|||", "17:23", "", "17:26"],
    ["752.4|44.4||", "", "17:31", ""],
    ["|25.6||", "", "17:35", ""],
    ["|24.6||", "", "17:36", ""],
    ["|17.1||", "", "17:38", ""],
    ["|12.9||", "", "17:39", ""],
    ["|1.2|4.5|", "", "17:44", ""],
    ["|||467.5", "17:50", "", ""],
  ])),
  T("9709", "sudNord", "BARCELONA SANTS", "PERPIGNAN BV", SN([
    ["621.0|||", "", "", "9:26"],
    ["627.7|||", "", "9:32", ""],
    ["641.3|||", "", "9:41", ""],
    ["644.3|||", "", "9:43", ""],
    ["654.1|||", "", "9:46", ""],
    ["662.5|||", "", "9:48", ""],
    ["670.5|||", "", "9:51", ""],
    ["679.3|||", "", "9:54", ""],
    ["682.0|||", "", "9:55", ""],
    ["691.9|||", "", "9:58", ""],
    ["703.5|||", "", "10:02", ""],
    ["710.7|||", "", "10:04", ""],
    ["714.7|||", "10:07", "", "10:10"],
    ["726.2|||", "", "10:16", ""],
    ["738.2|||", "", "10:20", ""],
    ["749.6|||", "10:25", "", "10:28"],
    ["752.4|44.4||", "", "10:33", ""],
    ["|25.6||", "", "10:37", ""],
    ["|24.6||", "", "10:38", ""],
    ["|17.1||", "", "10:40", ""],
    ["|12.9||", "", "10:41", ""],
    ["|1.2|4.5|", "", "10:46", ""],
    ["|||467.5", "10:52", "", ""],
  ])),
  T("9711", "nordSud", "PERPIGNAN BV", "BARCELONA SANTS", SN([
    ["|||467.5", "", "", "12:06"],
    ["|0.8|2.8|", "", "12:11", ""],
    ["|12.9||", "", "12:15", ""],
    ["|17.1||", "", "12:16", ""],
    ["|24.6||", "", "12:18", ""],
    ["|25.6||", "", "12:19", ""],
    ["752.4|44.4||", "", "12:24", ""],
    ["749.6|||", "12:27", "", "12:30"],
    ["738.2|||", "", "12:35", ""],
    ["726.2|||", "", "12:39", ""],
    ["714.7|||", "12:44", "", "12:47"],
    ["710.7|||", "", "12:50", ""],
    ["703.5|||", "", "12:53", ""],
    ["691.9|||", "", "12:57", ""],
    ["682.0|||", "", "13:00", ""],
    ["679.3|||", "", "13:01", ""],
    ["670.5|||", "", "13:04", ""],
    ["662.5|||", "", "13:06", ""],
    ["654.1|||", "", "13:09", ""],
    ["644.3|||", "", "13:12", ""],
    ["641.3|||", "", "13:14", ""],
    ["640.9|||", "", "13:15", ""],
    ["627.7|||", "", "13:23", ""],
    ["621.0|||", "13:36", "", ""],
  ])),
  T("9713", "nordSud", "PERPIGNAN BV", "BARCELONA SANTS", SN([
    ["|||467.5", "", "", "13:06+"],
    ["|0.8|2.8|", "", "13:12", ""],
    ["|12.9||", "", "13:16", ""],
    ["|17.1||", "", "13:17", ""],
    ["|24.6||", "", "13:19", ""],
    ["|25.6||", "", "13:20", ""],
    ["752.4|44.4||", "", "13:25", ""],
    ["749.6|||", "13:30", "", "13:33"],
    ["738.2|||", "", "13:38", ""],
    ["726.2|||", "", "13:42", ""],
    ["714.7|||", "13:47", "", "13:50"],
    ["710.7|||", "", "13:53", ""],
    ["703.5|||", "", "13:56", ""],
    ["691.9|||", "", "14:00", ""],
    ["682.0|||", "", "14:03", ""],
    ["679.3|||", "", "14:04", ""],
    ["670.5|||", "", "14:07", ""],
    ["662.5|||", "", "14:09", ""],
    ["654.1|||", "", "14:12", ""],
    ["644.3|||", "", "14:15", ""],
    ["641.3|||", "", "14:17", ""],
    ["640.9|||", "", "14:18", ""],
    ["627.7|||", "", "14:25", ""],
    ["621.0|||", "14:32", "", ""],
  ])),
  T("9715", "nordSud", "PERPIGNAN BV", "BARCELONA SANTS", SN([
    ["|||467.5", "", "", "20:07"],
    ["|0.8|2.8|", "", "20:12", ""],
    ["|12.9||", "", "20:16", ""],
    ["|17.1||", "", "20:17", ""],
    ["|24.6||", "", "20:19", ""],
    ["|25.6||", "", "20:20", ""],
    ["752.4|44.4||", "", "20:25", ""],
    ["749.6|||", "20:30", "", "20:33"],
    ["738.2|||", "", "20:38", ""],
    ["726.2|||", "", "20:42", ""],
    ["714.7|||", "20:47", "", "20:50"],
    ["710.7|||", "", "20:53", ""],
    ["703.5|||", "", "20:56", ""],
    ["691.9|||", "", "21:00", ""],
    ["682.0|||", "", "21:03", ""],
    ["679.3|||", "", "21:04", ""],
    ["670.5|||", "", "21:07", ""],
    ["662.5|||", "", "21:09", ""],
    ["654.1|||", "", "21:12", ""],
    ["644.3|||", "", "21:15", ""],
    ["641.3|||", "", "21:17", ""],
    ["640.9|||", "", "21:18", ""],
    ["627.7|||", "", "21:25", ""],
    ["621.0|||", "14:32", "", ""],
  ])),
];
// (⚠️ dernière ligne du 9715 : arr 21:32 — corrigée juste en dessous pour garder la
// fixture lisible ; toute erreur de fixture serait détectée par le test lui-même.)
CURRENT[5].horaires["621.0|||"] = { arrivee: "21:32", passage: "", depart: "" };

const load = (p: string): ArrayBuffer => {
  const b = readFileSync(p);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};
const candSN = await buildCandidateTrains(
  await openClasseur(load("C:/Users/micha/Dropbox/LIM/logs/Logs2/Livret/FT_TGV_INOUI_BCW-PPN 04-08-2026_20260807_085437.xlsx"))
);
const candNS = await buildCandidateTrains(
  await openClasseur(load("C:/Users/micha/Dropbox/LIM/logs/Logs2/Livret/FT_TGV_INOUI_PPN-BCW 04-08-2026_20260807_085440.xlsx"))
);
const candidates: CandidateTrain[] = [...candSN, ...candNS];
console.log(
  "Trains candidats :",
  candidates.map((c) => `${c.numero}(${c.direction}, ${c.points.filter((p) => p.arr || p.pass || p.dep).length}h)`).join(", ")
);

const ligne = { sudNord: DEFAULT_LIGNE_SUD_NORD, nordSud: DEFAULT_LIGNE_NORD_SUD };

// Compléments de ligne (38510/39819/38579) : de VRAIS trains (correction du 08/08 —
// ils étaient exclus à tort), mais absents de la fixture CURRENT (hors scope de la
// revue des 6 trains principaux) → toujours proposés en "train-ajoute", légitimement.
const EXTRA_TRAINS = ["38510", "39819", "38579"];

// ---- Test 1 : réalité vs fixture → seuls les 3 compléments de ligne -------------
const d1 = diffTrains(CURRENT, candidates, ligne);
console.log(`\nTest 1 (réel vs courant) : ${d1.length} divergence(s)`);
for (const d of d1) console.log(`  [${d.train}] ${d.categorie} ${d.cible} « ${d.courant} » → « ${d.candidat} »`);

const t1ok =
  d1.length === EXTRA_TRAINS.length &&
  d1.every((d) => d.categorie === "train-ajoute" && EXTRA_TRAINS.includes(d.train));

// ---- Test 2 : mutations synthétiques → détection exacte --------------------------
const mutated: CurrentTrain[] = JSON.parse(JSON.stringify(CURRENT));
mutated[0].horaires["627.7|||"].passage = "15:24"; // heure changée (doc dira 15:23)
mutated[1].horaires["999.9|||"] = { arrivee: "", passage: "9:99", depart: "" }; // heure orpheline
const withoutTrain = mutated.filter((t) => t.numero !== "9713"); // train retiré → train-ajoute côté doc
const d2 = diffTrains(withoutTrain, candidates, ligne);
console.log(`\nTest 2 (mutations) : ${d2.length} divergence(s)`);
for (const d of d2) console.log(`  [${d.train}] ${d.categorie} ${d.cible} « ${d.courant} » → « ${d.candidat} »`);

const t2ok =
  d2.some((d) => d.train === "9705" && d.categorie === "horaire" && d.courant === "15:24" && d.candidat === "15:23") &&
  d2.some((d) => d.train === "9707" && d.categorie === "horaire" && d.cible.includes("999.9")) &&
  d2.some((d) => d.train === "9713" && d.categorie === "train-ajoute") &&
  EXTRA_TRAINS.every((num) => d2.some((d) => d.train === num && d.categorie === "train-ajoute")) &&
  d2.length === 3 + EXTRA_TRAINS.length;

console.log(
  t1ok && t2ok
    ? "\n✅ DIFF TRAINS : seuls les compléments de ligne sur le réel, mutations détectées exactement"
    : `\n❌ test 1 : ${t1ok ? "ok" : "ÉCHEC"} ; test 2 : ${t2ok ? "ok" : "ÉCHEC"}`
);

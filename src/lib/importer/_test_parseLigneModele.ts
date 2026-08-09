// Banc de test autonome du parseur — `npx tsx src/lib/importer/_test_parseLigneModele.ts`.
// Référence = ce que la feuille "CT→PPN" DIT (PK et noms du document, 619.9 absent de
// cette feuille), PAS les valeurs canoniques de l'app : le parseur restitue le document,
// la confrontation au canonique appartient à l'étape de diff.
//
// Lacunes CONNUES de ce jalon (annotées `gap`) :
//  - zones CSV (valeur portée par une forme flottante, pas une cellule) : 626.7 devrait
//    valoir 45, 709.9 devrait valoir 125 — le parseur hérite de la zone précédente ;
//  - Vmax en aval d'une transition (valeur imprimée sous un KM intermédiaire) :
//    Limite LGV-Rac devrait valoir 160 — le parseur hérite du 300 et FLAGUE basse.
// (619.9 : anciennement absent de cette feuille — corrigé le 08/08, sa valeur est
// portée par une étiquette KM en forme flottante, lue via `extractKmLabelShapes`.)
import { readFileSync } from "node:fs";
import { openClasseur, parseLigneSheet, type ImportedLignePoint, type ImportedNote } from "./parseLigneModele";

type Exp = {
  bloc: string; vmax: string; rampe: string; etcs: string; etablissement: string;
  pkAdif: string; pkLfp: string; pkRac: string; pkRfn: string;
  gap?: string; lowVmax?: boolean; csv?: boolean;
};

const E = (
  bloc: string, vmax: string, rampe: string, etcs: string, etablissement: string,
  pkAdif: string, pkLfp: string, pkRac: string, pkRfn: string,
  extra?: Partial<Exp>
): Exp => ({ bloc, vmax, rampe, etcs, etablissement, pkAdif, pkLfp, pkRac, pkRfn, ...extra });

const EXPECTED: Exp[] = [
  E("BCA", "30", "30", "1", "CAN TUNIS-AV", "615.9", "", "", ""),
  E("BCA", "95", "30", "1", "BIF CAN TUNIS-AV", "616.0", "", "", ""),
  E("BCA", "85", "30", "1", "", "618.1", "", "", ""),
  E("BCA", "60", "30", "1", "", "619.9", "", "", ""),
  E("BCA", "30", "30", "1", "", "620.2", "", "", "", { csv: true }),
  E("BCA", "30", "28", "1", "BARCELONA SANTS", "621.0", "", "", ""),
  E("BCA", "140", "28", "1", "", "621.7", "", "", ""),
  E("BCA", "80", "28", "1", "", "623.8", "", "", ""),
  E("BCA", "140", "28", "1", "", "624.3", "", "", ""),
  E("BCA", "45", "28", "1", "", "626.7", "", "", "", { csv: true }),
  E("BCA", "45", "28", "1", "LA SAGRERA", "627.7", "", "", ""),
  E("BCA", "110", "28", "1", "", "629.4", "", "", ""),
  E("BCA", "130", "28", "1", "", "630.7", "", "", ""),
  E("BCA", "200", "28", "1", "", "632.4", "", "", ""),
  E("BCA", "185", "28", "1", "", "639.8", "", "", ""),
  E("BCA", "185", "28", "1", "Bif. MOLLET", "640.5", "", "", ""),
  E("BCA", "185", "18", "1", "Bif. MOLLET- AG KM 641.3", "641.3", "", "", ""),
  E("BCA", "195", "18", "1", "", "641.9", "", "", ""),
  E("BCA", "200", "18", "1", "", "643.6", "", "", ""),
  E("BCA", "200", "18", "1", "Bif. MOLLET - AG KM 644.3", "644.3", "", "", ""),
  E("BCA", "200", "18", "1", "PCA LA ROCA", "654.1", "", "", ""),
  E("BCA", "200", "18", "1", "LLINARS", "662.1", "", "", ""),
  E("BCA", "200", "18", "1", "PCA SANT CELONI", "670.5", "", "", ""),
  E("BCA", "200", "18", "1", "RIELLS", "678.1", "", "", ""),
  E("BCA", "200", "18", "1", "BASE MTO RIELLS", "682.0", "", "", ""),
  E("BCA", "200", "18", "1", "PCA RIUDARENES", "691.9", "", "", ""),
  E("BCA", "200", "18", "1", "VILOBI D'ONYAR", "703.5", "", "", ""),
  E("BCA", "125", "18", "1", "", "709.9", "", "", "", { csv: true }),
  E("BCA", "125", "18", "1", "Bif. GIRONA-MERCADERIES", "710.7", "", "", ""),
  E("BCA", "120", "18", "1", "", "713.2", "", "", ""),
  E("BCA", "120", "18", "1", "GIRONA", "714.7", "", "", ""),
  E("BCA", "165", "18", "1", "", "715.5", "", "", ""),
  E("BCA", "200", "18", "1", "", "716.8", "", "", ""),
  E("BCA", "200", "18", "1", "PCA VILADEMULS", "726.2", "", "", ""),
  E("BCA", "200", "18", "1", "PCA PONTOS", "738.2", "", "", ""),
  E("BCA", "200", "18", "1", "FIGUERES-VILAFANT", "748.9", "", "", ""),
  E("ETCS1", "300", "18", "", "Limite ADIF-LFPSA", "752.4", "44.4", "", "", { lowVmax: true }),
  E("ETCS1", "300", "18", "", "Tunnel du Perthus - tête sud", "", "25.6", "", "", { lowVmax: true }),
  E("ETCS1", "300", "18", "", "Frontière Espagne France", "", "24.6", "", ""),
  E("ETCS1", "300", "18", "", "Tunnel du Perthus - tête nord", "", "17.1", "", ""),
  E("ETCS1", "300", "18", "", "Saut de Mouton", "", "12.9", "", ""),
  E("BAL", "300", "10", "", "Limite LGV-Rac", "", "1.2", "4.5", "", { gap: "devrait être 160 (valeur imprimée sous le KM 471)", lowVmax: true }),
  E("BAL", "160", "10", "", "Limite RAC LFP-RFF", "", "", "0", "471", { lowVmax: true }),
  E("BAL", "160", "10", "", "PERPIGNAN BV", "", "", "", "467.5", { lowVmax: true }),
];

async function main() {
  const path = "C:/Users/micha/Dropbox/LIM/logs/Logs2/Livret/FT_TGV_INOUI_BCW-PPN 04-08-2026_20260807_085437.xlsx";
  const buf = readFileSync(path);
  const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  const rows = await parseLigneSheet(await openClasseur(arrayBuffer), "CT→PPN");
  const parsed = rows.filter((r): r is ImportedLignePoint => !("type" in r));
  const notes = rows.filter((r): r is ImportedNote => "type" in r);

  console.log(`Parsé : ${parsed.length} points. Attendu : ${EXPECTED.length} points.`);
  let mismatches = 0;
  const n = Math.max(parsed.length, EXPECTED.length);
  for (let i = 0; i < n; i++) {
    const p = parsed[i];
    const e = EXPECTED[i];
    if (!p || !e) {
      console.log(`#${i}: ${!p ? "MANQUANT côté parseur" : "EN TROP côté parseur"}`, p ?? e);
      mismatches++;
      continue;
    }
    const diffs: string[] = [];
    for (const key of ["bloc", "vmax", "rampe", "etcs", "etablissement", "pkAdif", "pkLfp", "pkRac", "pkRfn"] as const) {
      if (p[key] !== e[key]) diffs.push(`${key}: parsé="${p[key]}" attendu="${e[key]}"`);
    }
    if ((p.csv === true) !== (e.csv === true)) diffs.push(`csv: parsé=${p.csv} attendu=${e.csv === true}`);
    const expLow = e.lowVmax === true;
    if ((p.vmaxConfidence === "basse") !== expLow) {
      diffs.push(`vmaxConfidence: parsé=${p.vmaxConfidence} attendu=${expLow ? "basse" : "haute"}`);
    }
    if (diffs.length > 0) {
      console.log(`#${i} (src row ${p.sourceRow}, ${e.etablissement || e.pkAdif || e.pkLfp || e.pkRac}):`, diffs.join(" | "), e.gap ? `[gap: ${e.gap}]` : "");
      mismatches++;
    }
  }
  // Notes attendues sur CT→PPN (le segment Can Tunis n'y porte PAS la note 60km/h,
  // et 619.9 y est absent — particularités déjà relevées de cette feuille modèle).
  const EXPECTED_NOTES: Array<[string, "au-dessus" | "en-dessous", boolean]> = [
    ["80km/h circulation en MODE SR et en BSL — 621.692 al 623.758", "en-dessous", true],
    ["35 vias estacionam V11 V19 / V10 V18", "au-dessus", false],
    ["155  TASF KM 715.514 al 716.838", "en-dessous", false],
    ["80 AL PASO V3 V4 V6", "au-dessus", false],
  ];
  console.log(`\nNotes : ${notes.length} trouvées, ${EXPECTED_NOTES.length} attendues`);
  for (let i = 0; i < Math.max(notes.length, EXPECTED_NOTES.length); i++) {
    const n = notes[i];
    const e = EXPECTED_NOTES[i];
    if (!n || !e) { console.log(`✗ note #${i} manquante d'un côté :`, n ?? e); mismatches++; continue; }
    const d: string[] = [];
    if (n.texte !== e[0]) d.push(`texte "${n.texte}" ≠ "${e[0]}"`);
    if (n.position !== e[1]) d.push(`position ${n.position} ≠ ${e[1]}`);
    if (n.surligne !== e[2]) d.push(`surligne ${n.surligne} ≠ ${e[2]}`);
    if (d.length) { console.log(`✗ note #${i} :`, d.join(" | ")); mismatches++; }
  }
  console.log(mismatches === 0 ? "\n✅ TOUT CONCORDE (lacunes connues annotées)" : `\n❌ ${mismatches} point(s) en écart`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

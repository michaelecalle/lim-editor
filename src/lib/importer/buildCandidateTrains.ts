// src/lib/importer/buildCandidateTrains.ts
//
// Extrait les TRAINS candidats d'un classeur Excel source : une feuille par train
// (nom sans « → » ; les feuilles modèles contiennent une flèche). Le numéro vient de
// la cellule A1 de la 1re page (JAMAIS de l'en-tête relation, non fiable — leçon du
// 38510) ; l'origine/destination viennent du PREMIER et DERNIER point NOMMÉS de la
// fiche elle-même. La version et sa date viennent du bandeau « Version NN du
// JJ/MM/AAAA ».
import {
  parseLigneSheet,
  type Classeur,
  type ImportedLignePoint,
} from "./parseLigneModele";
import { deriveNumeroFrance } from "../../components/tabs/Normalise2026Tab";

export type CandidateTrain = {
  numero: string; // = valeur trouvée en A1, sert d'IDENTIFIANT (clé) uniquement.
  numeroEspagne: string;
  numeroFrance: string;
  direction: "sudNord" | "nordSud";
  origine: string;
  destination: string;
  numeroVersion: string; // "01"
  dateVigueur: string; // ISO "2026-08-04"
  points: ImportedLignePoint[]; // avec horaires arr/pass/dep
};

export async function buildCandidateTrains(classeur: Classeur): Promise<CandidateTrain[]> {
  const { workbook } = classeur;
  const out: CandidateTrain[] = [];
  for (const sheet of workbook.worksheets) {
    if (sheet.name.includes("→")) continue; // feuille modèle (ligne), pas un train

    const a1 = sheet.getRow(1).getCell(1).value;
    const numero = String(typeof a1 === "number" ? a1 : (a1 ?? "")).trim();
    if (!/^\d{3,6}$/.test(numero)) continue;

    // Bandeau version : « Version 01 du 04/08/2026 » (ligne 2, zone E — on balaie).
    let numeroVersion = "";
    let dateVigueur = "";
    for (let c = 1; c <= 12; c++) {
      const v = sheet.getRow(2).getCell(c).value;
      const txt =
        v && typeof v === "object" && "result" in (v as object)
          ? String((v as { result?: unknown }).result ?? "")
          : String(v ?? "");
      const m = txt.match(/Version\s+(\d+)\s+du\s+(\d{2})\/(\d{2})\/(\d{4})/i);
      if (m) {
        numeroVersion = m[1];
        dateVigueur = `${m[4]}-${m[3]}-${m[2]}`;
        break;
      }
    }

    const rows = await parseLigneSheet(classeur, sheet.name);
    const points = rows.filter((r): r is ImportedLignePoint => !("type" in r));
    if (points.length === 0) continue;

    // Sens : déduit du premier point (réseau de départ), pas de l'en-tête.
    const first = points[0];
    const direction: "sudNord" | "nordSud" = first.pkRfn !== "" ? "nordSud" : "sudNord";

    // Réseau du point d'ORIGINE (pas la direction sudNord/nordSud, qui suit une
    // convention PK-décroissant indépendante du pays réel — cf. cas 38510) :
    // détermine si le numéro trouvé en A1 est l'espagnol ou le français. Vérifié
    // sur les vrais PDF 9711/9713/9715 (20/08) : leur page 1 démarre à PERPIGNAN
    // BV (réseau France) et affiche pourtant le numéro trouvé en A1 (9711/9713/
    // 9715) — c'est donc le numéro FRANÇAIS pour ces trains-là, pas l'espagnol
    // comme l'ancien code le supposait systématiquement. Même logique que
    // `reseauDePoint`/`numeroPourReseau` dans buildFtRows2026.ts (export PDF).
    const origineEnEspagne = first.pkAdif !== "";
    const numeroEspagne = origineEnEspagne ? numero : deriveNumeroFrance(numero);
    const numeroFrance = origineEnEspagne ? deriveNumeroFrance(numero) : numero;

    const named = points.filter((p) => p.etablissement.trim() !== "");
    out.push({
      numero,
      numeroEspagne,
      numeroFrance,
      direction,
      origine: named[0]?.etablissement ?? "",
      destination: named[named.length - 1]?.etablissement ?? "",
      numeroVersion,
      dateVigueur,
      points,
    });
  }
  return out;
}

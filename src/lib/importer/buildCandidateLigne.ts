// src/lib/importer/buildCandidateLigne.ts
//
// Assemble les données LIGNE candidates depuis un ou plusieurs classeurs Excel :
//   1. toutes les feuilles MODÈLES (nom contenant « → ») de tous les classeurs sont
//      parsées, puis classées par sens — détection par l'ORDRE des PK ADIF (croissants
//      → sudNord, décroissants → nordSud), robuste aux segments qui démarrent hors du
//      réseau attendu (ex. « BCW→CT » commence en ADIF alors qu'il est nord-sud) ;
//   2. par sens, on part du segment le plus LONG puis on enchaîne les segments qui le
//      prolongent (1er point du suivant = dernier point de la chaîne) ; le point de
//      JONCTION est dédoublonné en gardant la version du segment AJOUTÉ (zone abordée,
//      même convention que les transitions), horaires absorbés au besoin. Les segments
//      strictement inclus dans la chaîne (ex. « BCW→PPN » ⊂ « CT→PPN ») sont ignorés.
import {
  openClasseur,
  parseLigneSheet,
  type Classeur,
  type ImportedLigneRow,
  type ImportedLignePoint,
} from "./parseLigneModele";

const PK_FIELDS = ["pkAdif", "pkLfp", "pkRac", "pkRfn"] as const;

function samePk(a: ImportedLignePoint, b: ImportedLignePoint): boolean {
  return PK_FIELDS.some((f) => a[f] !== "" && b[f] !== "" && Number(a[f]) === Number(b[f]));
}

function dataPoints(rows: ImportedLigneRow[]): ImportedLignePoint[] {
  return rows.filter((r): r is ImportedLignePoint => !("type" in r));
}

// Sens d'un segment : ordre des PK ADIF (le réseau le plus long, toujours présent).
export function detectDirection(points: ImportedLignePoint[]): "sudNord" | "nordSud" | null {
  const adif = points.filter((p) => p.pkAdif !== "").map((p) => Number(p.pkAdif));
  if (adif.length >= 2) return adif[0] < adif[adif.length - 1] ? "sudNord" : "nordSud";
  // Segment sans tronçon ADIF significatif : réseau du premier point.
  const first = points[0];
  if (!first) return null;
  return first.pkRfn !== "" ? "nordSud" : "sudNord";
}

function chainSegments(segments: ImportedLigneRow[][]): ImportedLigneRow[] {
  if (segments.length === 0) return [];
  const sorted = [...segments].sort((a, b) => dataPoints(b).length - dataPoints(a).length);
  let chain = sorted[0];
  const rest = sorted.slice(1);
  let extended = true;
  while (extended) {
    extended = false;
    for (let i = 0; i < rest.length; i++) {
      const seg = rest[i];
      const chainPts = dataPoints(chain);
      const segPts = dataPoints(seg);
      if (chainPts.length === 0 || segPts.length === 0) continue;
      const chainLast = chainPts[chainPts.length - 1];
      const chainFirst = chainPts[0];
      if (samePk(chainLast, segPts[0])) {
        // Prolonge par la fin : jonction dédoublonnée, la version du segment ajouté
        // (zone abordée) fait foi, horaires absorbés.
        for (const f of ["arr", "pass", "dep"] as const) {
          if (!segPts[0][f] && chainLast[f]) segPts[0][f] = chainLast[f];
        }
        chain = [...chain.filter((r) => r !== chainLast), ...seg];
        rest.splice(i, 1);
        extended = true;
        break;
      }
      if (samePk(segPts[segPts.length - 1], chainFirst)) {
        // Prolonge par le début (cas symétrique).
        for (const f of ["arr", "pass", "dep"] as const) {
          if (!chainFirst[f] && segPts[segPts.length - 1][f]) chainFirst[f] = segPts[segPts.length - 1][f];
        }
        chain = [...seg.filter((r) => r !== segPts[segPts.length - 1]), ...chain];
        rest.splice(i, 1);
        extended = true;
        break;
      }
    }
  }
  return chain;
}

export async function buildCandidateLigne(
  classeurs: Classeur[]
): Promise<{ sudNord: ImportedLigneRow[]; nordSud: ImportedLigneRow[] }> {
  const segments: Record<"sudNord" | "nordSud", ImportedLigneRow[][]> = {
    sudNord: [],
    nordSud: [],
  };
  for (const classeur of classeurs) {
    for (const sheet of classeur.workbook.worksheets) {
      if (!sheet.name.includes("→")) continue;
      const rows = await parseLigneSheet(classeur, sheet.name);
      const direction = detectDirection(dataPoints(rows));
      if (direction) segments[direction].push(rows);
    }
  }
  return {
    sudNord: chainSegments(segments.sudNord),
    nordSud: chainSegments(segments.nordSud),
  };
}

export { openClasseur };

// src/lib/importer/runImport.ts
//
// Orchestrateur d'import : classeurs Excel → candidats (ligne + trains) → diffs
// contre l'état COURANT du Normalisé 2026. Pur (aucun accès stockage) : le composant
// fournit l'état courant et applique les décisions.
import { buildCandidateLigne, openClasseur } from "./buildCandidateLigne";
import { buildCandidateTrains, type CandidateTrain } from "./buildCandidateTrains";
import { diffLignePoints, type LigneDiff } from "./diffLigne";
import { diffTrains, type CurrentTrain, type TrainDiff } from "./diffTrains";
import { deriveTrainDirection, type LignePoint } from "../../components/tabs/Normalise2026Tab";
import { repairKnownVmaxIssues } from "./repairKnownVmaxIssues";

export type ImportResult = {
  ligneDiffs: LigneDiff[];
  trainDiffs: TrainDiff[];
  candidates: CandidateTrain[];
  dateVigueur: string;
};

export async function runImport(
  buffers: ArrayBuffer[],
  currentLigne: { sudNord: LignePoint[]; nordSud: LignePoint[] },
  currentTrains: CurrentTrain[]
): Promise<ImportResult> {
  // Correctifs Vmax connus (points-frontières mal positionnés dans le document
  // source, cf. mémoire projet) appliqués de façon transparente AVANT tout
  // parsing — l'utilisateur dépose le fichier tel quel, reçu du créateur.
  const repairedBuffers = await Promise.all(buffers.map((b) => repairKnownVmaxIssues(b)));

  // Chaque classeur est ouvert UNE seule fois puis partagé entre les parseurs.
  const classeurs = await Promise.all(repairedBuffers.map((b) => openClasseur(b)));
  const ligne = await buildCandidateLigne(classeurs);
  const candidates: CandidateTrain[] = [];
  for (const c of classeurs) candidates.push(...(await buildCandidateTrains(c)));

  // Sens de circulation : re-déduit d'origine/destination (comparaison à l'ordre
  // réel des données ligne) plutôt que de garder le repli "1er point du classeur"
  // de buildCandidateTrains — même fonction canonique que l'édition manuelle
  // (demande utilisateur, 11/08, suite au bug 38510/9711/9713/9715). Essaie
  // d'abord contre la ligne COURANTE (cas normal), puis contre la ligne
  // fraîchement importée (cas d'un établissement tout juste ajouté par cet
  // import) ; si les deux sont indéterminables, garde le repli existant.
  for (const c of candidates) {
    const fromCurrent = deriveTrainDirection(currentLigne.sudNord, currentLigne.nordSud, c.origine, c.destination);
    const fromImported = fromCurrent ?? deriveTrainDirection(ligne.sudNord, ligne.nordSud, c.origine, c.destination);
    if (fromImported) c.direction = fromImported;
  }

  const dateVigueur = candidates.find((c) => c.dateVigueur)?.dateVigueur ?? "";
  const ligneDiffs = [
    ...(ligne.sudNord.length > 0 ? diffLignePoints(currentLigne.sudNord, ligne.sudNord, "sudNord") : []),
    ...(ligne.nordSud.length > 0 ? diffLignePoints(currentLigne.nordSud, ligne.nordSud, "nordSud") : []),
  ];
  const trainDiffs = diffTrains(currentTrains, candidates, currentLigne, dateVigueur);
  return { ligneDiffs, trainDiffs, candidates, dateVigueur };
}

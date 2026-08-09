// src/lib/importer/runImport.ts
//
// Orchestrateur d'import : classeurs Excel → candidats (ligne + trains) → diffs
// contre l'état COURANT du Normalisé 2026. Pur (aucun accès stockage) : le composant
// fournit l'état courant et applique les décisions.
import { buildCandidateLigne, openClasseur } from "./buildCandidateLigne";
import { buildCandidateTrains, type CandidateTrain } from "./buildCandidateTrains";
import { diffLignePoints, type LigneDiff } from "./diffLigne";
import { diffTrains, type CurrentTrain, type TrainDiff } from "./diffTrains";
import type { LignePoint } from "../../components/tabs/Normalise2026Tab";

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
  // Chaque classeur est ouvert UNE seule fois puis partagé entre les parseurs.
  const classeurs = await Promise.all(buffers.map((b) => openClasseur(b)));
  const ligne = await buildCandidateLigne(classeurs);
  const candidates: CandidateTrain[] = [];
  for (const c of classeurs) candidates.push(...(await buildCandidateTrains(c)));

  const dateVigueur = candidates.find((c) => c.dateVigueur)?.dateVigueur ?? "";
  const ligneDiffs = [
    ...(ligne.sudNord.length > 0 ? diffLignePoints(currentLigne.sudNord, ligne.sudNord, "sudNord") : []),
    ...(ligne.nordSud.length > 0 ? diffLignePoints(currentLigne.nordSud, ligne.nordSud, "nordSud") : []),
  ];
  const trainDiffs = diffTrains(currentTrains, candidates, currentLigne, dateVigueur);
  return { ligneDiffs, trainDiffs, candidates, dateVigueur };
}

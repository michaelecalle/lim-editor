// src/modules/pdf2026/buildPdfInfoPropsForTrain2026.ts
//
// Convertit les données d'un train du format 2026 (`Normalise2026Tab.tsx`) en props
// pour `PdfBlocInfo2026`. Types d'entrée déclarés localement (structurellement
// compatibles avec `TrainDraft`/`LigneVersion`, non exportés du composant) — même
// convention que `diffTrains.ts` (`CurrentTrain`) pour ne pas coupler ce module à
// l'implémentation interne de l'onglet.
import type { PdfBlocInfo2026Props } from "../../components/pdf2026/PdfBlocInfo2026";

export type Train2026Input = {
  numeroEspagne: string;
  numeroFrance: string;
  origine: string;
  destination: string;
  categorieSNCF: string;
  categorieLFP: string;
  categorieADIF: string;
  materiel: string;
  direction: "sudNord" | "nordSud";
};

export type LigneVersion2026Input = {
  numeroVersion: string;
  dateVigueur: string; // ISO (AAAA-MM-JJ)
  mentions: Array<{ titre: string; contenu: string }>;
};

function formatDateFr(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

export function buildPdfInfoPropsForTrain2026(
  train: Train2026Input,
  ligneVersion: LigneVersion2026Input,
  // Numéro affiché en tête de fiche : celui du réseau où le train se trouve au
  // 1er point de la page 1 (pas déduit de la direction globale — un train
  // peut circuler entièrement d'un côté de la frontière quel que soit son sens
  // de PK) — calculé par `buildFtRows2026` (`numeroPage1`), qui a accès au
  // détail des points parcourus, cf. mémoire projet (12/08).
  numero: string
): PdfBlocInfo2026Props {
  return {
    numero,
    materiel: train.materiel,
    categorieSNCF: train.categorieSNCF,
    categorieLFP: train.categorieLFP,
    categorieADIF: train.categorieADIF,
    origine: train.origine,
    destination: train.destination,
    numeroVersion: ligneVersion.numeroVersion,
    dateVigueur: formatDateFr(ligneVersion.dateVigueur),
    mentions: ligneVersion.mentions.map((m) => (m.titre ? `${m.titre} : ${m.contenu}` : m.contenu)),
  };
}

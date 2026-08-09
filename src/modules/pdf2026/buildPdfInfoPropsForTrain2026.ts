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

// Numéro affiché en tête de fiche : le document montre le numéro du réseau où le
// train PREND SON DÉPART (espagnol pour un sud-nord parti d'Espagne, français pour
// un nord-sud parti de France — confirmé par l'utilisateur en observant les fiches
// sources : la 1re page d'un train nord-sud porte son numéro français).
function numeroAffiche(train: Train2026Input): string {
  return train.direction === "nordSud"
    ? train.numeroFrance || train.numeroEspagne
    : train.numeroEspagne || train.numeroFrance;
}

export function buildPdfInfoPropsForTrain2026(
  train: Train2026Input,
  ligneVersion: LigneVersion2026Input
): PdfBlocInfo2026Props {
  return {
    numero: numeroAffiche(train),
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

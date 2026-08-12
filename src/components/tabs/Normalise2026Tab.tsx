import { useEffect, useState } from "react";
import ImportDiffModal, { type Decision } from "../ImportDiffModal";
import { runImport, type ImportResult } from "../../lib/importer/runImport";
import { applyLigneActions, applyTrainActions } from "../../lib/importer/applyDiffs";
import { buildPointMatcher, identityKey as diffIdentityKey } from "../../lib/importer/diffLigne";
import type { CurrentTrain } from "../../lib/importer/diffTrains";
import { fetchLigneFt2026Current, publishLigneFt2026Data } from "../../modules/ft-editor/api/ligneft2026Api";

// Onglet « Normalisé 2026 » — construction du nouveau format de fiche train, champ
// par champ. Le bouton « Valider » (futur « Publier ») génère un fichier normalisé
// local que l'éditeur CONSULTE au chargement.
//
// STRUCTURE EN 4 CADRES (07/08) :
//   1. Sélection du train (sélecteur + Valider)
//   2. Données train (↔ bloc Info de LIM : numéro, origine/destination, catégories, matériel)
//   3. Fiche train (ÉDITABLE : ce qui s'affichera pour CE train = tranche des données
//      ligne entre origine et destination) — éditer ici = éditer la donnée LIGNE (tous trains)
//   4. Données ligne (socle commun : mentions + tableau complet de la ligne)

// ---------------------------------------------------------------------------
// DONNÉES LIGNE (socle commun) — SENS SUD → NORD (Can Tunis → Perpignan).
// UN PK PAR RÉSEAU : ADIF / LFP / RAC / SNCF (interne pkRfn). Réseau DÉDUIT des
// colonnes remplies ; points de TRANSITION = deux PK.
// Bloc (bloqueo) : VALEUR NUE (BCA / ETCS1 / BAL, libellés nouvelle fiche).
// PK corrigés préservés (MOLLET 640.9, LLINARS 662.5, RIELLS 679.3, FIGUERES 749.6).
// ---------------------------------------------------------------------------
export type LignePoint = {
  // Absent = point de données ; "note" = remarque (texte libre, affichée en rouge).
  type?: "note";
  texte?: string; // contenu de la note
  // Ancrage de la note : "au-dessus" = collée à la ligne QUI LA SUIT ; "en-dessous" =
  // collée à la ligne QUI LA PRÉCÈDE. Distinction importante pour le rendu de la FT
  // à l'échelle (la note doit rester attachée à SA ligne).
  position?: "au-dessus" | "en-dessous";
  // Note surlignée (fond pêche, comme sur le document — ex. la note 80km/h SR/BSL).
  surligne?: boolean;
  bloc: string;
  vmax: string;
  // CSV = Changement Significatif de Vitesse (donnee LIGNE). Dans le document, la
  // cellule Vmax est sur fond orange. Se determine sur la LIGNE ENTIERE, pas sur la
  // tranche d'un train (une 1re vitesse de fiche peut etre un CSV vu de la ligne).
  csv?: boolean;
  // Radio : VALEUR NUE "G" (glyphe Ⓖ du document, sans le cercle). Vaut pour TOUTE la
  // ligne (une seule zone radio sur le parcours) — le document ne l'affiche qu'une
  // fois par page (clarté), LIM le gère par « scroll intelligent ». Répétée sur
  // chaque ligne dans l'éditeur, comme le Bloc.
  radio: string;
  // Rampe (ex "Ramp Carac.", en-tete desormais une fleche) : VALEUR NUE, repetee sur
  // chaque ligne de sa zone (comme Bloc). Valeurs prises dans le NOUVEAU document
  // (source de verite confirmee par l'utilisateur en cas de divergence).
  rampe: string;
  // Niveau ETCS : VALEUR NUE "1" (symbole "①" du document, sans le cercle). Marque le
  // niveau ETCS 1, présent uniquement en zone ADIF (vide sur LFP/RAC/SNCF — cf. ancien
  // normalisé). Dans le document, le symbole n'apparaît qu'une fois par page, à une
  // ligne arbitraire (colonne sans en-tête, cadre décalé) : artefact d'impression, la
  // vraie valeur est constante sur toute la zone ADIF. Répétée sur chaque ligne dans
  // l'éditeur, comme Bloc/Radio/Rampe.
  etcs: string;
  etablissement: string;
  pkAdif: string;
  pkLfp: string;
  pkRac: string;
  pkRfn: string; // réseau SNCF (RFN) — affiché « SNCF »
  // PK interne : valeur physique unifiée sur toute la ligne (indépendante du réseau),
  // reprise TELLE QUELLE de l'ancien normalisé (`ligneFT.normalized.json`) — PAS
  // calculable depuis les PK réseau (vérifié : le segment RAC n'est pas sur une
  // échelle 1:1 avec pkInterne). Optionnel pour ne pas casser les literals/imports
  // existants qui n'en ont pas encore ; "" (ou absent) = inconnu.
  pkInterne?: string;
  note?: string;
};

// PK interne des points HORS ADIF (les points ADIF ont pkInterne === pkAdif,
// vérifié exact sur les 37 points ADIF de l'ancien normalisé) — valeurs reprises
// telles quelles de `ligneFT.normalized.json`, identiques dans les deux sens
// (vérifié : les 2 blocs direction de l'ancien fichier donnent les mêmes
// valeurs, y compris pour les 3 points de transition dont les PK RÉSEAU locaux
// diffèrent pourtant selon le sens — pkInterne, lui, ne dépend pas du sens).
const PK_INTERNE_HORS_ADIF: Record<string, string> = {
  "Tunnel du Perthus - tête sud": "771.2",
  "Frontière Espagne France": "772.2",
  "Frontière France Espagne": "772.2", // ordre des mots inversé côté nordSud
  "Tunnel du Perthus - tête nord": "779.7",
  "Saut de Mouton": "783.9",
  "Limite LGV-Rac": "799.7",
  "Limite RAC LFP-RFF": "802",
  "PERPIGNAN BV": "805.5",
};

function withPkInterne(points: LignePoint[]): LignePoint[] {
  return points.map((p) => {
    if (p.type === "note") return { ...p, pkInterne: "" };
    return { ...p, pkInterne: p.pkAdif || PK_INTERNE_HORS_ADIF[p.etablissement] || "" };
  });
}

export const DEFAULT_LIGNE_SUD_NORD: LignePoint[] = withPkInterne([
  // — Section Can Tunis → Barcelona (fiche 39819) · ADIF —
  { bloc: "BCA", vmax: "30", radio: "G", rampe: "30", etcs: "1", etablissement: "CAN TUNIS-AV", pkAdif: "615.9", pkLfp: "", pkRac: "", pkRfn: "" },
  { bloc: "BCA", vmax: "95", radio: "G", rampe: "30", etcs: "1", etablissement: "BIF CAN TUNIS-AV", pkAdif: "616.0", pkLfp: "", pkRac: "", pkRfn: "" },
  { bloc: "BCA", vmax: "85", radio: "G", rampe: "30", etcs: "1", etablissement: "", pkAdif: "618.1", pkLfp: "", pkRac: "", pkRfn: "" },
  { bloc: "BCA", vmax: "60", radio: "G", rampe: "30", etcs: "1", etablissement: "", pkAdif: "619.9", pkLfp: "", pkRac: "", pkRfn: "" },
  { bloc: "BCA", vmax: "30", radio: "G", rampe: "30", etcs: "1", csv: true, etablissement: "", pkAdif: "620.2", pkLfp: "", pkRac: "", pkRfn: "" },
  // — Page 1 · ADIF —
  { bloc: "BCA", vmax: "30", radio: "G", rampe: "28", etcs: "1", etablissement: "BARCELONA SANTS", pkAdif: "621.0", pkLfp: "", pkRac: "", pkRfn: "" },
  { bloc: "BCA", vmax: "140", radio: "G", rampe: "28", etcs: "1", etablissement: "", pkAdif: "621.7", pkLfp: "", pkRac: "", pkRfn: "" },
  { type: "note", texte: "80km/h circulation en MODE SR et en BSL — 621.692 al 623.758", position: "en-dessous", surligne: true, bloc: "", radio: "", rampe: "", etcs: "", vmax: "", etablissement: "", pkAdif: "", pkLfp: "", pkRac: "", pkRfn: "" },
  { bloc: "BCA", vmax: "80", radio: "G", rampe: "28", etcs: "1", etablissement: "", pkAdif: "623.8", pkLfp: "", pkRac: "", pkRfn: "" },
  { bloc: "BCA", vmax: "140", radio: "G", rampe: "28", etcs: "1", etablissement: "", pkAdif: "624.3", pkLfp: "", pkRac: "", pkRfn: "" },
  { bloc: "BCA", vmax: "45", radio: "G", rampe: "28", etcs: "1", csv: true, etablissement: "", pkAdif: "626.7", pkLfp: "", pkRac: "", pkRfn: "" },
  { type: "note", texte: "35 vias estacionam V11 V19 / V10 V18", position: "au-dessus", bloc: "", radio: "", rampe: "", etcs: "", vmax: "", etablissement: "", pkAdif: "", pkLfp: "", pkRac: "", pkRfn: "" },
  { bloc: "BCA", vmax: "45", radio: "G", rampe: "28", etcs: "1", etablissement: "LA SAGRERA", pkAdif: "627.7", pkLfp: "", pkRac: "", pkRfn: "", note: "ex « LA SAGRERA AV »" },
  { bloc: "BCA", vmax: "110", radio: "G", rampe: "28", etcs: "1", etablissement: "", pkAdif: "629.4", pkLfp: "", pkRac: "", pkRfn: "" },
  { bloc: "BCA", vmax: "130", radio: "G", rampe: "28", etcs: "1", etablissement: "", pkAdif: "630.7", pkLfp: "", pkRac: "", pkRfn: "" },
  { bloc: "BCA", vmax: "200", radio: "G", rampe: "28", etcs: "1", etablissement: "", pkAdif: "632.4", pkLfp: "", pkRac: "", pkRfn: "" },
  { bloc: "BCA", vmax: "185", radio: "G", rampe: "28", etcs: "1", etablissement: "", pkAdif: "639.8", pkLfp: "", pkRac: "", pkRfn: "" },
  { bloc: "BCA", vmax: "185", radio: "G", rampe: "28", etcs: "1", etablissement: "Bif. MOLLET", pkAdif: "640.9", pkLfp: "", pkRac: "", pkRfn: "", note: "PK corrigé (papier 640.5)" },
  { bloc: "BCA", vmax: "185", radio: "G", rampe: "18", etcs: "1", etablissement: "Bif. MOLLET- AG KM 641.3", pkAdif: "641.3", pkLfp: "", pkRac: "", pkRfn: "" },
  { bloc: "BCA", vmax: "195", radio: "G", rampe: "18", etcs: "1", etablissement: "", pkAdif: "641.9", pkLfp: "", pkRac: "", pkRfn: "" },
  { bloc: "BCA", vmax: "200", radio: "G", rampe: "18", etcs: "1", etablissement: "", pkAdif: "643.6", pkLfp: "", pkRac: "", pkRfn: "" },
  { bloc: "BCA", vmax: "200", radio: "G", rampe: "18", etcs: "1", etablissement: "Bif. MOLLET - AG KM 644.3", pkAdif: "644.3", pkLfp: "", pkRac: "", pkRfn: "" },
  { bloc: "BCA", vmax: "200", radio: "G", rampe: "18", etcs: "1", etablissement: "PCA LA ROCA", pkAdif: "654.1", pkLfp: "", pkRac: "", pkRfn: "", note: "nouveau" },
  { bloc: "BCA", vmax: "200", radio: "G", rampe: "18", etcs: "1", etablissement: "LLINARS", pkAdif: "662.5", pkLfp: "", pkRac: "", pkRfn: "", note: "PK corrigé (papier 662.1)" },
  { bloc: "BCA", vmax: "200", radio: "G", rampe: "18", etcs: "1", etablissement: "PCA SANT CELONI", pkAdif: "670.5", pkLfp: "", pkRac: "", pkRfn: "", note: "nouveau" },
  { bloc: "BCA", vmax: "200", radio: "G", rampe: "18", etcs: "1", etablissement: "RIELLS", pkAdif: "679.3", pkLfp: "", pkRac: "", pkRfn: "", note: "PK corrigé (papier 678.1)" },
  // — Page 2 · ADIF —
  { bloc: "BCA", vmax: "200", radio: "G", rampe: "18", etcs: "1", etablissement: "BASE MTO RIELLS", pkAdif: "682.0", pkLfp: "", pkRac: "", pkRfn: "" },
  { bloc: "BCA", vmax: "200", radio: "G", rampe: "18", etcs: "1", etablissement: "PCA RIUDARENES", pkAdif: "691.9", pkLfp: "", pkRac: "", pkRfn: "", note: "nouveau" },
  { bloc: "BCA", vmax: "200", radio: "G", rampe: "18", etcs: "1", etablissement: "VILOBI D'ONYAR", pkAdif: "703.5", pkLfp: "", pkRac: "", pkRfn: "" },
  { bloc: "BCA", vmax: "125", radio: "G", rampe: "18", etcs: "1", csv: true, etablissement: "", pkAdif: "709.9", pkLfp: "", pkRac: "", pkRfn: "" },
  { bloc: "BCA", vmax: "125", radio: "G", rampe: "18", etcs: "1", etablissement: "Bif. GIRONA-MERCADERIES", pkAdif: "710.7", pkLfp: "", pkRac: "", pkRfn: "" },
  { bloc: "BCA", vmax: "120", radio: "G", rampe: "18", etcs: "1", etablissement: "", pkAdif: "713.2", pkLfp: "", pkRac: "", pkRfn: "" },
  { bloc: "BCA", vmax: "120", radio: "G", rampe: "18", etcs: "1", etablissement: "GIRONA", pkAdif: "714.7", pkLfp: "", pkRac: "", pkRfn: "" },
  { bloc: "BCA", vmax: "165", radio: "G", rampe: "18", etcs: "1", etablissement: "", pkAdif: "715.5", pkLfp: "", pkRac: "", pkRfn: "" },
  { type: "note", texte: "155  TASF KM 715.514 al 716.838", position: "en-dessous", bloc: "", radio: "", rampe: "", etcs: "", vmax: "", etablissement: "", pkAdif: "", pkLfp: "", pkRac: "", pkRfn: "" },
  { bloc: "BCA", vmax: "200", radio: "G", rampe: "18", etcs: "1", etablissement: "", pkAdif: "716.8", pkLfp: "", pkRac: "", pkRfn: "" },
  { bloc: "BCA", vmax: "200", radio: "G", rampe: "18", etcs: "1", etablissement: "PCA VILADEMULS", pkAdif: "726.2", pkLfp: "", pkRac: "", pkRfn: "", note: "nouveau" },
  { bloc: "BCA", vmax: "200", radio: "G", rampe: "18", etcs: "1", etablissement: "PCA PONTOS", pkAdif: "738.2", pkLfp: "", pkRac: "", pkRfn: "", note: "nouveau" },
  { type: "note", texte: "80 AL PASO V3 V4 V6", position: "au-dessus", bloc: "", radio: "", rampe: "", etcs: "", vmax: "", etablissement: "", pkAdif: "", pkLfp: "", pkRac: "", pkRfn: "" },
  { bloc: "BCA", vmax: "200", radio: "G", rampe: "18", etcs: "1", etablissement: "FIGUERES-VILAFANT", pkAdif: "749.6", pkLfp: "", pkRac: "", pkRfn: "", note: "PK corrigé (papier 748.9)" },
  // — Transition ADIF / LFP —
  // Convention (reprise de l'ancien normalisé, validée en service) : le point de
  // transition porte le bloc du canton ABORDÉ dans le sens de circulation.
  { bloc: "ETCS1", vmax: "300", radio: "G", rampe: "18", etcs: "", etablissement: "Limite ADIF-LFPSA", pkAdif: "752.4", pkLfp: "44.4", pkRac: "", pkRfn: "", note: "transition ADIF/LFP" },
  // — Page 2 · LFP —
  { bloc: "ETCS1", vmax: "300", radio: "G", rampe: "18", etcs: "", etablissement: "Tunnel du Perthus - tête sud", pkAdif: "", pkLfp: "25.6", pkRac: "", pkRfn: "" },
  { bloc: "ETCS1", vmax: "300", radio: "G", rampe: "18", etcs: "", etablissement: "Frontière Espagne France", pkAdif: "", pkLfp: "24.6", pkRac: "", pkRfn: "" },
  { bloc: "ETCS1", vmax: "300", radio: "G", rampe: "18", etcs: "", etablissement: "Tunnel du Perthus - tête nord", pkAdif: "", pkLfp: "17.1", pkRac: "", pkRfn: "" },
  { bloc: "ETCS1", vmax: "300", radio: "G", rampe: "18", etcs: "", etablissement: "Saut de Mouton", pkAdif: "", pkLfp: "12.9", pkRac: "", pkRfn: "" },
  // — Transition LFP / RAC — (bloc = BAL et rampe = 10 : canton abordé, cf. convention ci-dessus)
  { bloc: "BAL", vmax: "160", radio: "G", rampe: "10", etcs: "", etablissement: "Limite LGV-Rac", pkAdif: "", pkLfp: "1.2", pkRac: "4.5", pkRfn: "", note: "transition LFP/RAC" },
  // — Transition RAC / SNCF —
  { bloc: "BAL", vmax: "160", radio: "G", rampe: "10", etcs: "", etablissement: "Limite RAC LFP-RFF", pkAdif: "", pkLfp: "", pkRac: "0", pkRfn: "471", note: "transition RAC/SNCF" },
  // — Page 2 · SNCF (RFN) —
  { bloc: "BAL", vmax: "160", radio: "G", rampe: "10", etcs: "", etablissement: "PERPIGNAN BV", pkAdif: "", pkLfp: "", pkRac: "", pkRfn: "467.5" },
]);

// ---------------------------------------------------------------------------
// DONNÉES LIGNE — SENS NORD → SUD (Perpignan → Can Tunis), 07/08.
// Mêmes points physiques que DEFAULT_LIGNE_SUD_NORD (mêmes PK — réutilisés tels
// quels, JAMAIS corrigés depuis le document horaire : les PK du document ADIF
// source sont parfois faux, ceux de l'app viennent du schéma de ligne / ancres
// GPS et sont la vraie référence physique — règle rappelée par l'utilisateur
// 07/08). SEULE EXCEPTION : les 3 points de TRANSITION réseau, dont le PK
// diffère RÉELLEMENT selon le sens (confirmé par l'utilisateur) → PK propres,
// lus dans le document nord-sud.
// Bloc/Vmax/Rampe/CSV : contrairement aux autres colonnes, DÉPENDENT RÉELLEMENT
// du sens de circulation (rampe↔pente ; confirmé aussi pour Vmax et CSV par
// l'utilisateur) → valeurs relues indépendamment dans le document nord-sud,
// PAS réutilisées depuis le socle sud-nord (divergences de zone attendues et
// normales, pas des erreurs).
// Sources : fiche 9711 (Perpignan→Barcelona Sants) + fiche 38510 (Barcelona
// Sants→Can Tunis, comble le tronçon manquant — même rôle que 39819 côté
// sud-nord). Horaires 38510 NON repris (train différent, ligne seulement).
// ---------------------------------------------------------------------------
export const DEFAULT_LIGNE_NORD_SUD: LignePoint[] = withPkInterne([
  // — Page 1 (9711) · SNCF (RFN) puis RAC —
  { bloc: "BAL", vmax: "160", radio: "G", rampe: "10", etcs: "", etablissement: "PERPIGNAN BV", pkAdif: "", pkLfp: "", pkRac: "", pkRfn: "467.5" },
  { bloc: "BAL", vmax: "160", radio: "G", rampe: "10", etcs: "", etablissement: "Limite RAC LFP-RFF", pkAdif: "", pkLfp: "", pkRac: "0", pkRfn: "471", note: "transition RAC/SNCF" },
  // — Transition RAC / LFP — (PK propres au sens, cf. note d'en-tête)
  { bloc: "ETCS1", vmax: "300", radio: "G", rampe: "18", etcs: "", etablissement: "Limite LGV-Rac", pkAdif: "", pkLfp: "0.8", pkRac: "2.8", pkRfn: "", note: "transition RAC/LFP" },
  // — Page 1 · LFP —
  { bloc: "ETCS1", vmax: "300", radio: "G", rampe: "18", etcs: "", etablissement: "Saut de Mouton", pkAdif: "", pkLfp: "12.9", pkRac: "", pkRfn: "" },
  { bloc: "ETCS1", vmax: "300", radio: "G", rampe: "18", etcs: "", etablissement: "Tunnel du Perthus - tête nord", pkAdif: "", pkLfp: "17.1", pkRac: "", pkRfn: "" },
  { bloc: "ETCS1", vmax: "300", radio: "G", rampe: "18", etcs: "", etablissement: "Frontière France Espagne", pkAdif: "", pkLfp: "24.6", pkRac: "", pkRfn: "" },
  { bloc: "ETCS1", vmax: "300", radio: "G", rampe: "18", etcs: "", etablissement: "Tunnel du Perthus - tête sud", pkAdif: "", pkLfp: "25.6", pkRac: "", pkRfn: "" },
  // — Transition LFP / ADIF —
  { bloc: "BCA", vmax: "200", radio: "G", rampe: "18", etcs: "1", etablissement: "Limite ADIF-LFPSA", pkAdif: "752.4", pkLfp: "44.4", pkRac: "", pkRfn: "", note: "transition LFP/ADIF" },
  // — Page 1 · ADIF —
  { type: "note", texte: "80 AL PASO V3 V4 V6", position: "au-dessus", bloc: "", radio: "", rampe: "", etcs: "", vmax: "", etablissement: "", pkAdif: "", pkLfp: "", pkRac: "", pkRfn: "" },
  { bloc: "BCA", vmax: "200", radio: "G", rampe: "18", etcs: "1", etablissement: "FIGUERES-VILAFANT", pkAdif: "749.6", pkLfp: "", pkRac: "", pkRfn: "" },
  { bloc: "BCA", vmax: "200", radio: "G", rampe: "18", etcs: "1", etablissement: "PCA PONTOS", pkAdif: "738.2", pkLfp: "", pkRac: "", pkRfn: "" },
  { bloc: "BCA", vmax: "200", radio: "G", rampe: "18", etcs: "1", etablissement: "PCA VILADEMULS", pkAdif: "726.2", pkLfp: "", pkRac: "", pkRfn: "" },
  { bloc: "BCA", vmax: "165", radio: "G", rampe: "18", etcs: "1", etablissement: "", pkAdif: "716.8", pkLfp: "", pkRac: "", pkRfn: "" },
  { type: "note", texte: "155 TASF KM 716.838 al 715.514", position: "en-dessous", bloc: "", radio: "", rampe: "", etcs: "", vmax: "", etablissement: "", pkAdif: "", pkLfp: "", pkRac: "", pkRfn: "" },
  { bloc: "BCA", vmax: "120", radio: "G", rampe: "18", etcs: "1", csv: true, etablissement: "", pkAdif: "715.5", pkLfp: "", pkRac: "", pkRfn: "" },
  { bloc: "BCA", vmax: "120", radio: "G", rampe: "18", etcs: "1", etablissement: "GIRONA", pkAdif: "714.7", pkLfp: "", pkRac: "", pkRfn: "" },
  { bloc: "BCA", vmax: "125", radio: "G", rampe: "18", etcs: "1", etablissement: "", pkAdif: "713.2", pkLfp: "", pkRac: "", pkRfn: "" },
  { bloc: "BCA", vmax: "125", radio: "G", rampe: "18", etcs: "1", etablissement: "BIF. GIRONA-MERCADERIES", pkAdif: "710.7", pkLfp: "", pkRac: "", pkRfn: "" },
  { bloc: "BCA", vmax: "200", radio: "G", rampe: "18", etcs: "1", etablissement: "", pkAdif: "709.9", pkLfp: "", pkRac: "", pkRfn: "" },
  { bloc: "BCA", vmax: "200", radio: "G", rampe: "18", etcs: "1", etablissement: "VILOBI D'ONYAR", pkAdif: "703.5", pkLfp: "", pkRac: "", pkRfn: "" },
  { bloc: "BCA", vmax: "200", radio: "G", rampe: "18", etcs: "1", etablissement: "PCA RIUDARENES", pkAdif: "691.9", pkLfp: "", pkRac: "", pkRfn: "" },
  { bloc: "BCA", vmax: "200", radio: "G", rampe: "18", etcs: "1", etablissement: "BASE MTO.RIELLS", pkAdif: "682.0", pkLfp: "", pkRac: "", pkRfn: "" },
  // — Page 2 (9710) · ADIF —
  { bloc: "BCA", vmax: "200", radio: "G", rampe: "18", etcs: "1", etablissement: "RIELLS-A. V", pkAdif: "679.3", pkLfp: "", pkRac: "", pkRfn: "" },
  { bloc: "BCA", vmax: "200", radio: "G", rampe: "18", etcs: "1", etablissement: "PCA SANT CELONI", pkAdif: "670.5", pkLfp: "", pkRac: "", pkRfn: "" },
  { bloc: "BCA", vmax: "200", radio: "G", rampe: "18", etcs: "1", etablissement: "LLINARS-A V", pkAdif: "662.5", pkLfp: "", pkRac: "", pkRfn: "" },
  { bloc: "BCA", vmax: "200", radio: "G", rampe: "18", etcs: "1", etablissement: "PCA LA ROCA", pkAdif: "654.1", pkLfp: "", pkRac: "", pkRfn: "" },
  { bloc: "BCA", vmax: "200", radio: "G", rampe: "18", etcs: "1", etablissement: "BIF. MOLLET- AG KM.644.3", pkAdif: "644.3", pkLfp: "", pkRac: "", pkRfn: "" },
  { bloc: "BCA", vmax: "195", radio: "G", rampe: "18", etcs: "1", etablissement: "", pkAdif: "643.6", pkLfp: "", pkRac: "", pkRfn: "" },
  { bloc: "BCA", vmax: "185", radio: "G", rampe: "18", etcs: "1", etablissement: "", pkAdif: "641.9", pkLfp: "", pkRac: "", pkRfn: "" },
  { bloc: "BCA", vmax: "185", radio: "G", rampe: "18", etcs: "1", etablissement: "BIF. MOLLET- AG KM. 643.6", pkAdif: "641.3", pkLfp: "", pkRac: "", pkRfn: "" },
  // — Rampe 18→30 à Bif. MOLLET (640.9) : valeur "30" trouvée mi-page dans le
  // document (comme Radio/ETCS, imprimée une fois par zone, pas au point de
  // départ) ; frontière de zone reprise du sens sud-nord (même point physique,
  // 640.9/641.3), corrigée après signalement utilisateur.
  { bloc: "BCA", vmax: "185", radio: "G", rampe: "30", etcs: "1", etablissement: "BIF. MOLLET", pkAdif: "640.9", pkLfp: "", pkRac: "", pkRfn: "" },
  { bloc: "BCA", vmax: "200", radio: "G", rampe: "30", etcs: "1", etablissement: "", pkAdif: "639.8", pkLfp: "", pkRac: "", pkRfn: "" },
  { bloc: "BCA", vmax: "130", radio: "G", rampe: "30", etcs: "1", csv: true, etablissement: "", pkAdif: "632.4", pkLfp: "", pkRac: "", pkRfn: "" },
  { bloc: "BCA", vmax: "110", radio: "G", rampe: "30", etcs: "1", etablissement: "", pkAdif: "630.7", pkLfp: "", pkRac: "", pkRfn: "" },
  { bloc: "BCA", vmax: "45", radio: "G", rampe: "30", etcs: "1", csv: true, etablissement: "", pkAdif: "629.4", pkLfp: "", pkRac: "", pkRfn: "" },
  { type: "note", texte: "35 vias estacionam V11 V19 / V10 V18", position: "au-dessus", bloc: "", radio: "", rampe: "", etcs: "", vmax: "", etablissement: "", pkAdif: "", pkLfp: "", pkRac: "", pkRfn: "" },
  { bloc: "BCA", vmax: "45", radio: "G", rampe: "30", etcs: "1", etablissement: "LA SAGRERA AV", pkAdif: "627.7", pkLfp: "", pkRac: "", pkRfn: "" },
  { bloc: "BCA", vmax: "140", radio: "G", rampe: "30", etcs: "1", etablissement: "", pkAdif: "626.7", pkLfp: "", pkRac: "", pkRfn: "" },
  { bloc: "BCA", vmax: "80", radio: "G", rampe: "30", etcs: "1", csv: true, etablissement: "", pkAdif: "624.3", pkLfp: "", pkRac: "", pkRfn: "" },
  { bloc: "BCA", vmax: "140", radio: "G", rampe: "30", etcs: "1", etablissement: "", pkAdif: "623.8", pkLfp: "", pkRac: "", pkRfn: "" },
  { type: "note", texte: "80km/h circulation en MODE SR et en BSL — 623.758 al 621.692", position: "en-dessous", surligne: true, bloc: "", radio: "", rampe: "", etcs: "", vmax: "", etablissement: "", pkAdif: "", pkLfp: "", pkRac: "", pkRfn: "" },
  { bloc: "BCA", vmax: "30", radio: "G", rampe: "30", etcs: "1", csv: true, etablissement: "", pkAdif: "621.7", pkLfp: "", pkRac: "", pkRfn: "" },
  { bloc: "BCA", vmax: "30", radio: "G", rampe: "25", etcs: "1", etablissement: "BARCELONA SANTS", pkAdif: "621.0", pkLfp: "", pkRac: "", pkRfn: "" },
  // — Fiche 38510 · ADIF (comble le tronçon Barcelona Sants → Can Tunis) —
  // 620.2→60 puis 619.9→85 : confirmé par croisement avec l'ancien normalisé (nordSud,
  // vitesses réputées bonnes) — mes valeurs initiales étaient INVERSÉES (07/08).
  { bloc: "BCA", vmax: "60", radio: "G", rampe: "25", etcs: "1", etablissement: "", pkAdif: "620.2", pkLfp: "", pkRac: "", pkRfn: "" },
  { type: "note", texte: "60km/h circulation en MODE SR et en BSL — KM619.933 al 619.500", position: "en-dessous", surligne: true, bloc: "", radio: "", rampe: "", etcs: "", vmax: "", etablissement: "", pkAdif: "", pkLfp: "", pkRac: "", pkRfn: "" },
  { bloc: "BCA", vmax: "85", radio: "G", rampe: "25", etcs: "1", etablissement: "", pkAdif: "619.9", pkLfp: "", pkRac: "", pkRfn: "" },
  { bloc: "BCA", vmax: "95", radio: "G", rampe: "25", etcs: "1", etablissement: "", pkAdif: "618.1", pkLfp: "", pkRac: "", pkRfn: "" },
  // Zone 616.0→615.9 : CSV confirmé par l'utilisateur ; vitesse = 30 — le document
  // porte une ERREUR ici (il affiche 130), corrigée sur instruction utilisateur (07/08).
  { bloc: "BCA", vmax: "30", radio: "G", rampe: "25", etcs: "1", csv: true, etablissement: "BIF CAN TUNIS-AV", pkAdif: "616.0", pkLfp: "", pkRac: "", pkRfn: "" },
  { bloc: "BCA", vmax: "30", radio: "G", rampe: "25", etcs: "1", etablissement: "CAN TUNIS-AV", pkAdif: "615.9", pkLfp: "", pkRac: "", pkRfn: "" },
]);

// Chaînes kilométriques dans l'ORDRE DU SENS DE CIRCULATION. Sur un point de
// transition (2 PK), on affiche d'abord le PK du réseau QU'ON QUITTE, puis celui
// du réseau OÙ L'ON ENTRE (ex. sud→nord à Limite ADIF-LFPSA : 752.4 puis 44.4).
// L'ordre s'INVERSE en nord→sud (ADIF quitté en dernier, pas en premier) — d'où
// deux chaînes distinctes plutôt qu'une seule.
type KmField = "pkAdif" | "pkLfp" | "pkRac" | "pkRfn";
const KM_FIELDS_SUD_NORD: KmField[] = ["pkAdif", "pkLfp", "pkRac", "pkRfn"];
const KM_FIELDS_NORD_SUD: KmField[] = ["pkRfn", "pkRac", "pkLfp", "pkAdif"];

function kmValues(
  p: LignePoint,
  direction: "sudNord" | "nordSud" = "sudNord"
): Array<{ field: KmField; value: string }> {
  const order = direction === "nordSud" ? KM_FIELDS_NORD_SUD : KM_FIELDS_SUD_NORD;
  return order.filter((f) => p[f].trim() !== "").map((f) => ({ field: f, value: p[f] }));
}

// Réseau déduit des colonnes PK remplies (deux aux points de transition).
function deduceReseau(p: LignePoint): string {
  const nets: string[] = [];
  if (p.pkAdif) nets.push("ADIF");
  if (p.pkLfp) nets.push("LFP");
  if (p.pkRac) nets.push("RAC");
  if (p.pkRfn) nets.push("SNCF");
  return nets.join(" / ");
}

// Déduit le sens de circulation d'un train à partir de son origine/destination,
// en comparant leur ordre RÉEL dans les deux tableaux de ligne — plutôt que de
// stocker/importer `direction` comme un champ séparé, source d'erreur humaine
// (trains 38510/9711/9713/9715, 11/08) et perdu à chaque ré-import Excel.
// Retourne null si origine/destination sont vides, introuvables, ou ambigus
// (présents dans les deux sens avec un ordre cohérent — ne devrait pas arriver
// en pratique, la ligne n'a qu'un physique sens par tableau).
type DirectionLookupRow = { type?: "note"; etablissement?: string };

export function deriveTrainDirection(
  sudNord: DirectionLookupRow[],
  nordSud: DirectionLookupRow[],
  origine: string,
  destination: string
): "sudNord" | "nordSud" | null {
  if (!origine || !destination) return null;
  const indexOf = (points: DirectionLookupRow[], etab: string) =>
    points.findIndex((p) => p.type !== "note" && p.etablissement === etab);

  const checkTable = (points: DirectionLookupRow[]): boolean => {
    const startIdx = indexOf(points, origine);
    const endIdx = indexOf(points, destination);
    return startIdx !== -1 && endIdx !== -1 && startIdx < endIdx;
  };

  const sudNordOk = checkTable(sudNord);
  const nordSudOk = checkTable(nordSud);
  if (sudNordOk && !nordSudOk) return "sudNord";
  if (nordSudOk && !sudNordOk) return "nordSud";
  return null;
}

// Résumé PK lisible (réseau + valeur) pour les libellés du sélecteur origine/destination.
function pkSummary(p: LignePoint): string {
  const parts: string[] = [];
  if (p.pkAdif) parts.push(`ADIF ${p.pkAdif}`);
  if (p.pkLfp) parts.push(`LFP ${p.pkLfp}`);
  if (p.pkRac) parts.push(`RAC ${p.pkRac}`);
  if (p.pkRfn) parts.push(`SNCF ${p.pkRfn}`);
  return parts.join(" / ");
}

// Horaires (07/08) : donnée TRAIN (pas ligne), un jeu par point de la fiche de CE
// train. Remplace l'ancien modèle (hora unique + com/tecn/conc calculés) : le
// nouveau document donne les heures en clair sur 3 colonnes, plus de calcul.
// Nature de l'arrêt (commercial/technique) et concordance : disparues, le nouveau
// document ne les distingue plus (confirmé par l'utilisateur).
export type TrainHoraire = { arrivee: string; passage: string; depart: string };
const EMPTY_HORAIRE: TrainHoraire = { arrivee: "", passage: "", depart: "" };

export type TrainDraft = {
  numeroEspagne: string;
  numeroFrance: string;
  origine: string;
  destination: string;
  categorieSNCF: string;
  categorieLFP: string;
  categorieADIF: string;
  materiel: string;
  // Sens de circulation de CE train : détermine quel tableau de données ligne
  // (sudNord / nordSud) alimente sa fiche train. Les deux tableaux partagent les
  // mêmes points physiques (mêmes PK) mais Bloc/Vmax/Rampe/CSV y sont RELUS
  // indépendamment par sens (dépendent réellement du sens de circulation — rampe
  // devient pente dans l'autre sens, confirmé aussi pour Vmax/CSV, 07/08).
  direction: "sudNord" | "nordSud";
  // Clé = lignePointIdentityKey du point concerné (données ligne versionnées, donc
  // pas d'index stable : on identifie le point par ses PK, comme pour la fusion des
  // défauts).
  horaires: Record<string, TrainHoraire>;
  // Cette « variante » de train référence la VERSION DES DONNÉES LIGNE avec laquelle
  // elle a été publiée (ligneVersions[ligneVersionId]), + sa propre date de vigueur.
  // Permet de publier une nouvelle version le 15/11 avec entrée en vigueur au 1/12
  // sans qu'elle remplace immédiatement la version en cours.
  ligneVersionId: string;
  validityStartDate: string; // ISO (AAAA-MM-JJ)
  validityEndDate: string; // ISO, optionnelle
};

// FICHIER NORMALISÉ LOCAL (provisoire) : « Valider » écrit le document normalisé ici,
// et l'éditeur le CONSULTE au chargement. Ce n'est PAS une mémoire de l'éditeur :
// c'est le document normalisé lui-même, en attendant la vraie publication.
const NORMALIZED_LOCAL_KEY = "normalise2026:current";

// REFUS MÉMORISÉS de l'importateur : ids stables des divergences déjà refusées lors
// d'imports précédents (erreurs connues du document : PK Figueres, vitesse 130, etc.)
// — pré-refusées et repliées aux imports suivants au lieu d'être re-proposées.
const REFUS_MEMORISES_KEY = "normalise2026:refusMemorises";

function readRefusMemorises(): Set<string> {
  try {
    const raw = localStorage.getItem(REFUS_MEMORISES_KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

function writeRefusMemorises(ids: Set<string>): void {
  localStorage.setItem(REFUS_MEMORISES_KEY, JSON.stringify([...ids].sort()));
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

// n° français déduit du n° espagnol par parité (trains transfrontaliers) :
// espagnol pair → +1, impair → −1 (ex. 9705 → 9704).
function deriveNumeroFrance(numeroEspagne: string): string {
  const digits = numeroEspagne.replace(/\D/g, "");
  if (digits === "") return "";
  const n = Number(digits);
  if (!Number.isFinite(n)) return "";
  return String(n % 2 === 0 ? n + 1 : n - 1);
}

function isValidNumero(value: string): boolean {
  return /^\d{1,6}$/.test(value.trim());
}

// Nouveau train prérempli (matériel + catégories = valeurs courantes, quasi constantes).
// La variante référence la version de ligne courante et hérite de sa date de vigueur.
function makeTrain(
  numeroEspagne: string,
  ligneVersionId: string = DEFAULT_LIGNE_VERSION_ID,
  validityStartDate: string = "",
  direction: "sudNord" | "nordSud" = "sudNord"
): TrainDraft {
  return {
    numeroEspagne,
    numeroFrance: deriveNumeroFrance(numeroEspagne),
    origine: "",
    destination: "",
    categorieSNCF: "E32C",
    categorieLFP: "Type 300",
    categorieADIF: "Tipo 200",
    materiel: "TGV 2N2 3UH",
    direction,
    horaires: {},
    ligneVersionId,
    validityStartDate,
    validityEndDate: "",
  };
}

// CATALOGUE DES MATÉRIELS : créer un matériel = lui associer une longueur (m) et une
// masse (t) UNITAIRES (une rame, composition US). LIM en déduira l'affichage (× 2 si UM).
export type MaterielSpec = { longueur: number; masse: number };

const DEFAULT_MATERIELS: Record<string, MaterielSpec> = {
  "TGV 2N2 3UH": { longueur: 200, masse: 433 },
};

// MENTIONS (données LIGNE) : textes affichés par LIM au-dessus de la fiche train.
export type Mention = { titre: string; contenu: string };

const DEFAULT_MENTIONS: Mention[] = [
  { titre: "", contenu: "Vitesses limites en rouge pour circulation en MODE SR, BSL" },
];

// ---------------------------------------------------------------------------
// VERSIONS DES DONNÉES LIGNE (07/08) : les données ligne (sudNord + mentions) sont
// désormais VERSIONNÉES. Chaque variante de train référence la version avec laquelle
// elle a été publiée (`ligneVersionId`). Motif : une « Version 02 » du document peut
// être importée le 15/11 avec une date de vigueur au 1/12 — elle ne doit PAS remplacer
// la version en cours avant cette date. Une seule version existe pour l'instant (v1) ;
// la création d'une nouvelle version (import d'un document ultérieur) est le prochain
// incrément naturel, pas encore construit.
export type LigneVersion = {
  numeroVersion: string;
  dateVigueur: string; // ISO (AAAA-MM-JJ) — date de vigueur DU DOCUMENT source
  sudNord: LignePoint[];
  nordSud: LignePoint[];
  mentions: Mention[];
};

export const DEFAULT_LIGNE_VERSION_ID = "v1";
// « Version 01 du 04/08/2026 » — telle qu'imprimée sur la fiche 9705 source.
const DEFAULT_DATE_VIGUEUR = "2026-08-04";

export function cloneDefaultLigneVersion(): LigneVersion {
  return {
    numeroVersion: "01",
    dateVigueur: DEFAULT_DATE_VIGUEUR,
    sudNord: DEFAULT_LIGNE_SUD_NORD.map((p) => ({ ...p })),
    nordSud: DEFAULT_LIGNE_NORD_SUD.map((p) => ({ ...p })),
    mentions: DEFAULT_MENTIONS.map((m) => ({ ...m })),
  };
}

// Relit le fichier normalisé local → trains. Tolérant : champs manquants complétés,
// document illisible → aucun train.
// ⚠️ COMPAT ANCIEN FORMAT : avant le versionnement, un train était { meta: {...} } à
// plat. On le lit comme une variante implicite pour ne pas perdre les données déjà
// validées dans le navigateur (ex. le 9705 construit tout au long de ce chantier).
// `rawOverride` : permet de réutiliser le même parsing sur un JSON venu
// d'ailleurs que le localStorage (ex. le fichier 2026 publié en ligne, utilisé
// comme filet de secours au chargement — cf. useEffect de récupération 09/08).
export function readNormalizedLocal(rawOverride?: string): Record<string, TrainDraft> {
  try {
    const raw = rawOverride ?? localStorage.getItem(NORMALIZED_LOCAL_KEY);
    if (!raw) return {};
    const doc = JSON.parse(raw) as {
      trains?: Record<
        string,
        {
          variants?: Array<{
            meta?: Record<string, unknown>;
            ligneVersionId?: unknown;
            validityStartDate?: unknown;
            validityEndDate?: unknown;
          }>;
          meta?: Record<string, unknown>; // ancien format (compat)
        }
      >;
    };
    if (!doc || typeof doc !== "object" || !doc.trains || typeof doc.trains !== "object") return {};
    const out: Record<string, TrainDraft> = {};
    for (const [num, t] of Object.entries(doc.trains)) {
      const variant =
        Array.isArray(t?.variants) && t.variants.length > 0
          ? t.variants[0]
          : t?.meta
            ? { meta: t.meta }
            : undefined;
      const meta = variant?.meta ?? {};
      const base = makeTrain(str(meta.numeroEspagne) || num, DEFAULT_LIGNE_VERSION_ID, "");
      const rawHoraires = meta.horaires;
      const horaires: Record<string, TrainHoraire> = {};
      if (rawHoraires && typeof rawHoraires === "object") {
        for (const [key, h] of Object.entries(rawHoraires as Record<string, unknown>)) {
          if (!h || typeof h !== "object") continue;
          const hh = h as Record<string, unknown>;
          horaires[key] = {
            arrivee: str(hh.arrivee),
            passage: str(hh.passage),
            depart: str(hh.depart),
          };
        }
      }
      out[num] = {
        ...base,
        numeroFrance: str(meta.numeroFrance) || base.numeroFrance,
        origine: str(meta.origine),
        destination: str(meta.destination),
        categorieSNCF: str(meta.categorieSNCF) || base.categorieSNCF,
        categorieLFP: str(meta.categorieLFP) || base.categorieLFP,
        categorieADIF: str(meta.categorieADIF) || base.categorieADIF,
        materiel: str(meta.materiel) || base.materiel,
        direction: str(meta.direction) === "nordSud" ? "nordSud" : "sudNord",
        horaires,
        ligneVersionId: str(variant?.ligneVersionId) || DEFAULT_LIGNE_VERSION_ID,
        validityStartDate: str(variant?.validityStartDate),
        validityEndDate: str(variant?.validityEndDate),
      };
    }
    return out;
  } catch {
    return {};
  }
}

// Parse une ligne du normalisé (note ou point de données), complétée par les
// défauts (utile seulement pour la version par défaut — les autres n'en ont pas).
// Clé d'identité d'un point de ligne = ses PK (uniques par point, y compris les
// points SANS nom d'établissement — contrairement au nom, qui vaut "" pour ~17
// points et ferait s'écraser leurs valeurs par défaut entre elles dans une Map).
function lignePointIdentityKey(p: { pkAdif: string; pkLfp: string; pkRac: string; pkRfn: string }): string {
  return `${p.pkAdif}|${p.pkLfp}|${p.pkRac}|${p.pkRfn}`;
}

function parseLignePointRow(r: Record<string, unknown>, defaults: Map<string, LignePoint>): LignePoint {
  if (str(r.type) === "note") {
    return {
      type: "note",
      texte: str(r.texte),
      position: str(r.position) === "au-dessus" ? "au-dessus" : "en-dessous",
      surligne: r.surligne === true,
      bloc: "",
      vmax: "",
      radio: "",
      rampe: "",
      etcs: "",
      etablissement: "",
      pkAdif: "",
      pkLfp: "",
      pkRac: "",
      pkRfn: "",
    };
  }
  const etablissement = str(r.etablissement);
  const d = defaults.get(
    lignePointIdentityKey({ pkAdif: str(r.pkAdif), pkLfp: str(r.pkLfp), pkRac: str(r.pkRac), pkRfn: str(r.pkRfn) })
  );
  return {
    bloc: str(r.bloc) || d?.bloc || "",
    vmax: str(r.vmax) || d?.vmax || "",
    csv: r.csv === true || (r.csv === undefined && d?.csv === true),
    radio: str(r.radio) || d?.radio || "",
    rampe: str(r.rampe) || d?.rampe || "",
    etcs: str(r.etcs) || d?.etcs || "",
    etablissement,
    pkAdif: str(r.pkAdif) || d?.pkAdif || "",
    pkLfp: str(r.pkLfp) || d?.pkLfp || "",
    pkRac: str(r.pkRac) || d?.pkRac || "",
    pkRfn: str(r.pkRfn) || d?.pkRfn || "",
    pkInterne: str(r.pkInterne) || d?.pkInterne || "",
    note: d?.note,
  };
}

// Relit TOUTES les versions des données ligne du normalisé local (ou la version par
// défaut si absentes/illisibles).
// ⚠️ COMPAT ANCIEN FORMAT : avant le versionnement, la ligne était un objet unique
// `doc.ligne = { sudNord, mentions }` (pas de dictionnaire de versions). On la migre
// en version par défaut pour ne pas perdre les données déjà validées.
export function readLigneVersionsLocal(rawOverride?: string): Record<string, LigneVersion> {
  try {
    const raw = rawOverride ?? localStorage.getItem(NORMALIZED_LOCAL_KEY);
    if (!raw) return { [DEFAULT_LIGNE_VERSION_ID]: cloneDefaultLigneVersion() };
    const doc = JSON.parse(raw) as {
      ligneVersions?: Record<
        string,
        { numeroVersion?: unknown; dateVigueur?: unknown; sudNord?: unknown[]; nordSud?: unknown[]; mentions?: unknown[] }
      >;
      ligne?: { sudNord?: unknown[]; mentions?: unknown[] }; // ancien format (compat)
    };
    let versions = doc?.ligneVersions;
    if ((!versions || typeof versions !== "object" || Object.keys(versions).length === 0) && doc?.ligne) {
      versions = { [DEFAULT_LIGNE_VERSION_ID]: { sudNord: doc.ligne.sudNord, mentions: doc.ligne.mentions } };
    }
    if (!versions || typeof versions !== "object" || Object.keys(versions).length === 0) {
      return { [DEFAULT_LIGNE_VERSION_ID]: cloneDefaultLigneVersion() };
    }

    const out: Record<string, LigneVersion> = {};
    for (const [id, v] of Object.entries(versions)) {
      const isDefaultVersion = id === DEFAULT_LIGNE_VERSION_ID;
      const sudNordRaw = Array.isArray(v?.sudNord) ? v.sudNord : [];
      // Socle par défaut enrichi depuis la dernière validation (points/colonnes
      // ajoutés dans le code) : si le stocké a moins de points, on repart du défaut.
      const sudNord =
        isDefaultVersion && sudNordRaw.length < DEFAULT_LIGNE_SUD_NORD.length
          ? DEFAULT_LIGNE_SUD_NORD.map((p) => ({ ...p }))
          : sudNordRaw.map((r) =>
              parseLignePointRow(
                r as Record<string, unknown>,
                isDefaultVersion
                  ? new Map(DEFAULT_LIGNE_SUD_NORD.map((p) => [lignePointIdentityKey(p), p]))
                  : new Map()
              )
            );
      const nordSudRaw = Array.isArray(v?.nordSud) ? v.nordSud : [];
      // ⚠️ COMPAT : les documents d'avant le 07/08 (introduction du sens nord-sud)
      // n'ont pas de champ `nordSud` du tout → on repart du défaut, même logique que
      // pour un socle sudNord incomplet.
      const nordSud =
        isDefaultVersion && nordSudRaw.length < DEFAULT_LIGNE_NORD_SUD.length
          ? DEFAULT_LIGNE_NORD_SUD.map((p) => ({ ...p }))
          : nordSudRaw.map((r) =>
              parseLignePointRow(
                r as Record<string, unknown>,
                isDefaultVersion
                  ? new Map(DEFAULT_LIGNE_NORD_SUD.map((p) => [lignePointIdentityKey(p), p]))
                  : new Map()
              )
            );
      const mentionsRaw = Array.isArray(v?.mentions) ? v.mentions : null;
      const mentions = mentionsRaw
        ? mentionsRaw.map((m) => {
            const mm = m as { titre?: unknown; contenu?: unknown };
            return { titre: str(mm?.titre), contenu: str(mm?.contenu) };
          })
        : isDefaultVersion
          ? DEFAULT_MENTIONS.map((m) => ({ ...m }))
          : [];
      out[id] = {
        numeroVersion: str(v?.numeroVersion) || (isDefaultVersion ? "01" : ""),
        dateVigueur: str(v?.dateVigueur) || (isDefaultVersion ? DEFAULT_DATE_VIGUEUR : ""),
        sudNord,
        nordSud,
        mentions,
      };
    }
    return Object.keys(out).length > 0 ? out : { [DEFAULT_LIGNE_VERSION_ID]: cloneDefaultLigneVersion() };
  } catch {
    return { [DEFAULT_LIGNE_VERSION_ID]: cloneDefaultLigneVersion() };
  }
}

// Relit le catalogue des matériels du fichier normalisé local (ou le défaut).
function readMaterielsLocal(rawOverride?: string): Record<string, MaterielSpec> {
  try {
    const raw = rawOverride ?? localStorage.getItem(NORMALIZED_LOCAL_KEY);
    if (!raw) return { ...DEFAULT_MATERIELS };
    const doc = JSON.parse(raw) as { materiels?: Record<string, { longueur?: unknown; masse?: unknown }> };
    if (!doc || typeof doc !== "object" || !doc.materiels || typeof doc.materiels !== "object") {
      return { ...DEFAULT_MATERIELS };
    }
    const out: Record<string, MaterielSpec> = {};
    for (const [name, spec] of Object.entries(doc.materiels)) {
      const longueur = Number(spec?.longueur);
      const masse = Number(spec?.masse);
      if (name.trim() && Number.isFinite(longueur) && Number.isFinite(masse)) {
        out[name] = { longueur, masse };
      }
    }
    return Object.keys(out).length > 0 ? out : { ...DEFAULT_MATERIELS };
  } catch {
    return { ...DEFAULT_MATERIELS };
  }
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const CARD: React.CSSProperties = {
  padding: 20,
  border: "1px solid #d1d5db",
  borderRadius: 16,
  background: "#ffffff",
  color: "#111827",
  marginBottom: 16,
};

const CARD_TITLE: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  marginBottom: 12,
};

const LABEL: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "#6b7280",
  textTransform: "uppercase",
  letterSpacing: "0.03em",
  marginBottom: 4,
};

const INPUT: React.CSSProperties = {
  padding: "7px 10px",
  borderRadius: 8,
  border: "1px solid #d1d5db",
  fontSize: 14,
  width: "100%",
  boxSizing: "border-box",
  background: "#ffffff",
};

function primaryBtn(disabled: boolean): React.CSSProperties {
  return {
    padding: "9px 16px",
    borderRadius: 10,
    border: "1px solid #2563eb",
    background: disabled ? "#93b4f5" : "#2563eb",
    color: "#ffffff",
    fontWeight: 700,
    fontSize: 14,
    cursor: disabled ? "default" : "pointer",
  };
}

function secondaryBtn(disabled: boolean): React.CSSProperties {
  return {
    padding: "9px 16px",
    borderRadius: 10,
    border: "1px solid #16a34a",
    background: disabled ? "#a7d7b8" : "#16a34a",
    color: "#ffffff",
    fontWeight: 700,
    fontSize: 14,
    cursor: disabled ? "default" : "pointer",
  };
}

// Bouton Valider (futur Publier) : couleur volontairement DIFFÉRENTE du vert
// (import) et du bleu (actions courantes) — un violet soutenu, pour qu'on ne le
// confonde jamais avec « valider la sélection du train » (demande utilisateur,
// 09/08) : c'est une action spéciale, qui publiera un jour les données.
function validerBtn(disabled: boolean): React.CSSProperties {
  return {
    padding: "9px 20px",
    borderRadius: 10,
    border: "1px solid #6d28d9",
    background: disabled ? "#c4b5fd" : "#6d28d9",
    color: "#ffffff",
    fontWeight: 700,
    fontSize: 14,
    cursor: disabled ? "default" : "pointer",
  };
}

// Bouton de sélection sens (non actif) — même gabarit que primaryBtn mais outline,
// pour un toggle à 2 états (cadre Données ligne, 09/08).
const secondaryOutlineBtn: React.CSSProperties = {
  padding: "9px 16px",
  borderRadius: 10,
  border: "1px solid #d1d5db",
  background: "#ffffff",
  color: "#374151",
  fontWeight: 700,
  fontSize: 14,
  cursor: "pointer",
};

const TH: React.CSSProperties = {
  textAlign: "left",
  padding: "4px 8px",
  borderBottom: "2px solid #d1d5db",
  whiteSpace: "nowrap",
};
const TD: React.CSSProperties = {
  padding: "4px 8px",
  borderBottom: "1px solid #eee",
  fontVariantNumeric: "tabular-nums",
};

// ---------------------------------------------------------------------------
// Combobox générique : valeurs possibles (du normalisé) + « ➕ Saisir une autre… »
// ---------------------------------------------------------------------------
const ADD_CUSTOM_SENTINEL = "__add_custom__";

function EditableSelect({
  label,
  value,
  options,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  placeholder: string;
  onChange: (value: string) => void;
}) {
  const [customMode, setCustomMode] = useState(false);
  const [customText, setCustomText] = useState("");

  const commitCustom = () => {
    const t = customText.trim();
    if (t) onChange(t);
    setCustomMode(false);
    setCustomText("");
  };

  if (customMode) {
    return (
      <div>
        <div style={LABEL}>{label}</div>
        <div style={{ display: "flex", gap: 6 }}>
          <input
            autoFocus
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitCustom();
              if (e.key === "Escape") {
                setCustomMode(false);
                setCustomText("");
              }
            }}
            placeholder={placeholder}
            style={INPUT}
          />
          <button
            type="button"
            onClick={commitCustom}
            style={{
              padding: "7px 12px",
              borderRadius: 8,
              border: "1px solid #2563eb",
              background: "#2563eb",
              color: "#fff",
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            OK
          </button>
        </div>
      </div>
    );
  }

  const shown = value && !options.includes(value) ? [value, ...options] : options;

  return (
    <div>
      <div style={LABEL}>{label}</div>
      <select
        value={value}
        onChange={(e) => {
          if (e.target.value === ADD_CUSTOM_SENTINEL) {
            setCustomText("");
            setCustomMode(true);
          } else {
            onChange(e.target.value);
          }
        }}
        style={INPUT}
      >
        <option value="">— choisir —</option>
        {shown.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
        <option value={ADD_CUSTOM_SENTINEL}>➕ Saisir une autre valeur…</option>
      </select>
    </div>
  );
}

// Cellule de la fiche train : TEXTE simple en lecture ; un CLIC la rend éditable
// (Entrée ou clic ailleurs valide, Échap annule), puis elle redevient du texte.
function ClickToEditCell({
  value,
  bold = false,
  red = false,
  blue = false,
  alignRight = false,
  placeholder,
  onCommit,
}: {
  value: string;
  bold?: boolean;
  red?: boolean; // notes : texte rouge
  blue?: boolean; // donnée LIGNE : modifier change TOUS les trains
  alignRight?: boolean; // colonne KM
  placeholder?: string;
  onCommit: (value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const color = red ? "#b91c1c" : blue ? "#1d4ed8" : undefined;

  if (!editing) {
    return (
      <div
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
        title="Cliquer pour éditer"
        style={{
          cursor: "text",
          minHeight: 20,
          fontWeight: bold ? 600 : 400,
          whiteSpace: "nowrap",
          color: value ? color : "#9ca3af",
          fontStyle: value ? undefined : "italic",
          textAlign: alignRight ? "right" : undefined,
        }}
      >
        {value || placeholder || " "}
      </div>
    );
  }

  const commit = () => {
    setEditing(false);
    onCommit(draft);
  };

  return (
    <input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") setEditing(false);
      }}
      style={{
        padding: "2px 4px",
        borderRadius: 6,
        border: "1px solid #2563eb",
        fontSize: 13,
        fontWeight: bold ? 600 : 400,
        color,
        textAlign: alignRight ? "right" : undefined,
        width: "100%",
        boxSizing: "border-box",
        background: "#ffffff",
      }}
    />
  );
}

// Champ MATÉRIEL : sélection dans le CATALOGUE ; « ➕ » demande nom + longueur + masse.
function MaterielField({
  value,
  materiels,
  onChange,
  onAddMateriel,
}: {
  value: string;
  materiels: Record<string, MaterielSpec>;
  onChange: (value: string) => void;
  onAddMateriel: (name: string, spec: MaterielSpec) => void;
}) {
  const [customMode, setCustomMode] = useState(false);
  const [nom, setNom] = useState("");
  const [longueur, setLongueur] = useState("");
  const [masse, setMasse] = useState("");
  const [error, setError] = useState<string | null>(null);

  const cancel = () => {
    setCustomMode(false);
    setNom("");
    setLongueur("");
    setMasse("");
    setError(null);
  };

  const commit = () => {
    const n = nom.trim();
    const lg = Number(longueur.replace(",", "."));
    const ms = Number(masse.replace(",", "."));
    if (!n) {
      setError("Nom requis.");
      return;
    }
    if (!Number.isFinite(lg) || lg <= 0) {
      setError("Longueur invalide (m).");
      return;
    }
    if (!Number.isFinite(ms) || ms <= 0) {
      setError("Masse invalide (t).");
      return;
    }
    onAddMateriel(n, { longueur: lg, masse: ms });
    onChange(n);
    cancel();
  };

  if (customMode) {
    return (
      <div>
        <div style={LABEL}>Matériel — nouveau (longueur/masse d'une rame US)</div>
        <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
          <input
            autoFocus
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") cancel();
            }}
            placeholder="Nom (ex. TGV 2N2 3UH)"
            style={{ ...INPUT, flex: 2 }}
          />
          <input
            value={longueur}
            onChange={(e) => setLongueur(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") cancel();
            }}
            placeholder="Longueur (m)"
            style={{ ...INPUT, flex: 1 }}
          />
          <input
            value={masse}
            onChange={(e) => setMasse(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") cancel();
            }}
            placeholder="Masse (t)"
            style={{ ...INPUT, flex: 1 }}
          />
          <button
            type="button"
            onClick={commit}
            style={{
              padding: "7px 12px",
              borderRadius: 8,
              border: "1px solid #2563eb",
              background: "#2563eb",
              color: "#fff",
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            OK
          </button>
        </div>
        {error ? (
          <div style={{ color: "#b91c1c", fontSize: 12, marginTop: 4 }}>{error}</div>
        ) : null}
      </div>
    );
  }

  const names = Object.keys(materiels).sort();
  const shown = value && !names.includes(value) ? [value, ...names] : names;

  return (
    <div>
      <div style={LABEL}>Matériel</div>
      <select
        value={value}
        onChange={(e) => {
          if (e.target.value === ADD_CUSTOM_SENTINEL) {
            setCustomMode(true);
          } else {
            onChange(e.target.value);
          }
        }}
        style={INPUT}
      >
        <option value="">— choisir —</option>
        {shown.map((name) => {
          const spec = materiels[name];
          return (
            <option key={name} value={name}>
              {spec ? `${name} (${spec.longueur} m — ${spec.masse} t)` : name}
            </option>
          );
        })}
        <option value={ADD_CUSTOM_SENTINEL}>➕ Saisir une autre valeur…</option>
      </select>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Composant principal
// ---------------------------------------------------------------------------
export default function Normalise2026Tab() {
  // Au chargement, l'éditeur CONSULTE le fichier normalisé local (s'il existe).
  const [trains, setTrains] = useState<Record<string, TrainDraft>>(() => readNormalizedLocal());
  const [materiels, setMateriels] = useState<Record<string, MaterielSpec>>(() => readMaterielsLocal());
  const [ligneVersions, setLigneVersions] = useState<Record<string, LigneVersion>>(() => readLigneVersionsLocal());
  // Une seule version existe pour l'instant (v1) ; sélecteur de version = prochain
  // incrément (quand une V2 sera importée/créée).
  const [currentVersionId] = useState<string>(DEFAULT_LIGNE_VERSION_ID);
  const [currentNumero, setCurrentNumero] = useState<string | null>(null);
  // Sens affiché dans le cadre « Données ligne » (consultation) — INDÉPENDANT du
  // sens du train sélectionné (demande utilisateur, 09/08) : ce cadre n'affichait
  // jusqu'ici que le sens sud→nord, sans moyen de voir l'autre sens.
  const [ligneViewDirection, setLigneViewDirection] = useState<"sudNord" | "nordSud">("sudNord");
  const [creating, setCreating] = useState(false);
  const [numeroInput, setNumeroInput] = useState("");
  const [numeroError, setNumeroError] = useState<string | null>(null);
  const [directionInput, setDirectionInput] = useState<"sudNord" | "nordSud">("sudNord");
  const [generatedJson, setGeneratedJson] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  // ---- Publication (09/08) : état de la modale + du résultat ----------------
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishSuccessMessage, setPublishSuccessMessage] = useState<string | null>(null);

  // ---- Filet de secours (09/08) : si le localStorage est VIDE au chargement
  // (perte locale, nouveau navigateur…), on va chercher le dernier normalisé
  // 2026 PUBLIÉ en ligne plutôt que de repartir de zéro. Si le localStorage a
  // déjà des trains, on NE TOUCHE À RIEN (c'est le brouillon en cours, qui a
  // priorité — cf. discussion utilisateur : le local reste le brouillon,
  // l'en-ligne n'est qu'un filet de secours/référence publiée).
  useEffect(() => {
    if (Object.keys(trains).length > 0) return;
    let cancelled = false;
    void (async () => {
      const { data, errorMessage } = await fetchLigneFt2026Current();
      if (cancelled || errorMessage || !data) return;
      const raw = JSON.stringify(data);
      const recoveredTrains = readNormalizedLocal(raw);
      if (Object.keys(recoveredTrains).length === 0) return;
      setTrains(recoveredTrains);
      setLigneVersions(readLigneVersionsLocal(raw));
      setMateriels(readMaterielsLocal(raw));
      // Grave la récupération en local pour éviter de refaire l'aller-retour
      // réseau à chaque rechargement tant qu'aucune nouvelle modif n'est faite.
      try {
        localStorage.setItem(NORMALIZED_LOCAL_KEY, raw);
      } catch {
        // stockage indisponible → tant pis, l'affichage reste correct pour cette session.
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const train = currentNumero ? trains[currentNumero] ?? null : null;
  const trainNumbers = Object.keys(trains).sort();

  // Données ligne de la version COURANTE (une seule pour l'instant). `lignePoints`/
  // `mentions` restent des valeurs dérivées (pas des useState) : elles vivent DANS
  // `ligneVersions[currentVersionId]`, versionnées.
  // Sens courant = celui DU TRAIN sélectionné (chaque train a le sien) ; sudNord par
  // défaut tant qu'aucun train n'est sélectionné.
  const currentDirection: "sudNord" | "nordSud" = train?.direction ?? "sudNord";
  const currentLigneVersion = ligneVersions[currentVersionId] ?? cloneDefaultLigneVersion();
  const lignePoints = currentLigneVersion[currentDirection];
  const mentions = currentLigneVersion.mentions;

  const setLignePoints = (updater: (prev: LignePoint[]) => LignePoint[]) => {
    setLigneVersions((prev) => {
      const version = prev[currentVersionId] ?? cloneDefaultLigneVersion();
      return { ...prev, [currentVersionId]: { ...version, [currentDirection]: updater(version[currentDirection]) } };
    });
  };
  const setMentions = (updater: (prev: Mention[]) => Mention[]) => {
    setLigneVersions((prev) => {
      const version = prev[currentVersionId] ?? cloneDefaultLigneVersion();
      return { ...prev, [currentVersionId]: { ...version, mentions: updater(version.mentions) } };
    });
  };

  // Valeurs possibles d'un champ = valeurs distinctes déjà présentes dans les trains
  // du normalisé (source unique ; pas de mémoire propre à l'éditeur).
  const possibleValues = (field: Exclude<keyof TrainDraft, "horaires">): string[] => {
    const set = new Set<string>();
    for (const num of trainNumbers) {
      const v = (trains[num][field] ?? "").trim();
      if (v) set.add(v);
    }
    return Array.from(set).sort();
  };

  const startCreate = () => {
    setCreating(true);
    setNumeroInput("");
    setNumeroError(null);
    setDirectionInput("sudNord");
  };

  const confirmCreate = () => {
    const trimmed = numeroInput.trim();
    if (!isValidNumero(trimmed)) {
      setNumeroError("Numéro invalide (1 à 6 chiffres).");
      return;
    }
    if (!trains[trimmed]) {
      setTrains((prev) => ({
        ...prev,
        [trimmed]: makeTrain(trimmed, currentVersionId, currentLigneVersion.dateVigueur, directionInput),
      }));
    }
    setCurrentNumero(trimmed);
    setCreating(false);
    setGeneratedJson(null);
  };

  const selectTrain = (num: string) => {
    if (num === ADD_CUSTOM_SENTINEL) {
      startCreate();
      return;
    }
    setCurrentNumero(num === "" ? null : num);
    setCreating(false);
    setGeneratedJson(null);
  };

  // Suppression d'un train (demande de longue date, reprise 12/08 — cas concret :
  // train 38579 présent dans le normalisé mais absent du livret FT réel, donc
  // sélectionnable dans LIM sans avoir de fiche). Confirmation native : action
  // destructrice, pas de corbeille — mais reste locale tant que non republiée.
  const deleteCurrentTrain = () => {
    if (!currentNumero) return;
    const confirmed = window.confirm(
      `Supprimer définitivement le train ${currentNumero} du normalisé ?\n\n` +
        `Cette suppression ne prendra effet en ligne qu'après publication.`
    );
    if (!confirmed) return;
    const toDelete = currentNumero;
    setTrains((prev) => {
      const next = { ...prev };
      delete next[toDelete];
      return next;
    });
    setCurrentNumero(null);
    setGeneratedJson(null);
  };

  const updateField = (field: keyof TrainDraft, value: string) => {
    if (!currentNumero) return;
    setTrains((prev) => {
      const cur = prev[currentNumero];
      if (!cur) return prev;
      const next = { ...cur, [field]: value };
      // Sens de circulation DÉDUIT d'origine/destination, jamais saisi à part
      // (demande utilisateur, 11/08 : un champ séparé était source d'erreur —
      // trains 38510/9711/9713/9715 — et se réécrasait à chaque ré-import).
      // Recalculé à chaque changement d'origine/destination ; si indéterminable
      // (l'un des deux vide, ou établissement introuvable), la valeur en cours
      // est conservée telle quelle plutôt que d'être effacée.
      if (field === "origine" || field === "destination") {
        const derived = deriveTrainDirection(
          currentLigneVersion.sudNord,
          currentLigneVersion.nordSud,
          field === "origine" ? value : cur.origine,
          field === "destination" ? value : cur.destination
        );
        if (derived) next.direction = derived;
      }
      return { ...prev, [currentNumero]: next };
    });
    setGeneratedJson(null);
  };

  const addMateriel = (name: string, spec: MaterielSpec) => {
    setMateriels((prev) => ({ ...prev, [name]: spec }));
    setGeneratedJson(null);
  };

  // Renommage d'un établissement (donnée LIGNE : vaut pour TOUS les trains).
  // Propage le nouveau nom aux origines/destinations des trains qui le référencent.
  const renameEtablissement = (index: number, nextName: string) => {
    const oldName = lignePoints[index]?.etablissement ?? "";
    setLignePoints((prev) =>
      prev.map((p, i) => (i === index ? { ...p, etablissement: nextName } : p))
    );
    if (oldName.trim() !== "" && oldName !== nextName) {
      setTrains((prev) => {
        const next: Record<string, TrainDraft> = {};
        for (const [num, t] of Object.entries(prev)) {
          next[num] = {
            ...t,
            origine: t.origine === oldName ? nextName : t.origine,
            destination: t.destination === oldName ? nextName : t.destination,
          };
        }
        return next;
      });
    }
    setGeneratedJson(null);
  };

  // Horaires (donnée TRAIN, clé = identité PK du point). Lecture avec valeur vide par
  // défaut (point jamais édité pour ce train).
  const horaireFor = (index: number): TrainHoraire => {
    if (!train) return EMPTY_HORAIRE;
    const key = lignePointIdentityKey(lignePoints[index]);
    return train.horaires[key] ?? EMPTY_HORAIRE;
  };

  const updateHoraire = (
    index: number,
    field: keyof TrainHoraire,
    value: string
  ) => {
    if (!currentNumero) return;
    const key = lignePointIdentityKey(lignePoints[index]);
    setTrains((prev) => {
      const cur = prev[currentNumero];
      if (!cur) return prev;
      const prevHoraire = cur.horaires[key] ?? EMPTY_HORAIRE;
      return {
        ...prev,
        [currentNumero]: {
          ...cur,
          horaires: { ...cur.horaires, [key]: { ...prevHoraire, [field]: value } },
        },
      };
    });
    setGeneratedJson(null);
  };

  // Nouvelle règle de surlignage (07/08, simplifiée) : toute gare avec une heure
  // d'arrivée et/ou de départ est un arrêt → surlignée (Établissements/Arr/Pass/Dép).
  // Remplace l'ancienne logique dispersée (com/tecn, divergente selon les vues LIM).
  const isStopIndex = (index: number): boolean => {
    const h = horaireFor(index);
    return h.arrivee.trim() !== "" || h.depart.trim() !== "";
  };

  // Tranche de la ligne pour LE train sélectionné (origine → destination incluses).
  const ficheTrainSlice = (() => {
    if (!train || !train.origine || !train.destination) return null;
    const iO = lignePoints.findIndex((p) => p.etablissement === train.origine);
    const iD = lignePoints.findIndex((p) => p.etablissement === train.destination);
    if (iO === -1 || iD === -1) return null;
    return { start: Math.min(iO, iD), end: Math.max(iO, iD) };
  })();

  // Barres de séparation de la colonne Bloc : CALCULÉES à l'affichage — le normalisé
  // ne stocke QUE les valeurs (LIM place ses barres différemment). Une barre marque la
  // première ligne d'un nouveau bloc ; les notes sont ignorées dans le calcul.
  const blocBarIndexes = (() => {
    const set = new Set<number>();
    if (!ficheTrainSlice) return set;
    let previous = "";
    let hasPrevious = false;
    for (let i = ficheTrainSlice.start; i <= ficheTrainSlice.end; i++) {
      const p = lignePoints[i];
      if (p.type === "note") continue;
      const current = p.bloc.trim();
      if (current === "") continue;
      if (hasPrevious && current !== previous) set.add(i);
      previous = current;
      hasPrevious = true;
    }
    return set;
  })();

  // Barres de separation de la colonne Radio : meme principe que la colonne Bloc.
  // N'affichera aucune barre tant qu'une seule zone radio existe sur le parcours.
  const radioBarIndexes = (() => {
    const set = new Set<number>();
    if (!ficheTrainSlice) return set;
    let previous = "";
    let hasPrevious = false;
    for (let i = ficheTrainSlice.start; i <= ficheTrainSlice.end; i++) {
      const p = lignePoints[i];
      if (p.type === "note") continue;
      const current = p.radio.trim();
      if (current === "") continue;
      if (hasPrevious && current !== previous) set.add(i);
      previous = current;
      hasPrevious = true;
    }
    return set;
  })();

  // Barres de separation de la colonne Rampe : meme principe que la colonne Bloc.
  const rampeBarIndexes = (() => {
    const set = new Set<number>();
    if (!ficheTrainSlice) return set;
    let previous = "";
    let hasPrevious = false;
    for (let i = ficheTrainSlice.start; i <= ficheTrainSlice.end; i++) {
      const p = lignePoints[i];
      if (p.type === "note") continue;
      const current = p.rampe.trim();
      if (current === "") continue;
      if (hasPrevious && current !== previous) set.add(i);
      previous = current;
      hasPrevious = true;
    }
    return set;
  })();

  // Barres de separation de la colonne ETCS : meme principe que la colonne Bloc.
  // "" est une valeur réelle ici (niveau ETCS absent sur LFP/RAC/SNCF), donc — à la
  // différence de Bloc/Radio/Rampe — on NE saute PAS les lignes de données à "" : la
  // transition "1" → "" (sortie de la zone ADIF) doit produire une barre comme
  // n'importe quel autre changement de valeur.
  const etcsBarIndexes = (() => {
    const set = new Set<number>();
    if (!ficheTrainSlice) return set;
    let previous = "";
    let hasPrevious = false;
    for (let i = ficheTrainSlice.start; i <= ficheTrainSlice.end; i++) {
      const p = lignePoints[i];
      if (p.type === "note") continue;
      const current = p.etcs.trim();
      if (hasPrevious && current !== previous) set.add(i);
      previous = current;
      hasPrevious = true;
    }
    return set;
  })();

  // Barres de separation de la colonne Vmax : meme principe que la colonne Bloc
  // (calculees a l'affichage ; le normalise ne stocke que les valeurs).
  const vmaxBarIndexes = (() => {
    const set = new Set<number>();
    if (!ficheTrainSlice) return set;
    let previous = "";
    let hasPrevious = false;
    for (let i = ficheTrainSlice.start; i <= ficheTrainSlice.end; i++) {
      const p = lignePoints[i];
      if (p.type === "note") continue;
      // Cle = valeur + statut CSV : deux zones de MEME vitesse dont l'une est CSV
      // et l'autre non sont bien separees (comme sur le document).
      const current = p.vmax.trim() === "" ? "" : `${p.vmax.trim()}|${p.csv ? "csv" : ""}`;
      if (current === "") continue;
      if (hasPrevious && current !== previous) set.add(i);
      previous = current;
      hasPrevious = true;
    }
    return set;
  })();

  // Menu contextuel (clic droit sur une ligne de la fiche train) : ajouter une ligne
  // ou une NOTE, au-dessus ou en-dessous. Donnée LIGNE → vaut pour tous les trains.
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; index: number } | null>(null);

  const emptyLignePoint = (): LignePoint => ({
    bloc: "",
    vmax: "",
    radio: "",
    rampe: "",
    etcs: "",
    etablissement: "",
    pkAdif: "",
    pkLfp: "",
    pkRac: "",
    pkRfn: "",
  });

  // Note : `position` = ancrage pour le rendu à l'échelle ("au-dessus" → collée à la
  // ligne qui la suit ; "en-dessous" → collée à la ligne qui la précède).
  const emptyNotePoint = (position: "au-dessus" | "en-dessous"): LignePoint => ({
    type: "note",
    texte: "",
    position,
    bloc: "",
    vmax: "",
    radio: "",
    rampe: "",
    etcs: "",
    etablissement: "",
    pkAdif: "",
    pkLfp: "",
    pkRac: "",
    pkRfn: "",
  });

  const insertLignePoint = (index: number, point: LignePoint) => {
    setLignePoints((prev) => [...prev.slice(0, index), point, ...prev.slice(index)]);
    setGeneratedJson(null);
    setCtxMenu(null);
  };

  const updateNoteTexte = (index: number, texte: string) => {
    setLignePoints((prev) => prev.map((p, i) => (i === index ? { ...p, texte } : p)));
    setGeneratedJson(null);
  };

  const toggleNoteSurligne = (index: number) => {
    setLignePoints((prev) => prev.map((p, i) => (i === index ? { ...p, surligne: !p.surligne } : p)));
    setGeneratedJson(null);
    setCtxMenu(null);
  };

  // Édition d'une colonne « zone répétée » (Bloc/Radio/Rampe) : la ligne éditée ET
  // toutes les lignes SUIVANTES qui partageaient l'ancienne valeur sont mises à jour,
  // jusqu'à la prochaine zone existante (barre suivante). Les notes sont traversées
  // sans être modifiées ni casser la zone (même logique que le calcul des barres).
  // Les lignes AU-DESSUS ne bougent pas : une barre apparaît d'elle-même au-dessus de
  // la ligne éditée si elle diffère désormais de sa voisine (barres calculées).
  function propagateZoneField(
    points: LignePoint[],
    index: number,
    field: "bloc" | "radio" | "rampe" | "etcs",
    value: string
  ): LignePoint[] {
    const oldValue = points[index][field];
    const next = [...points];
    for (let i = index; i < next.length; i++) {
      const p = next[i];
      if (p.type === "note") continue;
      if (p[field] !== oldValue) break;
      next[i] = { ...p, [field]: value };
    }
    return next;
  }

  const updateBloc = (index: number, value: string) => {
    setLignePoints((prev) => propagateZoneField(prev, index, "bloc", value));
    setGeneratedJson(null);
  };

  const updateRadio = (index: number, value: string) => {
    setLignePoints((prev) => propagateZoneField(prev, index, "radio", value));
    setGeneratedJson(null);
  };

  const updateRampe = (index: number, value: string) => {
    setLignePoints((prev) => propagateZoneField(prev, index, "rampe", value));
    setGeneratedJson(null);
  };

  const updateEtcs = (index: number, value: string) => {
    setLignePoints((prev) => propagateZoneField(prev, index, "etcs", value));
    setGeneratedJson(null);
  };

  // Vmax : même propagation, mais la « zone » inclut le statut CSV (comme pour les
  // barres) — on s'arrête aussi si le CSV change, pour ne pas fusionner deux zones
  // volontairement séparées par le CSV. Le CSV lui-même NE se propage PAS (marqueur
  // ponctuel de début de zone, pas une valeur de zone) — cf. toggleCsv, inchangé.
  const updateVmax = (index: number, value: string) => {
    setLignePoints((prev) => {
      const oldVmax = prev[index].vmax;
      const oldCsv = prev[index].csv === true;
      const next = [...prev];
      for (let i = index; i < next.length; i++) {
        const p = next[i];
        if (p.type === "note") continue;
        if (p.vmax !== oldVmax || (p.csv === true) !== oldCsv) break;
        next[i] = { ...p, vmax: value };
      }
      return next;
    });
    setGeneratedJson(null);
  };

  const toggleCsv = (index: number) => {
    setLignePoints((prev) => prev.map((p, i) => (i === index ? { ...p, csv: !p.csv } : p)));
    setGeneratedJson(null);
    setCtxMenu(null);
  };

  // PK interne d'un point NOUVEAU ou modifié : interpolé entre les deux points
  // connus les plus proches PARTAGEANT LE MÊME RÉSEAU (avant ET après dans le
  // sens de la ligne), au ratio RÉELLEMENT observé entre eux — pas un delta 1:1
  // supposé. Vérifié sur l'ancien normalisé : le ratio vaut 1 sur ADIF et LFP
  // (pkInterne suit le PK réseau à l'unité près), mais ≈0.51 sur RAC (la voie de
  // RACcordement a sa propre échelle physique, plus courte que sa numérotation —
  // piège dans lequel j'étais tombé en supposant 1:1 partout, corrigé 09/08).
  // Si un seul voisin est trouvable (réseau avec un seul point archivé, ex.
  // SNCF), repli sur un delta 1:1 depuis ce seul voisin — moins fiable, non vérifié.
  function deriveInterneFor(points: LignePoint[], index: number, field: KmField, value: string): string {
    const newLocal = parseFloat(value.replace(",", "."));
    if (Number.isNaN(newLocal)) return "";

    const findNeighbor = (dir: 1 | -1) => {
      for (let i = index + dir; i >= 0 && i < points.length; i += dir) {
        const p = points[i];
        if (p.type === "note") continue;
        const localStr = p[field];
        const pk = parseFloat((localStr ?? "").replace(",", "."));
        const interne = parseFloat((p.pkInterne ?? "").replace(",", "."));
        if (!Number.isNaN(pk) && !Number.isNaN(interne)) return { local: pk, interne };
      }
      return null;
    };

    const before = findNeighbor(-1);
    const after = findNeighbor(1);

    if (before && after && before.local !== after.local) {
      const ratio = (after.interne - before.interne) / (after.local - before.local);
      return String(Math.round((before.interne + (newLocal - before.local) * ratio) * 100) / 100);
    }
    const single = before ?? after;
    if (single) {
      // Repli 1:1 (un seul voisin disponible) — cf. commentaire ci-dessus.
      return String(Math.round((single.interne + (single.local - newLocal)) * 100) / 100);
    }
    return "";
  }

  const updatePk = (index: number, field: KmField, value: string) => {
    setLignePoints((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value, pkInterne: deriveInterneFor(prev, index, field, value) };
      return next;
    });
    setGeneratedJson(null);
  };

  // Ligne neuve sans aucun PK : on écrit dans la chaîne du réseau COURANT, déduit du
  // dernier point de données au-dessus (sa chaîne « d'entrée » dans le sens sud→nord).
  const kmFieldForEmptyRow = (index: number): KmField => {
    for (let i = index - 1; i >= 0; i--) {
      const q = lignePoints[i];
      if (q.type === "note") continue;
      const vals = kmValues(q, currentDirection);
      if (vals.length > 0) return vals[vals.length - 1].field;
    }
    return currentDirection === "nordSud" ? "pkRfn" : "pkAdif";
  };

  // Mentions (données ligne) : édition, ajout, suppression.
  const updateMention = (index: number, field: keyof Mention, value: string) => {
    setMentions((prev) => prev.map((m, i) => (i === index ? { ...m, [field]: value } : m)));
    setGeneratedJson(null);
  };
  const addMention = () => {
    setMentions((prev) => [...prev, { titre: "", contenu: "" }]);
    setGeneratedJson(null);
  };
  const removeMention = (index: number) => {
    setMentions((prev) => prev.filter((_, i) => i !== index));
    setGeneratedJson(null);
  };


  const serializeLignePoints = (points: LignePoint[]) =>
    points.map((p) =>
      p.type === "note"
        ? { type: "note" as const, texte: p.texte ?? "", position: p.position ?? "en-dessous", surligne: p.surligne === true }
        : {
            bloc: p.bloc,
            vmax: p.vmax,
            csv: p.csv === true,
            radio: p.radio,
            rampe: p.rampe,
            etcs: p.etcs,
            etablissement: p.etablissement,
            pkAdif: p.pkAdif,
            pkLfp: p.pkLfp,
            pkRac: p.pkRac,
            pkRfn: p.pkRfn,
            pkInterne: p.pkInterne ?? "",
          }
    );

  // Fichier normalisé = catalogue matériels + TOUTES les versions des données ligne
  // (versionnées) + TOUS les trains (chaque variante référence sa ligneVersionId).
  const buildNormalized = () => ({
    formatVersion: "2026",
    materiels,
    ligneVersions: Object.fromEntries(
      Object.entries(ligneVersions).map(([id, v]) => [
        id,
        {
          numeroVersion: v.numeroVersion,
          dateVigueur: v.dateVigueur,
          mentions: v.mentions,
          sudNord: serializeLignePoints(v.sudNord),
          nordSud: serializeLignePoints(v.nordSud),
        },
      ])
    ),
    trains: Object.fromEntries(
      trainNumbers.map((num) => {
        const t = trains[num];
        return [
          num,
          {
            variants: [
              {
                ligneVersionId: t.ligneVersionId,
                validityStartDate: t.validityStartDate,
                validityEndDate: t.validityEndDate,
                meta: {
                  numeroEspagne: t.numeroEspagne,
                  numeroFrance: t.numeroFrance,
                  origine: t.origine,
                  destination: t.destination,
                  categorieSNCF: t.categorieSNCF,
                  categorieLFP: t.categorieLFP,
                  categorieADIF: t.categorieADIF,
                  materiel: t.materiel,
                  direction: t.direction,
                  horaires: t.horaires,
                },
              },
            ],
          },
        ];
      })
    ),
  });

  // « Publier » ne doit être actif QUE s'il y a de vraies modifications en
  // attente par rapport à ce qui est déjà persisté LOCALEMENT — même
  // comportement que l'ancien pipeline (demande utilisateur, 09/08). Comparaison
  // directe des deux sérialisations JSON (même sérialisation que
  // `handleConfirmPublish` écrit) : pas de mémoïsation, recalcul à chaque
  // rendu, mais bon marché.
  const hasPendingChanges =
    trainNumbers.length > 0 &&
    JSON.stringify(buildNormalized(), null, 2) !== (localStorage.getItem(NORMALIZED_LOCAL_KEY) ?? "");

  // Garde-fou publication (11/08) : vérifie que le sens de circulation déclaré
  // de chaque train correspond bien à l'ordre réel origine→destination dans les
  // données ligne, ET que ces deux établissements existent tels quels. Découvert
  // via le train 38510 (direction fausse) + 9711/9713/9715 (destination mal
  // orthographiée) — les deux causes produisaient le même symptôme (repli
  // silencieux sur toute la ligne, ou pire, ordre inversé). BLOQUANT à la
  // publication : donnée de sécurité (positionnement GPS/fiche train), pas
  // seulement un souci d'affichage.
  const directionInconsistencies = trainNumbers.flatMap((num) => {
    const t = trains[num];
    const ver = ligneVersions[t.ligneVersionId];
    if (!ver) return [];
    const table = t.direction === "nordSud" ? ver.nordSud : ver.sudNord;
    const startIdx = table.findIndex((p) => p.type !== "note" && p.etablissement === t.origine);
    const endIdx = table.findIndex((p) => p.type !== "note" && p.etablissement === t.destination);
    if (startIdx === -1 || endIdx === -1) {
      return [
        `Train ${num} : origine ou destination introuvable dans les données ligne (sens "${t.direction}") — ` +
          `vérifie l'orthographe exacte (origine="${t.origine}", destination="${t.destination}").`,
      ];
    }
    if (endIdx < startIdx) {
      return [
        `Train ${num} : sens de circulation probablement faux — origine="${t.origine}" apparaît après ` +
          `destination="${t.destination}" dans le sens "${t.direction}" déclaré.`,
      ];
    }
    return [];
  });

  // ---- IMPORTATEUR : classeurs Excel → diffs → modale → application --------------
  const handleImportFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setImportBusy(true);
    setImportError(null);
    try {
      const buffers = await Promise.all([...files].map((f) => f.arrayBuffer()));
      const currentTrains: CurrentTrain[] = trainNumbers.map((num) => {
        const t = trains[num];
        return {
          numero: num,
          direction: t.direction,
          origine: t.origine,
          destination: t.destination,
          validityStartDate: t.validityStartDate,
          horaires: t.horaires,
        };
      });
      const result = await runImport(
        buffers,
        { sudNord: currentLigneVersion.sudNord, nordSud: currentLigneVersion.nordSud },
        currentTrains
      );
      setImportResult(result);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : String(err));
    } finally {
      setImportBusy(false);
    }
  };

  const handleApplyImport = (decisions: Record<string, Decision>) => {
    if (!importResult) return;
    const acceptedLigne = importResult.ligneDiffs.filter((d) => decisions[d.id] === "accepte");
    const acceptedTrains = importResult.trainDiffs.filter((d) => decisions[d.id] === "accepte");

    // Données ligne, par sens.
    setLigneVersions((prev) => {
      const version = prev[currentVersionId] ?? cloneDefaultLigneVersion();
      return {
        ...prev,
        [currentVersionId]: {
          ...version,
          sudNord: applyLigneActions(
            version.sudNord,
            acceptedLigne.filter((d) => d.direction === "sudNord").map((d) => d.apply)
          ),
          nordSud: applyLigneActions(
            version.nordSud,
            acceptedLigne.filter((d) => d.direction === "nordSud").map((d) => d.apply)
          ),
        },
      };
    });

    // Trains : création d'un train candidat accepté = TrainDraft complet, horaires
    // résolus vers les clés canoniques du sens concerné.
    const createTrain = (numero: string): TrainDraft | null => {
      const cand = importResult.candidates.find((c) => c.numero === numero);
      if (!cand) return null;
      const base = makeTrain(numero, currentVersionId, cand.dateVigueur || currentLigneVersion.dateVigueur, cand.direction);
      const matcher = buildPointMatcher(currentLigneVersion[cand.direction]);
      const horaires: Record<string, TrainHoraire> = {};
      for (const p of cand.points) {
        if (!p.arr && !p.pass && !p.dep) continue;
        const canon = matcher(p);
        const key = canon ? diffIdentityKey(canon) : diffIdentityKey(p);
        horaires[key] = { arrivee: p.arr, passage: p.pass, depart: p.dep };
      }
      return {
        ...base,
        origine: cand.origine,
        destination: cand.destination,
        horaires,
      };
    };
    setTrains((prev) => applyTrainActions(prev, acceptedTrains.map((d) => d.apply), createTrain));

    // « Toujours refuser » → mémorisé pour les prochains imports (ex. les PK
    // d'ancre GPS, délibérément différents du document à chaque fois). Un simple
    // « refuser » n'est PAS mémorisé : la divergence sera re-proposée au prochain
    // import. Si l'utilisateur change d'avis sur un item déjà mémorisé (l'accepte
    // ou le refuse « cette fois » seulement), on le retire du registre.
    const memo = readRefusMemorises();
    for (const [id, decision] of Object.entries(decisions)) {
      if (decision === "toujours") memo.add(id);
      else memo.delete(id);
    }
    writeRefusMemorises(memo);

    setGeneratedJson(null);
    setImportResult(null);
  };

  // « Publier » (ex-Valider, 09/08) : ouvre une modale de confirmation (comme
  // l'ancien Publier), puis sur confirmation, enregistre le brouillon local ET
  // pousse vers le fichier 2026 publié en ligne (repo lim-editor, chemin
  // SÉPARÉ de l'ancien format — cohabitation temporaire, cf. mémoire projet).
  const handlePublishClick = () => {
    if (!hasPendingChanges || isPublishing) return;
    setPublishError(null);
    setPublishSuccessMessage(null);
    setShowPublishModal(true);
  };

  const handleCancelPublish = () => {
    if (isPublishing) return;
    setShowPublishModal(false);
  };

  const handleConfirmPublish = async () => {
    if (isPublishing || directionInconsistencies.length > 0) return;
    setIsPublishing(true);
    setPublishError(null);
    try {
      const normalized = buildNormalized();
      const json = JSON.stringify(normalized, null, 2);
      setGeneratedJson(json);
      try {
        localStorage.setItem(NORMALIZED_LOCAL_KEY, json);
      } catch {
        // stockage indisponible → la publication en ligne reste tentée quand même.
      }
      const diagnostic = await publishLigneFt2026Data(normalized);
      const editorPart = diagnostic.archiveCreated
        ? `Éditeur publié (archive créée : ${diagnostic.archiveCreated.name}).`
        : "Éditeur publié (1er publish — aucune archive à créer).";
      const lim2Part = diagnostic.lim2Published
        ? " LIM2 publié."
        : ` ⚠️ Publication LIM2 échouée (${diagnostic.lim2Error ?? "erreur inconnue"}) — l'éditeur reste à jour, réessaie la publication pour LIM2.`;
      setPublishSuccessMessage(
        `${editorPart}${lim2Part} La mise à jour peut nécessiter quelques minutes avant d'être visible en ligne.`
      );
      setShowPublishModal(false);
    } catch (error) {
      setPublishError(error instanceof Error ? error.message : "Erreur inconnue.");
    } finally {
      setIsPublishing(false);
    }
  };

  const handleDownload = () => {
    if (!generatedJson) return;
    const blob = new Blob([generatedJson], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "normalise-2026.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      {/* ================= CADRE 1 — Sélection du train ================= */}
      <div style={CARD}>
        <div style={CARD_TITLE}>Sélection du train</div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <select
            value={creating ? ADD_CUSTOM_SENTINEL : currentNumero ?? ""}
            onChange={(e) => selectTrain(e.target.value)}
            style={{ ...INPUT, width: "auto", minWidth: 200 }}
            title="Sélectionner un train, ou en créer un"
          >
            <option value="">— sélectionner un train —</option>
            {trainNumbers.map((num) => (
              <option key={num} value={num}>
                Train {num}
              </option>
            ))}
            <option value={ADD_CUSTOM_SENTINEL}>➕ Créer un train…</option>
          </select>
          <label
            style={{
              ...secondaryBtn(importBusy),
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              cursor: importBusy ? "wait" : "pointer",
            }}
            title="Importer les classeurs Excel source (un ou deux fichiers) et examiner les divergences avant application"
          >
            📥 {importBusy ? "Analyse en cours…" : "Importer des trains"}
            <input
              type="file"
              accept=".xlsx"
              multiple
              disabled={importBusy}
              style={{ display: "none" }}
              onChange={(e) => {
                void handleImportFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
          {importError ? (
            <span style={{ color: "#b91c1c", fontSize: 13 }}>Import impossible : {importError}</span>
          ) : null}
          {/* À l'écart du reste (marginLeft: auto) et d'une couleur volontairement
              distincte (violet) — ce n'est PAS un bouton lié à la sélection du
              train, c'est l'action de publication du normalisé 2026 (demande
              utilisateur, 09/08). Actif seulement s'il y a de vraies modifications
              en attente par rapport à ce qui est déjà persisté localement. */}
          <button
            type="button"
            onClick={handlePublishClick}
            disabled={!hasPendingChanges || isPublishing}
            style={{ ...validerBtn(!hasPendingChanges || isPublishing), marginLeft: "auto" }}
            title="Publie le normalisé 2026 (fichier séparé de l'ancien normalisé, avec archivage)"
          >
            {isPublishing ? "Publication…" : "Publier"}
          </button>
        </div>
        {publishSuccessMessage ? (
          <div style={{ marginTop: 10, fontSize: 13, color: "#15803d" }}>✅ {publishSuccessMessage}</div>
        ) : null}

        {creating ? (
          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "flex-end",
              marginTop: 14,
              padding: 16,
              border: "1px dashed #9ca3af",
              borderRadius: 12,
              background: "#f9fafb",
              maxWidth: 420,
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={LABEL}>Numéro espagnol du train</div>
              <input
                autoFocus
                value={numeroInput}
                onChange={(e) => {
                  setNumeroInput(e.target.value);
                  setNumeroError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") confirmCreate();
                }}
                placeholder="ex. 9705"
                style={INPUT}
              />
              {numeroError ? (
                <div style={{ color: "#b91c1c", fontSize: 12, marginTop: 4 }}>
                  {numeroError}
                </div>
              ) : null}
            </div>
            <div style={{ flex: 1 }}>
              <div style={LABEL}>Sens de circulation</div>
              <select
                value={directionInput}
                onChange={(e) => setDirectionInput(e.target.value === "nordSud" ? "nordSud" : "sudNord")}
                style={INPUT}
              >
                <option value="sudNord">Sud → Nord (Barcelona → Perpignan)</option>
                <option value="nordSud">Nord → Sud (Perpignan → Barcelona)</option>
              </select>
            </div>
            <button type="button" onClick={confirmCreate} style={primaryBtn(false)}>
              Créer
            </button>
          </div>
        ) : null}
      </div>

      {/* ================= CADRE 2 — Données train ================= */}
      {train ? (
        <div style={CARD}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={CARD_TITLE}>Données train</div>
            <button
              type="button"
              onClick={deleteCurrentTrain}
              title="Supprimer ce train du normalisé (effectif après publication)"
              style={{
                padding: "6px 12px",
                borderRadius: 8,
                border: "1px solid #fca5a5",
                background: "#fef2f2",
                color: "#b91c1c",
                fontWeight: 700,
                fontSize: 13,
                cursor: "pointer",
                height: "fit-content",
              }}
            >
              🗑 Supprimer ce train
            </button>
          </div>
          <div style={{ maxWidth: 720 }}>
            <div style={{ marginBottom: 18 }}>
              <div style={LABEL}>Train (n° espagnol — identifiant, non éditable)</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
                <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: "0.02em" }}>
                  {train.numeroEspagne}
                </div>
                <div style={{ fontSize: 12, color: "#9ca3af" }}>
                  n° français : {train.numeroFrance || "—"}
                </div>
              </div>
            </div>

            {/* Cette variante référence une version des données ligne + sa propre
                date de vigueur (permet de préparer une V2 sans qu'elle ne remplace
                immédiatement la version en cours). */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 18 }}>
              <div>
                <div style={LABEL} title="Déduit automatiquement d'Origine/Destination — pas éditable directement (11/08 : un champ saisi à part était source d'erreur et se perdait à chaque ré-import).">
                  Sens de circulation
                </div>
                <div style={{ ...INPUT, background: "#f3f4f6", display: "flex", alignItems: "center" }}>
                  {train.direction === "nordSud" ? "Nord → Sud" : "Sud → Nord"}
                </div>
              </div>
              <div>
                <div style={LABEL}>Version des données ligne</div>
                <select
                  value={train.ligneVersionId}
                  onChange={(e) => updateField("ligneVersionId", e.target.value)}
                  style={INPUT}
                >
                  {Object.entries(ligneVersions).map(([id, v]) => (
                    <option key={id} value={id}>
                      {v.numeroVersion ? `Version ${v.numeroVersion}` : id}
                      {v.dateVigueur ? ` (${v.dateVigueur})` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div style={LABEL}>Date de vigueur (cette variante)</div>
                <input
                  type="date"
                  value={train.validityStartDate}
                  onChange={(e) => updateField("validityStartDate", e.target.value)}
                  style={INPUT}
                />
              </div>
              <div>
                <div style={LABEL}>Date de fin (optionnelle)</div>
                <input
                  type="date"
                  value={train.validityEndDate}
                  onChange={(e) => updateField("validityEndDate", e.target.value)}
                  style={INPUT}
                />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 18 }}>
              <div>
                <div style={LABEL}>Origine</div>
                <select
                  value={train.origine}
                  onChange={(e) => updateField("origine", e.target.value)}
                  style={INPUT}
                >
                  <option value="">— choisir —</option>
                  {lignePoints
                    .filter((p) => p.etablissement.trim() !== "")
                    .map((p) => (
                      <option key={`o-${p.etablissement}`} value={p.etablissement}>
                        {p.etablissement} ({pkSummary(p)})
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <div style={LABEL}>Destination</div>
                <select
                  value={train.destination}
                  onChange={(e) => updateField("destination", e.target.value)}
                  style={INPUT}
                >
                  <option value="">— choisir —</option>
                  {lignePoints
                    .filter((p) => p.etablissement.trim() !== "")
                    .map((p) => (
                      <option key={`d-${p.etablissement}`} value={p.etablissement}>
                        {p.etablissement} ({pkSummary(p)})
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 18 }}>
              <EditableSelect
                label="Catégorie SNCF"
                value={train.categorieSNCF}
                options={possibleValues("categorieSNCF")}
                placeholder="ex. E32C"
                onChange={(v) => updateField("categorieSNCF", v)}
              />
              <EditableSelect
                label="Catégorie LFP"
                value={train.categorieLFP}
                options={possibleValues("categorieLFP")}
                placeholder="ex. Type 300"
                onChange={(v) => updateField("categorieLFP", v)}
              />
              <EditableSelect
                label="Catégorie ADIF"
                value={train.categorieADIF}
                options={possibleValues("categorieADIF")}
                placeholder="ex. Tipo 200"
                onChange={(v) => updateField("categorieADIF", v)}
              />
            </div>

            <div style={{ maxWidth: 460 }}>
              <MaterielField
                value={train.materiel}
                materiels={materiels}
                onChange={(v) => updateField("materiel", v)}
                onAddMateriel={addMateriel}
              />
            </div>
          </div>
        </div>
      ) : null}

      {/* ================= CADRE 3 — Fiche train ================= */}
      {/* Aperçu RÉALISTE de la fiche train affichée en mode vertical (comme le fait
          l'éditeur actuel — s'y référer). À construire colonne par colonne ;
          les barres de séparation sont PAR COLONNE (bloc, vitesses, rampes…),
          portées par la première ligne du changement. */}
      {train ? (
        <div style={CARD}>
          <div style={CARD_TITLE}>
            Fiche train{" "}
            <span style={{ fontWeight: 400, color: "#6b7280", fontSize: 13 }}>
              ({currentDirection === "nordSud" ? "sens nord → sud" : "sens sud → nord"})
            </span>
          </div>

          {/* Mentions (données ligne) — affichées par LIM au-dessus de la fiche train.
              Déplacées ici depuis le cadre « Données ligne » (09/08, demande
              utilisateur) : plus logique au même endroit que ce qu'elles accompagnent. */}
          <div style={{ maxWidth: 720, marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>
              Mentions (affichées au-dessus de la fiche train)
            </div>
            <div style={{ fontSize: 12, color: "#1d4ed8", marginBottom: 8 }}>
              ⚠️ Donnée ligne : modifier une mention ici la change pour TOUS les trains.
            </div>
            {mentions.map((m, i) => (
              <div key={i} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
                <input
                  value={m.titre}
                  onChange={(e) => updateMention(i, "titre", e.target.value)}
                  placeholder="Titre"
                  style={{ ...INPUT, flex: 1 }}
                />
                <input
                  value={m.contenu}
                  onChange={(e) => updateMention(i, "contenu", e.target.value)}
                  placeholder="Contenu"
                  style={{ ...INPUT, flex: 3 }}
                />
                <button
                  type="button"
                  onClick={() => removeMention(i)}
                  title="Supprimer cette mention"
                  style={{
                    padding: "7px 10px",
                    borderRadius: 8,
                    border: "1px solid #d1d5db",
                    background: "#ffffff",
                    color: "#b91c1c",
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addMention}
              style={{
                padding: "6px 12px",
                borderRadius: 8,
                border: "1px solid #6b7280",
                background: "#ffffff",
                color: "#374151",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              ➕ Ajouter une mention
            </button>
          </div>

          {/* Légende ligne/train (09/08, demande utilisateur) : couleur des cellules
              éditables de la fiche train ci-dessous. */}
          <div style={{ display: "flex", gap: 20, alignItems: "center", fontSize: 12, color: "#6b7280", marginBottom: 10 }}>
            <span>
              <span style={{ color: "#1d4ed8", fontWeight: 700 }}>■</span> donnée ligne — modifie TOUS les trains
            </span>
            <span>
              <span style={{ color: "#111827", fontWeight: 700 }}>■</span> donnée train — modifie ce train seulement
            </span>
          </div>

          {ficheTrainSlice == null ? (
            <div style={{ fontSize: 13, color: "#6b7280" }}>
              Choisissez l'origine et la destination du train (cadre « Données train »)
              pour afficher sa fiche.
            </div>
          ) : (
            <table className="n26-ft" style={{ borderCollapse: "collapse", fontSize: 13 }}>
              {/* Survol : même comportement que les tableaux de l'ancien éditeur
                  (FTTable.css : tbody tr:hover → #f9fafb). */}
              <style>{`.n26-ft tbody tr:hover { background: #f9fafb; }`}</style>
              <thead>
                <tr>
                  <th style={{ ...TH, width: 60, textAlign: "center" }}>Bloc</th>
                  <th style={{ ...TH, width: 60, textAlign: "center" }}>Vmax</th>
                  <th style={{ ...TH, width: 70, textAlign: "right" }}>KM</th>
                  <th style={{ ...TH, minWidth: 280 }}>Établissements</th>
                  <th style={{ ...TH, width: 55, textAlign: "center" }}>Arr</th>
                  <th style={{ ...TH, width: 55, textAlign: "center" }}>Pass</th>
                  <th style={{ ...TH, width: 55, textAlign: "center" }}>Dép</th>
                  <th style={{ ...TH, width: 70, textAlign: "center" }}>Radio</th>
                  <th style={{ ...TH, width: 55, textAlign: "center" }} title="Rampe caractéristique">↗</th>
                  <th style={{ ...TH, width: 55, textAlign: "center" }} title="Niveau ETCS">ETCS</th>
                </tr>
              </thead>
              <tbody>
                {lignePoints
                  .slice(ficheTrainSlice.start, ficheTrainSlice.end + 1)
                  .map((p, k) => {
                    const index = ficheTrainSlice.start + k;
                    const onCtx = (e: React.MouseEvent) => {
                      e.preventDefault();
                      setCtxMenu({ x: e.clientX, y: e.clientY, index });
                    };
                    // La fine ligne entre une ligne et SA note est effacee, pour voir
                    // visuellement a quelle ligne la note est associee :
                    //  - note "en-dessous" (ancree a la ligne au-dessus) -> bord du bas
                    //    de la ligne precedente efface ;
                    //  - note "au-dessus" (ancree a la ligne en dessous) -> bord du bas
                    //    de la note elle-meme efface.
                    const next = lignePoints[index + 1];
                    const eraseBottom =
                      (p.type === "note" && p.position === "au-dessus") ||
                      (next?.type === "note" && next.position === "en-dessous");
                    const cellTD: React.CSSProperties = eraseBottom
                      ? { ...TD, borderBottom: "none" }
                      : TD;
                    if (p.type === "note") {
                      return (
                        <tr key={index} onContextMenu={onCtx}>
                          {/* Colonnes Bloc, Vmax et KM laissées vides : la note
                              s'aligne sur la colonne Établissements. */}
                          <td style={cellTD} />
                          <td style={cellTD} />
                          <td style={cellTD} />
                          <td style={{ ...cellTD, background: p.surligne ? "#fbe2d5" : undefined }}>
                            <ClickToEditCell
                              value={p.texte ?? ""}
                              red
                              placeholder="(note vide — cliquer pour saisir)"
                              onCommit={(v) => updateNoteTexte(index, v)}
                            />
                          </td>
                          <td style={cellTD} />
                          <td style={cellTD} />
                          <td style={cellTD} />
                          <td style={cellTD} />
                          <td style={cellTD} />
                          <td style={cellTD} />
                        </tr>
                      );
                    }
                    const kms = kmValues(p, currentDirection);
                    return (
                      <tr key={index} onContextMenu={onCtx}>
                        {/* Bloc : barre de séparation (calculée) empilée AU-DESSUS de
                            la valeur — une ligne peut porter les deux. */}
                        <td style={{ ...cellTD, textAlign: "center", verticalAlign: "top" }}>
                          {blocBarIndexes.has(index) ? (
                            <div
                              style={{
                                height: 2,
                                background: "#111827",
                                borderRadius: 999,
                                marginBottom: 4,
                              }}
                            />
                          ) : null}
                          <ClickToEditCell
                            value={p.bloc}
                            blue
                            onCommit={(v) => updateBloc(index, v)}
                          />
                        </td>
                        <td
                          style={{
                            ...cellTD,
                            textAlign: "center",
                            verticalAlign: "top",
                            // CSV : fond orange, comme sur le document.
                            background: p.csv ? "#ffc000" : undefined,
                          }}
                        >
                          {vmaxBarIndexes.has(index) ? (
                            <div
                              style={{
                                height: 2,
                                background: "#111827",
                                borderRadius: 999,
                                marginBottom: 4,
                              }}
                            />
                          ) : null}
                          <ClickToEditCell
                            value={p.vmax}
                            blue
                            onCommit={(v) => updateVmax(index, v)}
                          />
                        </td>
                        <td style={{ ...cellTD, textAlign: "right", verticalAlign: "top" }}>
                          {kms.length === 0 ? (
                            <ClickToEditCell
                              value=""
                              blue
                              alignRight
                              onCommit={(v) => updatePk(index, kmFieldForEmptyRow(index), v)}
                            />
                          ) : (
                            kms.map(({ field, value }) => (
                              <ClickToEditCell
                                key={field}
                                value={value}
                                blue
                                alignRight
                                onCommit={(v) => updatePk(index, field, v)}
                              />
                            ))
                          )}
                        </td>
                        {(() => {
                          // Nouvelle règle (07/08) : gare avec arrivée et/ou départ =
                          // arrêt → surlignage jaune (même dégradé que LIM, cf.
                          // FTTableLayout.tsx .ft-highlight-cell), sur les 4 cellules
                          // Établissements/Arr/Pass/Dép.
                          const stop = isStopIndex(index);
                          const stopBg = stop
                            ? "linear-gradient(180deg, #ffff00 0%, #fffda6 100%)"
                            : undefined;
                          const h = horaireFor(index);
                          return (
                            <>
                              <td style={{ ...cellTD, background: stopBg }}>
                                <ClickToEditCell
                                  value={p.etablissement}
                                  bold
                                  blue
                                  onCommit={(v) => renameEtablissement(index, v)}
                                />
                              </td>
                              <td style={{ ...cellTD, textAlign: "center", background: stopBg }}>
                                <ClickToEditCell
                                  value={h.arrivee}
                                  alignRight
                                  onCommit={(v) => updateHoraire(index, "arrivee", v)}
                                />
                              </td>
                              <td style={{ ...cellTD, textAlign: "center", background: stopBg }}>
                                <ClickToEditCell
                                  value={h.passage}
                                  alignRight
                                  onCommit={(v) => updateHoraire(index, "passage", v)}
                                />
                              </td>
                              <td style={{ ...cellTD, textAlign: "center", background: stopBg }}>
                                <ClickToEditCell
                                  value={h.depart}
                                  alignRight
                                  onCommit={(v) => updateHoraire(index, "depart", v)}
                                />
                              </td>
                            </>
                          );
                        })()}
                        <td style={{ ...cellTD, textAlign: "center", verticalAlign: "top" }}>
                          {radioBarIndexes.has(index) ? (
                            <div
                              style={{
                                height: 2,
                                background: "#111827",
                                borderRadius: 999,
                                marginBottom: 4,
                              }}
                            />
                          ) : null}
                          <ClickToEditCell value={p.radio} blue onCommit={(v) => updateRadio(index, v)} />
                        </td>
                        <td style={{ ...cellTD, textAlign: "center", verticalAlign: "top" }}>
                          {rampeBarIndexes.has(index) ? (
                            <div
                              style={{
                                height: 2,
                                background: "#111827",
                                borderRadius: 999,
                                marginBottom: 4,
                              }}
                            />
                          ) : null}
                          <ClickToEditCell value={p.rampe} blue onCommit={(v) => updateRampe(index, v)} />
                        </td>
                        <td style={{ ...cellTD, textAlign: "center", verticalAlign: "top" }}>
                          {etcsBarIndexes.has(index) ? (
                            <div
                              style={{
                                height: 2,
                                background: "#111827",
                                borderRadius: 999,
                                marginBottom: 4,
                              }}
                            />
                          ) : null}
                          <ClickToEditCell value={p.etcs} blue onCommit={(v) => updateEtcs(index, v)} />
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          )}
        </div>
      ) : null}

      {/* ================= CADRE 4 — Données ligne (socle commun) ================= */}
      <div style={CARD}>
        <div style={CARD_TITLE}>Données ligne</div>
        <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 12 }}>
          👁️ Cadre en CONSULTATION uniquement — pas éditable ici (l'édition se fait dans la fiche train ci-dessus).
        </div>

        {/* Sens affiché : sélecteur indépendant du train sélectionné (demande
            utilisateur, 09/08) — auparavant hardcodé sur sud→nord. */}
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <button
            type="button"
            onClick={() => setLigneViewDirection("sudNord")}
            style={ligneViewDirection === "sudNord" ? primaryBtn(false) : secondaryOutlineBtn}
          >
            Sud → Nord
          </button>
          <button
            type="button"
            onClick={() => setLigneViewDirection("nordSud")}
            style={ligneViewDirection === "nordSud" ? primaryBtn(false) : secondaryOutlineBtn}
          >
            Nord → Sud
          </button>
        </div>

        {/* Tableau complet de la ligne, un PK par réseau */}
        <div style={{ maxWidth: 780 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
            {ligneViewDirection === "nordSud"
              ? "Sens NORD → SUD (Perpignan → Can Tunis)"
              : "Sens SUD → NORD (Can Tunis → Perpignan)"}{" "}
            · un PK par réseau
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ ...TH, width: 60 }}>Bloc</th>
                  <th style={{ ...TH, width: 60 }}>Vmax</th>
                  <th style={{ ...TH, minWidth: 200 }}>Établissement</th>
                  <th style={{ ...TH, width: 55 }}>Radio</th>
                  <th style={{ ...TH, width: 45 }}>↗</th>
                  <th style={{ ...TH, width: 45 }}>ETCS</th>
                  <th style={{ ...TH, width: 80 }} title="Valeur physique unifiée, reprise de l'ancien normalisé — pas une donnée saisie">
                    PK interne
                  </th>
                  <th style={{ ...TH, width: 70 }}>ADIF</th>
                  <th style={{ ...TH, width: 60 }}>LFP</th>
                  <th style={{ ...TH, width: 60 }}>RAC</th>
                  <th style={{ ...TH, width: 70 }}>SNCF</th>
                  <th style={{ ...TH, width: 90 }}>Réseau</th>
                  <th style={TH}>Note</th>
                </tr>
              </thead>
              <tbody>
                {currentLigneVersion[ligneViewDirection].map((p, i) =>
                  p.type === "note" ? (
                    <tr key={i}>
                      <td
                        colSpan={13}
                        style={{
                          ...TD,
                          fontVariantNumeric: "normal",
                          color: "#b91c1c",
                          fontWeight: 600,
                          background: p.surligne ? "#fbe2d5" : undefined,
                        }}
                      >
                        {p.texte?.trim() || "(note vide)"}
                      </td>
                    </tr>
                  ) : (
                  <tr key={i}>
                    <td style={{ ...TD, fontVariantNumeric: "normal" }}>{p.bloc}</td>
                    <td style={{ ...TD, background: p.csv ? "#ffc000" : undefined }}>{p.vmax}</td>
                    <td style={{ ...TD, fontWeight: 600, fontVariantNumeric: "normal" }}>{p.etablissement}</td>
                    <td style={{ ...TD, fontVariantNumeric: "normal" }}>{p.radio}</td>
                    <td style={{ ...TD, fontVariantNumeric: "normal" }}>{p.rampe}</td>
                    <td style={{ ...TD, fontVariantNumeric: "normal" }}>{p.etcs}</td>
                    <td style={{ ...TD, fontWeight: 600 }} title="Repris de l'ancien normalisé — pas une donnée saisie">
                      {p.pkInterne || ""}
                    </td>
                    <td style={TD}>{p.pkAdif}</td>
                    <td style={TD}>{p.pkLfp}</td>
                    <td style={TD}>{p.pkRac}</td>
                    <td style={TD}>{p.pkRfn}</td>
                    <td style={{ ...TD, fontVariantNumeric: "normal", color: "#374151" }}>{deduceReseau(p)}</td>
                    <td style={{ ...TD, fontVariantNumeric: "normal", color: "#9ca3af", fontSize: 12 }}>{p.note ?? ""}</td>
                  </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Menu contextuel des lignes de la fiche train */}
      {ctxMenu ? (
        <>
          <div
            style={{ position: "fixed", inset: 0, zIndex: 40 }}
            onClick={() => setCtxMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault();
              setCtxMenu(null);
            }}
          />
          <div
            style={{
              position: "fixed",
              top: ctxMenu.y,
              left: ctxMenu.x,
              zIndex: 50,
              background: "#ffffff",
              border: "1px solid #d1d5db",
              borderRadius: 10,
              boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
              padding: 4,
              minWidth: 230,
            }}
          >
            {[
              { label: "➕ Ajouter une ligne au-dessus", action: () => insertLignePoint(ctxMenu.index, emptyLignePoint()) },
              { label: "➕ Ajouter une ligne en-dessous", action: () => insertLignePoint(ctxMenu.index + 1, emptyLignePoint()) },
              { label: "📝 Ajouter une note au-dessus", action: () => insertLignePoint(ctxMenu.index, emptyNotePoint("au-dessus")) },
              { label: "📝 Ajouter une note en-dessous", action: () => insertLignePoint(ctxMenu.index + 1, emptyNotePoint("en-dessous")) },
              ...(lignePoints[ctxMenu.index]?.type !== "note"
                ? [
                    {
                      label: lignePoints[ctxMenu.index]?.csv
                        ? "🟧 Annuler le CSV"
                        : "🟧 Marquer comme CSV",
                      action: () => toggleCsv(ctxMenu.index),
                    },
                  ]
                : []),
              ...(lignePoints[ctxMenu.index]?.type === "note"
                ? [
                    {
                      label: lignePoints[ctxMenu.index].surligne
                        ? "🖍 Annuler le surlignement"
                        : "🖍 Surligner la note",
                      action: () => toggleNoteSurligne(ctxMenu.index),
                    },
                  ]
                : []),
            ].map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={item.action}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "8px 12px",
                  border: "none",
                  background: "transparent",
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#111827",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = "#f3f4f6";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </>
      ) : null}

      {/* Fichier normalisé généré (vérification) */}
      {generatedJson ? (
        <div style={CARD}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Fichier normalisé généré</div>
            <button
              type="button"
              onClick={handleDownload}
              style={{
                padding: "5px 12px",
                borderRadius: 8,
                border: "1px solid #6b7280",
                background: "#ffffff",
                color: "#374151",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Télécharger .json
            </button>
          </div>
          <pre
            style={{
              margin: 0,
              padding: 16,
              background: "#0b1021",
              color: "#e5e7eb",
              borderRadius: 12,
              fontSize: 12.5,
              lineHeight: 1.5,
              overflowX: "auto",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
            }}
          >
            {generatedJson}
          </pre>
        </div>
      ) : null}

      {importResult ? (
        <ImportDiffModal
          ligneDiffs={importResult.ligneDiffs}
          trainDiffs={importResult.trainDiffs}
          refusMemorises={readRefusMemorises()}
          onApply={handleApplyImport}
          onClose={() => setImportResult(null)}
        />
      ) : null}

      {/* Modale de confirmation « Publier » (09/08) — même gabarit que
          ImportDiffModal (overlay + carte centrée). Publie sur le repo
          lim-editor, fichier normalisé 2026 SÉPARÉ de l'ancien (cohabitation
          temporaire, cf. mémoire projet). */}
      {showPublishModal ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(17, 24, 39, 0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: 16,
              width: "min(520px, 92vw)",
              boxShadow: "0 20px 50px rgba(0,0,0,0.3)",
              padding: 24,
            }}
          >
            <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 12 }}>Publier le normalisé 2026 ?</div>
            <div style={{ fontSize: 13.5, color: "#374151", lineHeight: 1.5, marginBottom: 10 }}>
              Cette action va publier le document normalisé 2026 sur GitHub, vers DEUX repos :
              lim-editor (fichier séparé de l'ancien normalisé — les deux cohabitent pour
              l'instant ; ancien contenu archivé automatiquement avant écrasement) et LIM2
              (fichier embarqué, déclenchera un déploiement de l'application LIM).
            </div>
            <div style={{ fontSize: 13.5, color: "#374151", lineHeight: 1.5, marginBottom: 18 }}>
              Si la publication LIM2 échoue, celle de l'éditeur reste acquise — le message de
              résultat précisera les deux statuts séparément.
            </div>
            {directionInconsistencies.length > 0 ? (
              <div
                style={{
                  fontSize: 13,
                  color: "#92400e",
                  background: "#fffbeb",
                  border: "1px solid #fde68a",
                  borderRadius: 8,
                  padding: "10px 12px",
                  marginBottom: 14,
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: 6 }}>
                  ⛔ Publication bloquée — incohérence(s) détectée(s) sur le sens de circulation :
                </div>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {directionInconsistencies.map((msg) => (
                    <li key={msg}>{msg}</li>
                  ))}
                </ul>
                <div style={{ marginTop: 6 }}>
                  Corrige le champ « Sens de circulation » ou « Origine »/« Destination » du train
                  concerné avant de publier — donnée utilisée pour la localisation GPS, pas
                  seulement l'affichage.
                </div>
              </div>
            ) : null}
            {publishError ? (
              <div
                style={{
                  fontSize: 13,
                  color: "#b91c1c",
                  background: "#fef2f2",
                  border: "1px solid #fecaca",
                  borderRadius: 8,
                  padding: "8px 10px",
                  marginBottom: 14,
                }}
              >
                ❌ {publishError}
              </div>
            ) : null}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                type="button"
                onClick={handleCancelPublish}
                disabled={isPublishing}
                style={{
                  padding: "9px 16px",
                  borderRadius: 10,
                  border: "1px solid #d1d5db",
                  background: "#ffffff",
                  color: "#374151",
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: isPublishing ? "default" : "pointer",
                }}
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleConfirmPublish}
                disabled={isPublishing || directionInconsistencies.length > 0}
                style={{ ...validerBtn(isPublishing || directionInconsistencies.length > 0), minWidth: 140 }}
              >
                {isPublishing ? "Publication…" : "Confirmer"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

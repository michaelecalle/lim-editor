// src/lib/importer/diffTrains.ts
//
// JALON 7 — moteur de diff des TRAINS : compare les trains candidats (classeurs) aux
// trains courants (Normalisé 2026), horaires point par point.
//
// - Les horaires candidats sont portés par des points aux PK DOCUMENT → chaque point
//   est résolu vers son point CANONIQUE (même appariement que le diff ligne) puis
//   comparé via la clé d'identité `pkAdif|pkLfp|pkRac|pkRfn` du normalisé 2026.
// - Train candidat absent du courant → « train-ajoute » ; train courant absent du
//   candidat (ex. saisonnier) → « train-disparu » : l'application pose une
//   `validityEndDate` sur la variante (pas de suppression — conception validée).
// - Origine/destination comparées en NORMALISÉ (la canonisation des noms appartient
//   au diff LIGNE).
// - Chaque divergence porte son action d'application (`apply`).

import type { CandidateTrain } from "./buildCandidateTrains";
import { buildPointMatcher, identityKey } from "./diffLigne";
import type { LignePoint } from "../../components/tabs/Normalise2026Tab";

export type CurrentTrain = {
  numero: string;
  direction: "sudNord" | "nordSud";
  origine: string;
  destination: string;
  validityStartDate: string;
  horaires: Record<string, { arrivee: string; passage: string; depart: string }>;
};

export type TrainDiffCategorie =
  | "train-ajoute"
  | "train-disparu"
  | "horaire"
  | "origine"
  | "destination"
  | "date-vigueur";

export type TrainApplyAction =
  | { kind: "set-horaire"; train: string; pointKey: string; champ: "arrivee" | "passage" | "depart"; value: string }
  | { kind: "clear-horaire"; train: string; pointKey: string }
  | { kind: "set-train-field"; train: string; field: "origine" | "destination" | "validityStartDate"; value: string }
  | { kind: "add-train"; train: string } // le CandidateTrain complet est retrouvé par numéro côté application
  | { kind: "end-train"; train: string; date: string };

export type TrainDiff = {
  id: string; // stable : train|<numéro>|<clé point ou champ>|<valeur candidate>
  train: string;
  categorie: TrainDiffCategorie;
  cible: string;
  courant: string;
  candidat: string;
  confiance: "haute" | "basse";
  apply: TrainApplyAction;
};

function normName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export function diffTrains(
  currentTrains: CurrentTrain[],
  candidates: CandidateTrain[],
  currentLigne: { sudNord: LignePoint[]; nordSud: LignePoint[] },
  // Date de fin proposée pour un train disparu = date de vigueur du document importé.
  importDateVigueur: string = ""
): TrainDiff[] {
  const diffs: TrainDiff[] = [];
  const push = (
    train: string,
    key: string,
    categorie: TrainDiffCategorie,
    cible: string,
    courant: string,
    candidat: string,
    apply: TrainApplyAction,
    confiance: "haute" | "basse" = "haute"
  ) => {
    diffs.push({
      id: `train|${train}|${key}|${candidat}`,
      train,
      categorie,
      cible,
      courant,
      candidat,
      confiance,
      apply,
    });
  };

  const matchers = {
    sudNord: buildPointMatcher(currentLigne.sudNord),
    nordSud: buildPointMatcher(currentLigne.nordSud),
  };
  const currentByNum = new Map(currentTrains.map((t) => [t.numero, t]));
  const candByNum = new Map(candidates.map((c) => [c.numero, c]));

  for (const cand of candidates) {
    const cur = currentByNum.get(cand.numero);
    if (!cur) {
      push(
        cand.numero,
        "train",
        "train-ajoute",
        `train ${cand.numero} (${cand.origine} → ${cand.destination})`,
        "",
        cand.numero,
        { kind: "add-train", train: cand.numero }
      );
      continue;
    }

    if (normName(cand.origine) !== normName(cur.origine)) {
      push(cand.numero, "origine", "origine", `train ${cand.numero}`, cur.origine, cand.origine, {
        kind: "set-train-field",
        train: cand.numero,
        field: "origine",
        value: cand.origine,
      });
    }
    if (normName(cand.destination) !== normName(cur.destination)) {
      push(cand.numero, "destination", "destination", `train ${cand.numero}`, cur.destination, cand.destination, {
        kind: "set-train-field",
        train: cand.numero,
        field: "destination",
        value: cand.destination,
      });
    }
    if (cand.dateVigueur && cand.dateVigueur !== cur.validityStartDate) {
      push(cand.numero, "date-vigueur", "date-vigueur", `train ${cand.numero}`, cur.validityStartDate, cand.dateVigueur, {
        kind: "set-train-field",
        train: cand.numero,
        field: "validityStartDate",
        value: cand.dateVigueur,
      });
    }

    // Horaires : résolution de chaque point candidat vers la clé canonique.
    const matcher = matchers[cand.direction];
    const seen = new Set<string>();
    for (const p of cand.points) {
      if (!p.arr && !p.pass && !p.dep) continue;
      const canon = matcher(p);
      const key = canon ? identityKey(canon) : identityKey(p);
      const label = canon?.etablissement || p.etablissement || `PK ${p.pkAdif || p.pkLfp || p.pkRac || p.pkRfn}`;
      seen.add(key);
      const cu = cur.horaires[key] ?? { arrivee: "", passage: "", depart: "" };
      const pairs: Array<["arrivee" | "passage" | "depart", string, string, string]> = [
        ["arrivee", "arr", cu.arrivee, p.arr],
        ["passage", "pass", cu.passage, p.pass],
        ["depart", "dép", cu.depart, p.dep],
      ];
      for (const [champ, champLabel, a, b] of pairs) {
        if (a !== b) {
          push(
            cand.numero,
            `${key}|${champ}`,
            "horaire",
            `${cand.numero} ${label} (${champLabel})`,
            a,
            b,
            { kind: "set-horaire", train: cand.numero, pointKey: key, champ, value: b },
            p.vmaxConfidence === "basse" ? "basse" : "haute"
          );
        }
      }
    }
    // Heures présentes côté courant mais absentes du document.
    for (const [key, h] of Object.entries(cur.horaires)) {
      if (seen.has(key)) continue;
      if (!h.arrivee && !h.passage && !h.depart) continue;
      const summary = [h.arrivee && `arr ${h.arrivee}`, h.passage && `pass ${h.passage}`, h.depart && `dép ${h.depart}`]
        .filter(Boolean)
        .join(", ");
      push(cand.numero, `${key}|absent`, "horaire", `${cand.numero} point ${key}`, summary, "", {
        kind: "clear-horaire",
        train: cand.numero,
        pointKey: key,
      });
    }
  }

  for (const cur of currentTrains) {
    if (!candByNum.has(cur.numero)) {
      push(
        cur.numero,
        "train",
        "train-disparu",
        `train ${cur.numero} (${cur.origine} → ${cur.destination})`,
        cur.numero,
        "",
        { kind: "end-train", train: cur.numero, date: importDateVigueur }
      );
    }
  }

  return diffs;
}

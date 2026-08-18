// src/lib/importer/applyDiffs.ts
//
// Application des divergences ACCEPTÉES sur l'état du Normalisé 2026 — fonctions
// PURES (retournent de nouvelles structures), testables hors navigateur.
//
// Résolution des points par clé d'identité construite AVANT application : accepter un
// changement de PK modifie la clé du point, mais les actions suivantes du même lot
// (calculées sur l'état d'origine) doivent encore le retrouver — d'où l'index
// clé→objet bâti une fois sur les clones.

import type { LigneApplyAction } from "./diffLigne";
import type { TrainApplyAction } from "./diffTrains";
import { identityKey } from "./diffLigne";
import type { LignePoint } from "../../components/tabs/Normalise2026Tab";

export function applyLigneActions(points: LignePoint[], actions: LigneApplyAction[]): LignePoint[] {
  const rows: LignePoint[] = points.map((p) => ({ ...p }));
  const byKey = new Map<string, LignePoint>();
  for (const r of rows) {
    if (r.type !== "note") byKey.set(identityKey(r), r);
  }
  const noteAt = (index: number): LignePoint | undefined =>
    rows.filter((r) => r.type === "note")[index];

  for (const a of actions) {
    switch (a.kind) {
      case "set-point-field": {
        const p = byKey.get(a.pointKey);
        if (p) p[a.field] = a.value;
        break;
      }
      case "set-point-csv": {
        const p = byKey.get(a.pointKey);
        if (p) {
          if (a.value) p.csv = true;
          else delete p.csv;
        }
        break;
      }
      case "add-point": {
        const point: LignePoint = { ...a.point, csv: a.point.csv ? true : undefined } as LignePoint;
        if (!point.csv) delete point.csv;
        const afterIdx = a.afterPointKey
          ? rows.findIndex((r) => r.type !== "note" && identityKey(r) === a.afterPointKey)
          : -1;
        rows.splice(afterIdx + 1, 0, point);
        byKey.set(identityKey(point), point);
        break;
      }
      case "remove-point": {
        const idx = rows.findIndex((r) => r.type !== "note" && identityKey(r) === a.pointKey);
        if (idx !== -1) rows.splice(idx, 1);
        break;
      }
      case "set-note-field": {
        const note = noteAt(a.noteIndex);
        if (note) note[a.field === "texte" ? "texte" : "position"] = a.value as never;
        break;
      }
      case "set-note-surligne": {
        const note = noteAt(a.noteIndex);
        if (note) {
          if (a.value) note.surligne = true;
          else delete note.surligne;
        }
        break;
      }
      case "add-note": {
        const note: LignePoint = {
          type: "note",
          texte: a.note.texte,
          position: a.note.position,
          ...(a.note.surligne ? { surligne: true } : {}),
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
        // Position kilométrique : ancrée sur le point voisin (`anchorPointKey`, avant
        // ou après selon `anchorBefore`) quand résolue par le diff ; repli sur
        // l'ancienne heuristique (après la note précédente, sinon en fin) sinon —
        // ex. note sans aucun point nommé à proximité, cas rare.
        const anchorPoint = a.anchorPointKey ? byKey.get(a.anchorPointKey) : undefined;
        let at: number;
        if (anchorPoint) {
          at = rows.indexOf(anchorPoint) + (a.anchorBefore ? 0 : 1);
        } else {
          const notesSoFar = rows.filter((r) => r.type === "note");
          const prevNote = notesSoFar[a.noteIndex - 1];
          at = prevNote ? rows.indexOf(prevNote) + 1 : rows.length;
        }
        rows.splice(at, 0, note);
        break;
      }
      case "remove-note": {
        const note = noteAt(a.noteIndex);
        if (note) rows.splice(rows.indexOf(note), 1);
        break;
      }
    }
  }
  return rows;
}

// Forme structurelle minimale d'un train côté application (compatible TrainDraft).
export type ApplicableTrain = {
  origine: string;
  destination: string;
  validityStartDate: string;
  validityEndDate: string;
  horaires: Record<string, { arrivee: string; passage: string; depart: string }>;
};

export function applyTrainActions<T extends ApplicableTrain>(
  trains: Record<string, T>,
  actions: TrainApplyAction[],
  // Création d'un train candidat accepté (« train-ajoute ») — fournie par l'appelant
  // (le composant sait fabriquer un TrainDraft complet avec ses défauts).
  createTrain: (numero: string) => T | null
): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [k, t] of Object.entries(trains)) {
    out[k] = { ...t, horaires: Object.fromEntries(Object.entries(t.horaires).map(([hk, h]) => [hk, { ...h }])) };
  }

  for (const a of actions) {
    switch (a.kind) {
      case "set-horaire": {
        const t = out[a.train];
        if (!t) break;
        const h = t.horaires[a.pointKey] ?? { arrivee: "", passage: "", depart: "" };
        t.horaires[a.pointKey] = { ...h, [a.champ]: a.value };
        break;
      }
      case "clear-horaire": {
        const t = out[a.train];
        if (t) delete t.horaires[a.pointKey];
        break;
      }
      case "set-train-field": {
        const t = out[a.train];
        if (t) t[a.field] = a.value;
        break;
      }
      case "add-train": {
        if (!out[a.train]) {
          const created = createTrain(a.train);
          if (created) out[a.train] = created;
        }
        break;
      }
      case "end-train": {
        const t = out[a.train];
        if (t) t.validityEndDate = a.date;
        break;
      }
    }
  }
  return out;
}

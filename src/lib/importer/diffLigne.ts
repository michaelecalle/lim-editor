// src/lib/importer/diffLigne.ts
//
// JALON 6 — moteur de diff des DONNÉES LIGNE : compare la séquence CANDIDATE (issue du
// parseur de classeur Excel) au socle COURANT (Normalisé 2026), pour un sens donné.
//
// Principes (conception validée avec l'utilisateur, cf. mémoire) :
//   - Le diff porte LA vérité de confrontation : le parseur restitue le document tel
//     quel (PK erronés compris) ; c'est ICI que les divergences apparaissent, chacune
//     étant ensuite acceptée/refusée dans la modale (refus MÉMORISÉS via `id` stable).
//   - APPARIEMENT des points : d'abord par PK exact (même champ réseau), sinon par nom
//     normalisé (casse/accents/ponctuation ignorées), sinon par préfixe strict unique.
//     Ainsi un point au PK document erroné (Figueres 748.9) s'apparie par son nom et
//     produit une divergence de PK refusable ; un point renommé s'apparie par son PK
//     et produit une divergence de nom. Non apparié → proposition d'ajout (candidat
//     seul) ou de suppression (courant seul).
//   - Chaque divergence porte une CONFIANCE : « basse » quand la valeur candidate
//     vient d'une extraction structurellement ambiguë (flag posé par le parseur).
//   - Chaque divergence porte aussi son ACTION D'APPLICATION (`apply`) : la charge
//     utile machine qui permet d'appliquer l'acceptation sans ré-interpréter les
//     libellés d'affichage.
//
// Les NOTES sont comparées séquentiellement (texte/ancrage/surlignage).

import type { ImportedLigneRow, ImportedLignePoint, ImportedNote } from "./parseLigneModele";
import type { LignePoint } from "../../components/tabs/Normalise2026Tab";

export type LigneDiffCategorie =
  | "bloc"
  | "vmax"
  | "csv"
  | "radio"
  | "rampe"
  | "etcs"
  | "etablissement"
  | "pk"
  | "point-ajoute"
  | "point-supprime"
  | "note";

export type NewLignePoint = {
  bloc: string;
  vmax: string;
  csv: boolean;
  radio: string;
  rampe: string;
  etcs: string;
  etablissement: string;
  pkAdif: string;
  pkLfp: string;
  pkRac: string;
  pkRfn: string;
};

export type LigneApplyAction =
  | { kind: "set-point-field"; pointKey: string; field: "bloc" | "vmax" | "radio" | "rampe" | "etcs" | "etablissement" | "pkAdif" | "pkLfp" | "pkRac" | "pkRfn"; value: string }
  | { kind: "set-point-csv"; pointKey: string; value: boolean }
  | { kind: "add-point"; afterPointKey: string | null; point: NewLignePoint }
  | { kind: "remove-point"; pointKey: string }
  | { kind: "set-note-field"; noteIndex: number; field: "texte" | "position"; value: string }
  | { kind: "set-note-surligne"; noteIndex: number; value: boolean }
  | { kind: "add-note"; noteIndex: number; note: { texte: string; position: "au-dessus" | "en-dessous"; surligne: boolean } }
  | { kind: "remove-note"; noteIndex: number };

export type LigneDiff = {
  // Identifiant STABLE de la divergence (clé des refus mémorisés) :
  // direction | identité du point (nom normalisé ou PK) | champ | valeur candidate.
  id: string;
  direction: "sudNord" | "nordSud";
  categorie: LigneDiffCategorie;
  cible: string; // libellé humain du point/de la note concerné(e)
  courant: string;
  candidat: string;
  confiance: "haute" | "basse";
  apply: LigneApplyAction;
};

// Nom normalisé pour l'appariement : casse, accents, ponctuation et espaces ignorés.
function normName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

const PK_FIELDS = ["pkAdif", "pkLfp", "pkRac", "pkRfn"] as const;

// Clé d'identité d'un point du socle — la même que dans le composant Normalisé 2026
// (`lignePointIdentityKey`).
export function identityKey(p: { pkAdif: string; pkLfp: string; pkRac: string; pkRfn: string }): string {
  return `${p.pkAdif}|${p.pkLfp}|${p.pkRac}|${p.pkRfn}`;
}

function pointLabel(p: { etablissement: string; pkAdif: string; pkLfp: string; pkRac: string; pkRfn: string }): string {
  const pk = PK_FIELDS.map((f) => p[f]).find((v) => v !== "") ?? "?";
  return p.etablissement ? `${p.etablissement} (${pk})` : `PK ${pk}`;
}

// Identité stable d'un point pour l'id de divergence : nom normalisé s'il existe
// (survit aux corrections de PK), sinon la chaîne de ses PK.
function pointIdentity(p: { etablissement: string; pkAdif: string; pkLfp: string; pkRac: string; pkRfn: string }): string {
  const name = normName(p.etablissement);
  return name !== "" ? name : PK_FIELDS.map((f) => p[f]).join("|");
}

// Appariement candidat → point canonique : PK exact (même champ, comparaison
// numérique), sinon nom normalisé, sinon préfixe strict unique (≥ 6 caractères).
// Réutilisé par le diff TRAINS pour résoudre les horaires.
export function buildPointMatcher(currentPoints: LignePoint[]) {
  const byPk = new Map<string, LignePoint>();
  const byName = new Map<string, LignePoint>();
  for (const c of currentPoints) {
    if (c.type === "note") continue;
    for (const f of PK_FIELDS) {
      if (c[f] !== "") byPk.set(`${f}:${Number(c[f])}`, c);
    }
    const n = normName(c.etablissement);
    if (n) byName.set(n, c);
  }
  return (cand: { etablissement: string; pkAdif: string; pkLfp: string; pkRac: string; pkRfn: string }): LignePoint | undefined => {
    for (const f of PK_FIELDS) {
      if (cand[f] !== "") {
        const m = byPk.get(`${f}:${Number(cand[f])}`);
        if (m) return m;
      }
    }
    const n = normName(cand.etablissement);
    if (!n) return undefined;
    const direct = byName.get(n);
    if (direct) return direct;
    if (n.length >= 6) {
      const candidates = [...byName.entries()].filter(
        ([key]) => n.startsWith(key) || key.startsWith(n)
      );
      if (candidates.length === 1) return candidates[0][1];
    }
    return undefined;
  };
}

function toNewPoint(cand: ImportedLignePoint): NewLignePoint {
  return {
    bloc: cand.bloc,
    vmax: cand.vmax,
    csv: cand.csv,
    radio: cand.radio,
    rampe: cand.rampe,
    etcs: cand.etcs,
    etablissement: cand.etablissement,
    pkAdif: cand.pkAdif,
    pkLfp: cand.pkLfp,
    pkRac: cand.pkRac,
    pkRfn: cand.pkRfn,
  };
}

export function diffLignePoints(
  current: LignePoint[],
  candidateRows: ImportedLigneRow[],
  direction: "sudNord" | "nordSud"
): LigneDiff[] {
  const diffs: LigneDiff[] = [];
  const push = (
    identity: string,
    categorie: LigneDiffCategorie,
    cible: string,
    courant: string,
    candidat: string,
    apply: LigneApplyAction,
    confiance: "haute" | "basse" = "haute"
  ) => {
    diffs.push({
      id: `${direction}|${identity}|${categorie}|${candidat}`,
      direction,
      categorie,
      cible,
      courant,
      candidat,
      confiance,
      apply,
    });
  };

  const currentPoints = current.filter((p) => p.type !== "note");
  const currentNotes = current.filter((p) => p.type === "note");
  const candPoints = candidateRows.filter((r): r is ImportedLignePoint => !("type" in r));
  const candNotes = candidateRows.filter((r): r is ImportedNote => "type" in r);

  const matcher = buildPointMatcher(currentPoints);
  const consumed = new Set<LignePoint>();
  let lastMatchedKey: string | null = null;

  for (const cand of candPoints) {
    const match = matcher(cand);
    if (!match || consumed.has(match)) {
      push(
        pointIdentity(cand),
        "point-ajoute",
        pointLabel(cand),
        "",
        pointLabel(cand),
        { kind: "add-point", afterPointKey: lastMatchedKey, point: toNewPoint(cand) },
        cand.vmaxConfidence
      );
      continue;
    }
    consumed.add(match);
    const key = identityKey(match);
    lastMatchedKey = key;
    const identity = pointIdentity(match);
    const label = pointLabel(match);

    if (cand.etablissement !== match.etablissement) {
      push(identity, "etablissement", label, match.etablissement, cand.etablissement, {
        kind: "set-point-field",
        pointKey: key,
        field: "etablissement",
        value: cand.etablissement,
      });
    }
    for (const f of PK_FIELDS) {
      // Comparaison NUMÉRIQUE ("0" vs "0.0"), champ par champ.
      const a = match[f] === "" ? "" : String(Number(match[f]));
      const b = cand[f] === "" ? "" : String(Number(cand[f]));
      if (a !== b) {
        push(identity, "pk", label, match[f], cand[f], {
          kind: "set-point-field",
          pointKey: key,
          field: f,
          value: cand[f],
        });
      }
    }
    const zoneFields = [
      ["bloc", match.bloc, cand.bloc, "haute"],
      ["vmax", match.vmax, cand.vmax, cand.vmaxConfidence],
      ["radio", match.radio, cand.radio, "haute"],
      ["rampe", match.rampe, cand.rampe, cand.rampeConfidence],
      ["etcs", match.etcs, cand.etcs, "haute"],
    ] as const;
    for (const [f, a, b, conf] of zoneFields) {
      if (a !== b) {
        push(identity, f, label, a, b, { kind: "set-point-field", pointKey: key, field: f, value: b }, conf);
      }
    }
    if (cand.csv !== (match.csv === true)) {
      push(
        identity,
        "csv",
        label,
        match.csv ? "CSV" : "",
        cand.csv ? "CSV" : "",
        { kind: "set-point-csv", pointKey: key, value: cand.csv },
        cand.vmaxConfidence
      );
    }
  }
  for (const c of currentPoints) {
    if (!consumed.has(c)) {
      push(pointIdentity(c), "point-supprime", pointLabel(c), pointLabel(c), "", {
        kind: "remove-point",
        pointKey: identityKey(c),
      });
    }
  }

  // ---- Notes : appariement séquentiel --------------------------------------------
  const n = Math.max(currentNotes.length, candNotes.length);
  for (let i = 0; i < n; i++) {
    const cur = currentNotes[i];
    const cand = candNotes[i];
    if (cur && !cand) {
      push(`note${i}`, "note", `note « ${(cur.texte ?? "").slice(0, 30)}… »`, cur.texte ?? "", "", {
        kind: "remove-note",
        noteIndex: i,
      });
      continue;
    }
    if (!cur && cand) {
      push(`note${i}`, "note", `note « ${cand.texte.slice(0, 30)}… »`, "", cand.texte, {
        kind: "add-note",
        noteIndex: i,
        note: { texte: cand.texte, position: cand.position, surligne: cand.surligne },
      });
      continue;
    }
    if (!cur || !cand) continue;
    const cible = `note « ${cand.texte.slice(0, 30)}… »`;
    if ((cur.texte ?? "") !== cand.texte) {
      push(`note${i}|texte`, "note", cible, cur.texte ?? "", cand.texte, {
        kind: "set-note-field",
        noteIndex: i,
        field: "texte",
        value: cand.texte,
      });
    }
    if ((cur.position ?? "au-dessus") !== cand.position) {
      push(`note${i}|position`, "note", cible, cur.position ?? "", cand.position, {
        kind: "set-note-field",
        noteIndex: i,
        field: "position",
        value: cand.position,
      });
    }
    if ((cur.surligne === true) !== cand.surligne) {
      push(`note${i}|surligne`, "note", cible, cur.surligne ? "surligné" : "", cand.surligne ? "surligné" : "", {
        kind: "set-note-surligne",
        noteIndex: i,
        value: cand.surligne,
      });
    }
  }

  return diffs;
}

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
  | {
      kind: "add-note";
      noteIndex: number;
      // Ancrage préféré (clé de point stable) ; `noteIndex` reste un repli pour les
      // notes sans ancrage résolu (ex. tout début/fin de ligne sans point nommé).
      anchorPointKey: string | null;
      anchorBefore: boolean;
      note: { texte: string; position: "au-dessus" | "en-dessous"; surligne: boolean };
    }
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

// Ancrage d'une note = identité du point ÉTABLI (nommé) le plus proche dans la
// séquence kilométrique — PAS sa position brute dans le tableau (bug 18/08 : une
// note insérée n'importe où dans le document décalait l'index de TOUTES les notes
// suivantes, les faisant comparer à la mauvaise voisine). Deux raffinements
// nécessaires (1re version encore fragile, cf. bruit inattendu sur le banc de test
// existant) :
//   - Respecter le SENS d'ancrage de la note (`position`, cf. parseLigneModele.ts) :
//     « en-dessous » = collée à la ligne PRÉCÉDENTE → chercher en arrière d'abord ;
//     « au-dessus » = collée à la ligne SUIVANTE → chercher en avant d'abord.
//   - PRÉFÉRER un point NOMMÉ (établissement non vide) à un point KM-seul : entre
//     une note et son établissement réel peuvent s'intercaler plusieurs points sans
//     nom, dont le PK exact varie facilement d'un import à l'autre (arrondi,
//     étiquette flottante...) — un ancrage par PK-seul sur CE genre de point est
//     fragile. On ne retombe sur un point KM-seul que si aucun nom n'existe dans
//     aucune direction (rare : notes en tout début/fin de ligne).
// Fonctionne indifféremment sur `LignePoint[]` (socle courant, notes signalées par
// `type === "note"`) et `ImportedLigneRow[]` (candidat importé, notes signalées par
// la présence de `type`) : les deux exposent les mêmes champs.
type RowLike = {
  type?: string;
  etablissement?: string;
  pkAdif?: string;
  pkLfp?: string;
  pkRac?: string;
  pkRfn?: string;
  position?: string;
};

function isNoteRow(r: RowLike): boolean {
  return r.type === "note";
}

function scanForPoint(rows: readonly RowLike[], start: number, step: 1 | -1): { named: string | null; any: string | null } {
  let named: string | null = null;
  let any: string | null = null;
  for (let j = start; j >= 0 && j < rows.length; j += step) {
    const r = rows[j];
    if (isNoteRow(r)) continue;
    const id = pointIdentity(r as Required<Pick<RowLike, "etablissement" | "pkAdif" | "pkLfp" | "pkRac" | "pkRfn">>);
    if (any === null) any = id;
    if ((r.etablissement ?? "") !== "") {
      named = id;
      break;
    }
  }
  return { named, any };
}

function nearestPointIdentity(rows: readonly RowLike[], noteIdx: number): string {
  const forward = scanForPoint(rows, noteIdx + 1, 1);
  const backward = scanForPoint(rows, noteIdx - 1, -1);
  const enDessous = rows[noteIdx]?.position === "en-dessous";
  const primary = enDessous ? backward : forward;
  const secondary = enDessous ? forward : backward;
  return primary.named ?? secondary.named ?? primary.any ?? secondary.any ?? "";
}

type AnchoredNote<T> = { note: T; anchor: string; flatIndex: number; rowIndex: number };

// `flatIndex` = position parmi les notes seules (ce que `noteIndex` désigne côté
// application des actions, cf. `applyDiffs.ts::noteAt`) ; `rowIndex` = position dans
// la séquence complète (points + notes), utile pour situer une insertion.
function anchorNotes<T extends RowLike>(rows: readonly T[]): AnchoredNote<T>[] {
  const out: AnchoredNote<T>[] = [];
  let flatIndex = 0;
  rows.forEach((r, i) => {
    if (isNoteRow(r)) {
      out.push({ note: r, anchor: nearestPointIdentity(rows, i), flatIndex, rowIndex: i });
      flatIndex++;
    }
  });
  return out;
}

function groupByAnchor<T>(items: AnchoredNote<T>[]): Map<string, AnchoredNote<T>[]> {
  const map = new Map<string, AnchoredNote<T>[]>();
  for (const it of items) {
    const arr = map.get(it.anchor) ?? [];
    arr.push(it);
    map.set(it.anchor, arr);
  }
  return map;
}

// Point d'insertion pour une note candidate sans équivalent courant : clé stable
// (`identityKey`, la même que `set-point-field`) du point-ancre dans le socle
// courant, + le côté où l'insérer (avant si « au-dessus » = collée à la ligne
// suivante, après si « en-dessous »). Remplace un 1er jet qui ne renvoyait qu'un
// simple COMPTE de notes précédentes (même sémantique que l'ancien `noteIndex`
// séquentiel) : cassait dès qu'aucune note ne précédait déjà l'ancrage (compte 0
// = « pas d'ancre » pour `applyDiffs.ts`, donc note ajoutée en FIN de ligne au lieu
// de son vrai point d'ancrage — révélé par `_test_apply.ts`, la note ajoutée puis
// re-diffée ne matchait plus rien).
function insertionAnchor(
  current: readonly LignePoint[],
  anchor: string,
  position: "au-dessus" | "en-dessous" | undefined
): { key: string; before: boolean } | null {
  if (anchor === "") return null;
  const point = current.find((r) => !isNoteRow(r) && pointIdentity(r as ImportedLignePoint) === anchor);
  if (!point) return null;
  return { key: identityKey(point as ImportedLignePoint), before: position === "au-dessus" };
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
  const candPoints = candidateRows.filter((r): r is ImportedLignePoint => !("type" in r));

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

  // ---- Notes : appariement par ANCRAGE (point voisin), pas par position brute ---
  // (cf. `anchorNotes`/`nearestPointIdentity` ci-dessus — remplace l'ancien
  // appariement séquentiel `currentNotes[i]` vs `candNotes[i]`, cassé dès qu'une
  // note était ajoutée/déplacée n'importe où dans le document).
  const currentAnchored = anchorNotes(current);
  const candAnchored = anchorNotes(candidateRows);
  const currentByAnchor = groupByAnchor(currentAnchored);
  const candByAnchor = groupByAnchor(candAnchored);
  const allAnchors = new Set([...currentByAnchor.keys(), ...candByAnchor.keys()]);

  for (const anchor of allAnchors) {
    const curList = currentByAnchor.get(anchor) ?? [];
    const candList = candByAnchor.get(anchor) ?? [];
    const n = Math.max(curList.length, candList.length);
    for (let i = 0; i < n; i++) {
      const curEntry = curList[i];
      const candEntry = candList[i];
      const cur = curEntry?.note;
      // `anchorNotes` ne pousse que des lignes "note" dans les entrées candidates :
      // le champ n'est pas typé en union côté générique, mais le cast est sûr.
      const cand = candEntry?.note as ImportedNote | undefined;
      const noteId = `note@${anchor || "sansAncrage"}#${i}`;

      if (cur && !cand) {
        push(noteId, "note", `note « ${(cur.texte ?? "").slice(0, 30)}… »`, cur.texte ?? "", "", {
          kind: "remove-note",
          noteIndex: curEntry.flatIndex,
        });
        continue;
      }
      if (!cur && cand) {
        const anchorInfo = insertionAnchor(current, anchor, cand.position);
        push(noteId, "note", `note « ${cand.texte.slice(0, 30)}… »`, "", cand.texte, {
          kind: "add-note",
          noteIndex: currentAnchored.length,
          anchorPointKey: anchorInfo?.key ?? null,
          anchorBefore: anchorInfo?.before ?? false,
          note: { texte: cand.texte, position: cand.position, surligne: cand.surligne },
        });
        continue;
      }
      if (!cur || !cand) continue;
      const cible = `note « ${cand.texte.slice(0, 30)}… »`;
      if ((cur.texte ?? "") !== cand.texte) {
        push(`${noteId}|texte`, "note", cible, cur.texte ?? "", cand.texte, {
          kind: "set-note-field",
          noteIndex: curEntry.flatIndex,
          field: "texte",
          value: cand.texte,
        });
      }
      if ((cur.position ?? "au-dessus") !== cand.position) {
        push(`${noteId}|position`, "note", cible, cur.position ?? "", cand.position, {
          kind: "set-note-field",
          noteIndex: curEntry.flatIndex,
          field: "position",
          value: cand.position,
        });
      }
      if ((cur.surligne === true) !== cand.surligne) {
        push(`${noteId}|surligne`, "note", cible, cur.surligne ? "surligné" : "", cand.surligne ? "surligné" : "", {
          kind: "set-note-surligne",
          noteIndex: curEntry.flatIndex,
          value: cand.surligne,
        });
      }
    }
  }

  return diffs;
}

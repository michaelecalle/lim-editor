// src/components/ImportDiffModal.tsx
//
// Modale de revue des divergences d'import (conception validée) : vue PLIÉE par
// groupe — colonnes pour les données ligne, train par train pour les horaires —
// avec une décision PAR divergence et des boutons « tout » par groupe. Trois
// décisions possibles (demande utilisateur 08/08) :
//   - accepter : applique la valeur du document ;
//   - refuser (cette fois) : garde la valeur actuelle, sera re-proposée au
//     prochain import (utile pour un doute ponctuel) ;
//   - refuser toujours : garde la valeur actuelle ET mémorise le refus (utile
//     pour les divergences volontaires et récurrentes, ex. les PK d'ancre GPS
//     qui diffèrent délibérément du document à chaque import).
// Les refus déjà MÉMORISÉS (imports précédents) arrivent pré-repliés dans leur
// propre section, pré-cochés « toujours », et restent modifiables. Rien n'est
// appliqué avant le bouton « Appliquer ».
import { useMemo, useState } from "react";
import type { LigneDiff } from "../lib/importer/diffLigne";
import type { TrainDiff } from "../lib/importer/diffTrains";

export type Decision = "accepte" | "refuse" | "toujours";

type AnyDiff = (LigneDiff | TrainDiff) & { groupe: string };

const DIR_LABEL: Record<string, string> = {
  sudNord: "Ligne sud → nord",
  nordSud: "Ligne nord → sud",
};

// Phrase en clair par catégorie — remplace le générique « courant » → « candidat »,
// illisible hors contexte (demande utilisateur, 08/08).
function describe(d: AnyDiff): string {
  const { categorie, courant, candidat } = d;
  const c = courant || "—";
  const n = candidat || "—";
  switch (categorie) {
    case "csv":
      return candidat === "CSV"
        ? "Le document indique un CSV à cet endroit, absent du normalisé actuel."
        : "Le normalisé indique un CSV à cet endroit, absent du document importé.";
    case "vmax":
      return `Vitesse limite — normalisé : ${c} km/h · document : ${n} km/h.`;
    case "pk":
      return `PK — normalisé : ${c} · document : ${n}.`;
    case "etablissement":
      return `Nom — normalisé : « ${c} » · document : « ${n} ».`;
    case "bloc":
      return `Bloc — normalisé : ${c} · document : ${n}.`;
    case "radio":
      return `Radio — normalisé : ${c} · document : ${n}.`;
    case "rampe":
      return `Rampe — normalisé : ${c} · document : ${n}.`;
    case "etcs":
      return `ETCS — normalisé : ${c} · document : ${n}.`;
    case "point-ajoute":
      return "Le document contient un point supplémentaire, absent du normalisé actuel.";
    case "point-supprime":
      return "Le normalisé contient un point absent du document importé.";
    case "note":
      if (courant === "" && candidat !== "") return "Le document contient une note absente du normalisé.";
      if (candidat === "" && courant !== "") return "Le normalisé contient une note absente du document.";
      return `Note — normalisé : « ${c} » · document : « ${n} ».`;
    case "train-ajoute":
      return "Le document contient ce train, absent du normalisé actuel.";
    case "train-disparu":
      return "Le normalisé contient ce train, absent du document (saisonnier ?).";
    case "horaire":
      return `Horaire — normalisé : ${c} · document : ${n}.`;
    case "origine":
      return `Origine — normalisé : ${c} · document : ${n}.`;
    case "destination":
      return `Destination — normalisé : ${c} · document : ${n}.`;
    case "date-vigueur":
      return `Date de vigueur — normalisé : ${c} · document : ${n}.`;
    default:
      return `Normalisé : « ${c} » · document : « ${n} ».`;
  }
}

export default function ImportDiffModal({
  ligneDiffs,
  trainDiffs,
  refusMemorises,
  onApply,
  onClose,
}: {
  ligneDiffs: LigneDiff[];
  trainDiffs: TrainDiff[];
  refusMemorises: Set<string>;
  onApply: (decisions: Record<string, Decision>) => void;
  onClose: () => void;
}) {
  const groupBy = (items: AnyDiff[]): Map<string, AnyDiff[]> => {
    const groups = new Map<string, AnyDiff[]>();
    for (const d of items) {
      const list = groups.get(d.groupe) ?? [];
      list.push(d);
      groups.set(d.groupe, list);
    }
    return groups;
  };

  const { groups, memorisedGroups, memorises } = useMemo(() => {
    const all: AnyDiff[] = [
      ...ligneDiffs.map((d) => ({ ...d, groupe: `${DIR_LABEL[d.direction]} — ${d.categorie}` })),
      ...trainDiffs.map((d) => ({ ...d, groupe: `Train ${d.train} — ${d.categorie}` })),
    ];
    const memorises = all.filter((d) => refusMemorises.has(d.id));
    const rest = all.filter((d) => !refusMemorises.has(d.id));
    return { groups: groupBy(rest), memorisedGroups: groupBy(memorises), memorises };
  }, [ligneDiffs, trainDiffs, refusMemorises]);

  const [decisions, setDecisions] = useState<Record<string, Decision>>(() =>
    Object.fromEntries(memorises.map((d) => [d.id, "toujours" as Decision]))
  );

  const decide = (ids: string[], decision: Decision) =>
    setDecisions((prev) => ({ ...prev, ...Object.fromEntries(ids.map((id) => [id, decision])) }));

  const total = ligneDiffs.length + trainDiffs.length;
  const nAccepte = Object.values(decisions).filter((d) => d === "accepte").length;
  const nRefuse = Object.values(decisions).filter((d) => d === "refuse").length;
  const nToujours = Object.values(decisions).filter((d) => d === "toujours").length;
  const nAttente = total - nAccepte - nRefuse - nToujours;

  const rowStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "4px 8px",
    borderBottom: "1px solid #f3f4f6",
    fontSize: 13,
  };
  const decideBtn = (active: boolean, color: string): React.CSSProperties => ({
    padding: "2px 8px",
    borderRadius: 6,
    border: `1px solid ${active ? color : "#d1d5db"}`,
    background: active ? color : "#ffffff",
    color: active ? "#ffffff" : "#374151",
    cursor: "pointer",
    fontSize: 12,
    whiteSpace: "nowrap",
  });

  // Décision commune du groupe (pour l'état actif des boutons « Tout ... ») :
  // "accepte"/"refuse"/"toujours" si TOUS les items du groupe la partagent déjà,
  // sinon null (état mixte ou pas encore tranché).
  const groupDecision = (items: AnyDiff[]): Decision | null => {
    const ds = items.map((i) => decisions[i.id]);
    if (ds.every((d) => d === "accepte")) return "accepte";
    if (ds.every((d) => d === "refuse")) return "refuse";
    if (ds.every((d) => d === "toujours")) return "toujours";
    return null;
  };

  const renderRow = (d: AnyDiff) => (
    <div key={d.id} style={rowStyle}>
      <div style={{ flex: 2, minWidth: 0 }}>{d.cible}</div>
      <div style={{ flex: 3, minWidth: 0 }}>
        {describe(d)}
        {d.confiance === "basse" ? (
          <span
            style={{
              marginLeft: 8,
              padding: "1px 6px",
              borderRadius: 999,
              background: "#fef3c7",
              color: "#92400e",
              fontSize: 11,
            }}
          >
            à vérifier
          </span>
        ) : null}
      </div>
      <button type="button" style={decideBtn(decisions[d.id] === "accepte", "#16a34a")} onClick={() => decide([d.id], "accepte")}>
        ✓ Accepter
      </button>
      <button type="button" style={decideBtn(decisions[d.id] === "refuse", "#dc2626")} onClick={() => decide([d.id], "refuse")}>
        ✗ Refuser
      </button>
      <button type="button" style={decideBtn(decisions[d.id] === "toujours", "#6b7280")} onClick={() => decide([d.id], "toujours")}>
        🔒 Toujours refuser
      </button>
    </div>
  );

  const renderGroupButtons = (items: AnyDiff[]) => {
    const gd = groupDecision(items);
    return (
      <>
        <button
          type="button"
          style={decideBtn(gd === "accepte", "#16a34a")}
          onClick={(e) => {
            e.preventDefault();
            decide(items.map((d) => d.id), "accepte");
          }}
        >
          Tout accepter
        </button>
        <button
          type="button"
          style={decideBtn(gd === "refuse", "#dc2626")}
          onClick={(e) => {
            e.preventDefault();
            decide(items.map((d) => d.id), "refuse");
          }}
        >
          Tout refuser
        </button>
        <button
          type="button"
          style={decideBtn(gd === "toujours", "#6b7280")}
          onClick={(e) => {
            e.preventDefault();
            decide(items.map((d) => d.id), "toujours");
          }}
        >
          🔒 Toujours refuser
        </button>
      </>
    );
  };

  return (
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
          width: "min(1080px, 96vw)",
          maxHeight: "88vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 20px 50px rgba(0,0,0,0.3)",
        }}
      >
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #e5e7eb", fontWeight: 800, fontSize: 16 }}>
          Import — {total} divergence{total > 1 ? "s" : ""} à examiner
        </div>

        <div style={{ overflowY: "auto", padding: "10px 20px", flex: 1 }}>
          {total === 0 ? (
            <div style={{ padding: 20, color: "#16a34a", fontWeight: 600 }}>
              Aucune divergence : le document correspond exactement aux données actuelles.
            </div>
          ) : null}
          {[...groups.entries()].map(([groupe, items]) => (
            <details key={groupe} style={{ marginBottom: 8, border: "1px solid #e5e7eb", borderRadius: 10 }}>
              <summary
                style={{
                  cursor: "pointer",
                  padding: "8px 12px",
                  fontWeight: 700,
                  fontSize: 13,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  listStyle: "none",
                  flexWrap: "wrap",
                }}
              >
                <span style={{ flex: 1 }}>
                  {groupe} <span style={{ color: "#6b7280", fontWeight: 400 }}>({items.length})</span>
                </span>
                {renderGroupButtons(items)}
              </summary>
              <div>{items.map(renderRow)}</div>
            </details>
          ))}

          {memorises.length > 0 ? (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#6b7280", margin: "8px 4px" }}>
                Refus mémorisés — déjà tranchés lors d'imports précédents ({memorises.length})
              </div>
              {[...memorisedGroups.entries()].map(([groupe, items]) => (
                <details
                  key={`m-${groupe}`}
                  style={{ marginBottom: 8, border: "1px dashed #d1d5db", borderRadius: 10, background: "#f9fafb" }}
                >
                  <summary
                    style={{
                      cursor: "pointer",
                      padding: "8px 12px",
                      fontWeight: 700,
                      fontSize: 13,
                      color: "#6b7280",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      listStyle: "none",
                      flexWrap: "wrap",
                    }}
                  >
                    <span style={{ flex: 1 }}>
                      {groupe} <span style={{ fontWeight: 400 }}>({items.length})</span>
                    </span>
                    {renderGroupButtons(items)}
                  </summary>
                  <div>{items.map(renderRow)}</div>
                </details>
              ))}
            </div>
          ) : null}
        </div>

        <div
          style={{
            padding: "12px 20px",
            borderTop: "1px solid #e5e7eb",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div style={{ flex: 1, fontSize: 13, color: "#6b7280" }}>
            {nAccepte} acceptée{nAccepte > 1 ? "s" : ""} · {nRefuse} refusée{nRefuse > 1 ? "s" : ""} · {nToujours} toujours
            refusée{nToujours > 1 ? "s" : ""} · {nAttente} en attente
            {nAttente > 0 ? " (les divergences en attente ne seront PAS appliquées)" : ""}
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid #d1d5db", background: "#ffffff", cursor: "pointer" }}
          >
            Fermer sans appliquer
          </button>
          <button
            type="button"
            onClick={() => onApply(decisions)}
            style={{
              padding: "8px 14px",
              borderRadius: 10,
              border: "none",
              background: "#111827",
              color: "#ffffff",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Appliquer les décisions
          </button>
        </div>
      </div>
    </div>
  );
}

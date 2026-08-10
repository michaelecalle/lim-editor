// src/components/export/PdfExportPanel2026.tsx
//
// Panneau de téléchargement de l'onglet « Export LIM PDF » — remplace ENTIÈREMENT
// l'ancien panneau (`PdfExportPanel.tsx`, plus utilisé dans cet onglet, conservé
// tel quel dans le dépôt au cas où) sur demande explicite de l'utilisateur (09/08).
// Reprend la même structure de boutons (Télécharger PDF pour 1 train, Télécharger
// ZIP pour plusieurs) — ils existaient déjà, pas besoin d'en inventer de nouveaux —
// mais SANS sélecteur de date : les fiches 2026 ne sont plus datées (seulement
// versionnées), donc plus de radio Aujourd'hui/Demain ni de modale de confirmation
// « lendemain ».
// Autonome : relit directement le normalisé local (comme `Normalise2026Tab.tsx`,
// dont il réutilise les fonctions de lecture) plutôt que de dépendre de props
// injectées par `FTEditorPage.tsx` — les trains 2026 vivent dans ce stockage local,
// complètement séparé du pipeline ancien format.
import { useState } from "react";
import JSZip from "jszip";
import { pdf } from "@react-pdf/renderer";
import {
  readNormalizedLocal,
  readLigneVersionsLocal,
  cloneDefaultLigneVersion,
  DEFAULT_LIGNE_VERSION_ID,
  type TrainDraft,
} from "../tabs/Normalise2026Tab";
import { fetchLtvRows2026 } from "../../modules/pdf2026/buildLtvRows2026";
import { buildTrainPdfDocument2026 } from "../../modules/pdf2026/buildTrainPdfDocument2026";

const BTN_BASE: React.CSSProperties = {
  width: "100%",
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid #d1d5db",
  fontWeight: 700,
  fontSize: 14,
  cursor: "pointer",
};

const BTN_ACTIVE: React.CSSProperties = { ...BTN_BASE, background: "#111827", color: "#ffffff", border: "1px solid #111827" };
const BTN_DISABLED: React.CSSProperties = { ...BTN_BASE, background: "#f3f4f6", color: "#9ca3af", cursor: "not-allowed" };

function numeroAffiche(train: TrainDraft): string {
  return train.direction === "nordSud"
    ? train.numeroFrance || train.numeroEspagne
    : train.numeroEspagne || train.numeroFrance;
}

export default function PdfExportPanel2026() {
  const [trains] = useState(() => readNormalizedLocal());
  const trainNumbers = Object.keys(trains).sort();

  const [selectedTrains, setSelectedTrains] = useState<Set<string>>(new Set());
  const [isGenerating, setIsGenerating] = useState(false);
  const [pendingAction, setPendingAction] = useState<"pdf" | "zip" | null>(null);

  const allSelected = trainNumbers.length > 0 && trainNumbers.every((t) => selectedTrains.has(t));

  const toggleTrain = (num: string) => {
    setSelectedTrains((prev) => {
      const next = new Set(prev);
      if (next.has(num)) next.delete(num);
      else next.add(num);
      return next;
    });
  };

  const toggleAll = () => {
    setSelectedTrains(allSelected ? new Set() : new Set(trainNumbers));
  };

  const selectedList = trainNumbers.filter((t) => selectedTrains.has(t));
  const canDownloadPdf = selectedList.length === 1 && !isGenerating;
  const canDownloadZip = selectedList.length >= 1 && !isGenerating;

  const triggerDownload = (blob: Blob, filename: string) => {
    const downloadBlob = new Blob([blob], { type: "application/octet-stream" });
    const url = URL.createObjectURL(downloadBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const runAction = async (action: "pdf" | "zip") => {
    setPendingAction(action);
    setIsGenerating(true);
    try {
      const ligneVersions = readLigneVersionsLocal();
      const currentLigneVersion = ligneVersions[DEFAULT_LIGNE_VERSION_ID] ?? cloneDefaultLigneVersion();
      const { rows: ltvRows, publishedAt: ltvPublishedAt, errorMessage: ltvError } = await fetchLtvRows2026();
      if (ltvError) console.warn("[export 2026] LTV non chargées :", ltvError);

      if (action === "pdf") {
        const train = trains[selectedList[0]];
        const doc = buildTrainPdfDocument2026(train, currentLigneVersion, train.horaires, ltvRows, ltvPublishedAt);
        const blob = await pdf(doc).toBlob();
        triggerDownload(blob, `LIM2026_${numeroAffiche(train)}.pdf`);
      } else {
        const zip = new JSZip();
        for (const num of selectedList) {
          const train = trains[num];
          const doc = buildTrainPdfDocument2026(train, currentLigneVersion, train.horaires, ltvRows, ltvPublishedAt);
          const blob = await pdf(doc).toBlob();
          zip.file(`LIM2026_${numeroAffiche(train)}.pdf`, blob);
        }
        const zipBlob = await zip.generateAsync({ type: "blob" });
        triggerDownload(zipBlob, "LIM2026_export.zip");
      }
    } finally {
      setIsGenerating(false);
      setPendingAction(null);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 15, color: "#111827" }}>Export des PDF</div>

      <div
        style={{
          padding: 12,
          border: "1px solid #e5e7eb",
          borderRadius: 10,
          background: "#f9fafb",
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        <div style={{ fontWeight: 600, fontSize: 13, color: "#374151" }}>Trains</div>

        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            cursor: "pointer",
            fontSize: 13,
            fontWeight: 600,
            paddingBottom: 6,
            borderBottom: "1px solid #e5e7eb",
          }}
        >
          <input type="checkbox" checked={allSelected} onChange={toggleAll} style={{ cursor: "pointer" }} />
          Tout sélectionner
        </label>

        {trainNumbers.length === 0 ? (
          <div style={{ fontSize: 12, color: "#9ca3af", fontStyle: "italic" }}>
            Aucun train disponible (créez-en depuis l'onglet Normalisé 2026)
          </div>
        ) : (
          trainNumbers.map((num) => (
            <label
              key={num}
              style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, padding: "2px 0" }}
            >
              <input
                type="checkbox"
                checked={selectedTrains.has(num)}
                onChange={() => toggleTrain(num)}
                style={{ cursor: "pointer" }}
              />
              {numeroAffiche(trains[num])}
            </label>
          ))
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <button
          type="button"
          disabled={!canDownloadPdf}
          style={canDownloadPdf ? BTN_ACTIVE : BTN_DISABLED}
          onClick={() => void runAction("pdf")}
        >
          {isGenerating && pendingAction === "pdf" ? "Génération…" : "Télécharger PDF"}
        </button>
        <button
          type="button"
          disabled={!canDownloadZip}
          style={canDownloadZip ? BTN_ACTIVE : BTN_DISABLED}
          onClick={() => void runAction("zip")}
        >
          {isGenerating && pendingAction === "zip" ? "Génération…" : "Télécharger ZIP"}
        </button>
      </div>
    </div>
  );
}

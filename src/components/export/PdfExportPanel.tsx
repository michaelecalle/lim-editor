import { useState, useEffect } from "react";
import JSZip from "jszip";
import { pdf } from "@react-pdf/renderer";
import LimPdf from "../pdf/LimPdf";
import {
  buildPdfPropsForTrain,
  type LtvRowForExport,
} from "../../modules/ft-editor/utils/buildPdfPropsForTrain";
import type { FtSourceDirectionTables } from "../../modules/ft-editor/types/sourceTypes";

type Props = {
  availableTrainNumbers: string[];
  parsedSource: FtSourceDirectionTables;
  ltvNormalizedRows: LtvRowForExport[];
  todayIso: string;
  tomorrowIso: string;
  activeTrainNumber: string;
};

const BTN_BASE: React.CSSProperties = {
  width: "100%",
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid #d1d5db",
  fontWeight: 700,
  fontSize: 14,
  cursor: "pointer",
  transition: "opacity 0.15s",
};

const BTN_ACTIVE: React.CSSProperties = {
  ...BTN_BASE,
  background: "#111827",
  color: "#ffffff",
  border: "1px solid #111827",
};

const BTN_DISABLED: React.CSSProperties = {
  ...BTN_BASE,
  background: "#f3f4f6",
  color: "#9ca3af",
  cursor: "not-allowed",
};

export default function PdfExportPanel({
  availableTrainNumbers,
  parsedSource,
  ltvNormalizedRows,
  todayIso,
  tomorrowIso,
  activeTrainNumber,
}: Props) {
  const [selectedDate, setSelectedDate] = useState<string>(todayIso);
  const [selectedTrains, setSelectedTrains] = useState<Set<string>>(new Set());

  // Quand le train actif de l'onglet Export change, sélectionner automatiquement ce train
  useEffect(() => {
    if (activeTrainNumber !== "" && availableTrainNumbers.includes(activeTrainNumber)) {
      setSelectedTrains(new Set([activeTrainNumber]));
    }
  }, [activeTrainNumber, availableTrainNumbers]);
  const [showTomorrowModal, setShowTomorrowModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<"pdf" | "zip" | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const allSelected =
    availableTrainNumbers.length > 0 &&
    availableTrainNumbers.every((t) => selectedTrains.has(t));

  const toggleTrain = (trainNumber: string) => {
    setSelectedTrains((prev) => {
      const next = new Set(prev);
      if (next.has(trainNumber)) next.delete(trainNumber);
      else next.add(trainNumber);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelectedTrains(new Set());
    } else {
      setSelectedTrains(new Set(availableTrainNumbers));
    }
  };

  const trainLabel = (trainNumber: string): string => {
    const variant = parsedSource.trains?.[trainNumber]?.variants[0];
    const numeroFrance = variant?.meta.numeroFrance?.trim();
    return numeroFrance ? `${trainNumber} / ${numeroFrance}` : trainNumber;
  };

  const selectedList = availableTrainNumbers.filter((t) => selectedTrains.has(t));
  const canDownloadPdf = selectedList.length === 1 && !isGenerating;
  const canDownloadZip = selectedList.length >= 1 && !isGenerating;

  const triggerAction = (action: "pdf" | "zip") => {
    if (selectedDate === tomorrowIso) {
      setPendingAction(action);
      setShowTomorrowModal(true);
    } else {
      runAction(action);
    }
  };

  const runAction = async (action: "pdf" | "zip") => {
    setIsGenerating(true);
    try {
      if (action === "pdf") {
        await downloadSinglePdf(selectedList[0], selectedDate);
      } else {
        await downloadZip(selectedList, selectedDate);
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadSinglePdf = async (trainNumber: string, date: string) => {
    const props = buildPdfPropsForTrain(trainNumber, date, parsedSource, ltvNormalizedRows);
    if (!props) return;
    const blob = await pdf(<LimPdf {...props} />).toBlob();
    triggerDownload(blob, `LIM_${trainNumber}_${date}.pdf`);
  };

  const downloadZip = async (trainNumbers: string[], date: string) => {
    const zip = new JSZip();
    for (const trainNumber of trainNumbers) {
      const props = buildPdfPropsForTrain(trainNumber, date, parsedSource, ltvNormalizedRows);
      if (!props) continue;
      const blob = await pdf(<LimPdf {...props} />).toBlob();
      zip.file(`LIM_${trainNumber}_${date}.pdf`, blob);
    }
    const zipBlob = await zip.generateAsync({ type: "blob" });
    triggerDownload(zipBlob, `LIM_export_${date}.zip`);
  };

  const triggerDownload = (blob: Blob, filename: string) => {
    // application/octet-stream force le téléchargement même si le navigateur ouvre les PDF en ligne
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Titre */}
      <div style={{ fontWeight: 700, fontSize: 15, color: "#111827" }}>
        Export des PDF
      </div>

      {/* Sélecteur de date */}
      <div
        style={{
          padding: 12,
          border: "1px solid #e5e7eb",
          borderRadius: 10,
          background: "#f9fafb",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <div style={{ fontWeight: 600, fontSize: 13, color: "#374151" }}>Date</div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
          <input
            type="radio"
            name="exportDate"
            value={todayIso}
            checked={selectedDate === todayIso}
            onChange={() => setSelectedDate(todayIso)}
          />
          Aujourd'hui ({todayIso})
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
          <input
            type="radio"
            name="exportDate"
            value={tomorrowIso}
            checked={selectedDate === tomorrowIso}
            onChange={() => setSelectedDate(tomorrowIso)}
          />
          Demain ({tomorrowIso})
        </label>
        {selectedDate === tomorrowIso && (
          <div
            style={{
              marginTop: 4,
              padding: "6px 10px",
              background: "#fef3c7",
              border: "1px solid #f59e0b",
              borderRadius: 6,
              fontSize: 11,
              color: "#92400e",
              lineHeight: 1.4,
            }}
          >
            ⚠ Les données du lendemain peuvent être incomplètes. Une confirmation sera demandée.
          </div>
        )}
      </div>

      {/* Sélection des trains */}
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

        {/* Tout sélectionner */}
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
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleAll}
            style={{ cursor: "pointer" }}
          />
          Tout sélectionner
        </label>

        {availableTrainNumbers.length === 0 ? (
          <div style={{ fontSize: 12, color: "#9ca3af", fontStyle: "italic" }}>
            Aucun train disponible
          </div>
        ) : (
          availableTrainNumbers.map((trainNumber) => (
            <label
              key={trainNumber}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                cursor: "pointer",
                fontSize: 13,
                padding: "2px 0",
              }}
            >
              <input
                type="checkbox"
                checked={selectedTrains.has(trainNumber)}
                onChange={() => toggleTrain(trainNumber)}
                style={{ cursor: "pointer" }}
              />
              {trainLabel(trainNumber)}
            </label>
          ))
        )}
      </div>

      {/* Boutons d'action */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <button
          type="button"
          disabled={!canDownloadPdf}
          style={canDownloadPdf ? BTN_ACTIVE : BTN_DISABLED}
          onClick={() => triggerAction("pdf")}
        >
          {isGenerating && pendingAction === "pdf" ? "Génération…" : "Télécharger PDF"}
        </button>

        <button
          type="button"
          disabled={!canDownloadZip}
          style={canDownloadZip ? BTN_ACTIVE : BTN_DISABLED}
          onClick={() => triggerAction("zip")}
        >
          {isGenerating && pendingAction === "zip" ? "Génération…" : "Télécharger ZIP"}
        </button>

      </div>

      {/* Modale de confirmation pour le lendemain */}
      {showTomorrowModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => setShowTomorrowModal(false)}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: 12,
              padding: 24,
              maxWidth: 380,
              width: "90%",
              boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 12, color: "#111827" }}>
              ⚠ Génération du lendemain
            </div>
            <p style={{ fontSize: 14, color: "#374151", lineHeight: 1.6, margin: "0 0 20px" }}>
              Il est fortement déconseillé de générer les PDF du lendemain. Les données peuvent
              être incomplètes ou ne pas correspondre au service réel.
            </p>
            <p style={{ fontSize: 14, fontWeight: 600, color: "#111827", margin: "0 0 20px" }}>
              Êtes-vous sûr de vouloir continuer ?
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setShowTomorrowModal(false)}
                style={{
                  padding: "8px 18px",
                  borderRadius: 8,
                  border: "1px solid #d1d5db",
                  background: "#f3f4f6",
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: "pointer",
                  color: "#374151",
                }}
              >
                Non
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowTomorrowModal(false);
                  if (pendingAction) runAction(pendingAction);
                  setPendingAction(null);
                }}
                style={{
                  padding: "8px 18px",
                  borderRadius: 8,
                  border: "none",
                  background: "#dc2626",
                  color: "#ffffff",
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                Oui, continuer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

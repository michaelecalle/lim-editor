// src/components/tabs/Export2026Preview.tsx
//
// Zone principale de l'onglet Export (rebâtie de zéro, 09/08) — sélecteur de train
// + aperçu PDF LIVE du format 2026 en dessous, via `<PDFViewer>` de react-pdf
// (même mécanisme que l'ancien `ExportTab.tsx`, qui affichait l'ancien format —
// remplacé, pas adapté, cf. mémoire projet). Réutilise `buildTrainPdfDocument2026`
// (même construction que l'aperçu de l'onglet Normalisé 2026 et l'export ZIP du
// panneau latéral `PdfExportPanel2026.tsx`) pour ne jamais avoir deux assemblages
// du même document.
import { useEffect, useState } from "react";
import { PDFViewer } from "@react-pdf/renderer";
import type { PdfLtvRow } from "../pdf/LimPdf";
import {
  readNormalizedLocal,
  readLigneVersionsLocal,
  cloneDefaultLigneVersion,
  DEFAULT_LIGNE_VERSION_ID,
  CURRENT_TRAIN_KEY,
  EXPORT_SELECTED_TRAIN_EVENT,
} from "./Normalise2026Tab";
import { fetchLtvRows2026 } from "../../modules/pdf2026/buildLtvRows2026";
import { buildTrainPdfDocument2026 } from "../../modules/pdf2026/buildTrainPdfDocument2026";

const SELECT: React.CSSProperties = {
  padding: "7px 10px",
  borderRadius: 8,
  border: "1px solid #d1d5db",
  fontSize: 14,
  minWidth: 220,
};

export default function Export2026Preview() {
  const [trains] = useState(() => readNormalizedLocal());
  const [ligneVersions] = useState(() => readLigneVersionsLocal());
  const trainNumbers = Object.keys(trains).sort();

  // Présélection : même train que celui ouvert dans l'onglet Fiches Train,
  // comme le faisait l'ancien panneau d'export (demande utilisateur, 12/08).
  const [selected, setSelected] = useState(() => {
    const current = localStorage.getItem(CURRENT_TRAIN_KEY) ?? "";
    return current in trains ? current : "";
  });
  const [ltvRows, setLtvRows] = useState<PdfLtvRow[]>([]);
  const [ltvPublishedAt, setLtvPublishedAt] = useState<string | null>(null);

  useEffect(() => {
    fetchLtvRows2026().then(({ rows, publishedAt, errorMessage }) => {
      if (errorMessage) console.warn("[aperçu export 2026] LTV non chargées :", errorMessage);
      setLtvRows(rows);
      setLtvPublishedAt(publishedAt);
    });
  }, []);

  const train = selected !== "" ? trains[selected] : null;
  const currentLigneVersion = ligneVersions[DEFAULT_LIGNE_VERSION_ID] ?? cloneDefaultLigneVersion();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginRight: 8 }}>Train :</label>
        <select
          value={selected}
          onChange={(e) => {
            const value = e.target.value;
            setSelected(value);
            // Coche automatiquement ce train dans le panneau latéral (demande
            // utilisateur, 12/08 — cf. commentaire de `EXPORT_SELECTED_TRAIN_EVENT`).
            if (value !== "") {
              window.dispatchEvent(new CustomEvent(EXPORT_SELECTED_TRAIN_EVENT, { detail: value }));
            }
          }}
          style={SELECT}
        >
          <option value="">— sélectionner un train —</option>
          {trainNumbers.map((num) => (
            <option key={num} value={num}>
              Train {num}
            </option>
          ))}
        </select>
      </div>

      {train ? (
        <PDFViewer style={{ width: "100%", height: "75vh", border: "1px solid #d1d5db", borderRadius: 8 }}>
          {buildTrainPdfDocument2026(train, currentLigneVersion, train.horaires, ltvRows, ltvPublishedAt).document}
        </PDFViewer>
      ) : (
        <div style={{ fontSize: 13, color: "#9ca3af", fontStyle: "italic" }}>Sélectionnez un train pour afficher l'aperçu.</div>
      )}
    </div>
  );
}

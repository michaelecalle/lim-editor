import { PDFViewer } from "@react-pdf/renderer";
import LimPdf from "../pdf/LimPdf";
import type { PdfFtRow, PdfLtvRow } from "../pdf/LimPdf";
import type { FtSourceTrainVariantData } from "../../modules/ft-editor/types/sourceTypes";

type VariantInfo = {
  index: number;
  label: string;
  dates: string;
  days: string;
};

type Props = {
  exportTrainNumber: string;
  onExportTrainNumberChange: (num: string) => void;
  availableTrainNumbers: string[];
  exportComposition: string;
  onExportCompositionToggle: () => void;
  exportDate: string;
  onExportDateChange: (date: string) => void;
  todayIso: string;
  tomorrowIso: string;
  exportAllVariantInfos: VariantInfo[];
  exportAutoVariantIndex: number;
  exportVariantIndex: number;
  onExportVariantOverrideIndexChange: (index: number | null) => void;
  exportVariant: FtSourceTrainVariantData | null;
  exportDateFormatted: string;
  exportLongueur: number | undefined;
  exportMasse: number | undefined;
  exportLtvRowsFiltered: PdfLtvRow[];
  exportLtvPublishedAt?: string | null;
  exportFtRowsFinal: PdfFtRow[];
};

export default function ExportTab({
  exportTrainNumber,
  onExportTrainNumberChange,
  availableTrainNumbers,
  exportComposition,
  onExportCompositionToggle,
  exportDate,
  onExportDateChange,
  todayIso,
  tomorrowIso,
  exportAllVariantInfos,
  exportAutoVariantIndex,
  exportVariantIndex,
  onExportVariantOverrideIndexChange,
  exportVariant,
  exportDateFormatted,
  exportLongueur,
  exportMasse,
  exportLtvRowsFiltered,
  exportLtvPublishedAt,
  exportFtRowsFinal,
}: Props) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Titre Aperçu */}
      <div
        style={{
          fontSize: 15,
          fontWeight: 700,
          color: "#111827",
        }}
      >
        Aperçu
      </div>

      {/* Titre section champs éditables */}
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: "#9ca3af",
          textTransform: "uppercase",
          letterSpacing: 1,
        }}
      >
        Champs éditables
      </div>

      {/* Sélecteur de train + composition */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontWeight: 600 }}>Train :</div>
        <select
          value={exportTrainNumber}
          onChange={(e) => onExportTrainNumberChange(e.target.value)}
          disabled={availableTrainNumbers.length === 0}
          style={{
            padding: "8px 12px",
            borderRadius: 10,
            border: "1px solid #d1d5db",
            background: "#ffffff",
            fontSize: 14,
            minWidth: 120,
            cursor: availableTrainNumbers.length === 0 ? "not-allowed" : "pointer",
          }}
        >
          {availableTrainNumbers.length === 0 ? (
            <option value="">Aucun train</option>
          ) : (
            availableTrainNumbers.map((num) => (
              <option key={num} value={num}>{num}</option>
            ))
          )}
        </select>

        <div style={{ fontWeight: 600 }}>Composition :</div>
        <button
          type="button"
          onClick={onExportCompositionToggle}
          title="Cliquer pour basculer entre US et UM"
          style={{
            fontSize: 22,
            fontWeight: 800,
            padding: "4px 14px",
            borderRadius: 8,
            border: "2px solid #374151",
            background: "#fde047",
            cursor: "pointer",
            userSelect: "none",
            lineHeight: 1.2,
          }}
        >
          {exportComposition}
        </button>

        <div style={{ fontWeight: 600 }}>Date :</div>
        <input
          type="date"
          value={exportDate}
          min={todayIso}
          max={tomorrowIso}
          onChange={(e) => onExportDateChange(e.target.value)}
          style={{
            padding: "6px 10px",
            borderRadius: 8,
            border: "1px solid #d1d5db",
            fontSize: 14,
            background: "#ffffff",
            cursor: "pointer",
          }}
        />

        {exportAllVariantInfos.length > 0 ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {exportAllVariantInfos.map(({ index, label, dates, days }) => {
              const isAuto = index === exportAutoVariantIndex;
              const isSelected = index === exportVariantIndex;
              return (
                <button
                  key={index}
                  type="button"
                  onClick={() =>
                    onExportVariantOverrideIndexChange(isAuto ? null : index)
                  }
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 3,
                    padding: "8px 12px",
                    borderRadius: 10,
                    border: isSelected
                      ? "2px solid #2563eb"
                      : "1.5px solid #d1d5db",
                    background: isSelected ? "#eff6ff" : "#f9fafb",
                    cursor: "pointer",
                    textAlign: "left",
                    position: "relative",
                    minWidth: 120,
                  }}
                >
                  {isAuto && (
                    <div
                      style={{
                        position: "absolute",
                        top: 4,
                        right: 7,
                        fontSize: 9,
                        color: isSelected ? "#2563eb" : "#9ca3af",
                        fontWeight: 600,
                        letterSpacing: 0.5,
                      }}
                    >
                      auto
                    </div>
                  )}
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: isSelected ? "#1d4ed8" : "#111827",
                    }}
                  >
                    {label}
                  </div>
                  <div style={{ fontSize: 11, color: "#6b7280" }}>{dates}</div>
                  <div
                    style={{
                      fontSize: 11,
                      fontFamily: "monospace",
                      color: "#374151",
                      letterSpacing: 2,
                    }}
                  >
                    {days}
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div style={{ fontSize: 13, color: "#9ca3af" }}>
            Aucune variante disponible
          </div>
        )}
      </div>

      {/* Aperçu PDF */}
      {exportTrainNumber !== "" && (
        <PDFViewer
          style={{
            width: "100%",
            height: "75vh",
            border: "1px solid #d1d5db",
            borderRadius: 8,
          }}
        >
          <LimPdf
            trainNumber={exportTrainNumber}
            categorieEspagne={exportVariant?.meta.categorieEspagne?.trim() ?? ""}
            origine={exportVariant?.meta.origine?.trim() ?? ""}
            destination={exportVariant?.meta.destination?.trim() ?? ""}
            dateFormatted={exportDateFormatted}
            composition={exportComposition}
            materiel={exportVariant?.meta.materiel?.trim() ?? ""}
            ligne={exportVariant?.meta.ligne?.trim() ?? ""}
            longueur={exportLongueur}
            masse={exportMasse}
            ltvRows={exportLtvRowsFiltered}
            ltvPublishedAt={exportLtvPublishedAt}
            ftRows={exportFtRowsFinal}
          />
        </PDFViewer>
      )}
    </div>
  );
}

import FTTable from "../ft-table/FTTable";
import { HORAIRE_COLUMNS } from "../../modules/ft-editor/constants/ftColumns";
import { getDirectionLabel, getRowPreview } from "../../modules/ft-editor/utils/ftEditorUtils";
import type {
  EditorDirection,
  EditorDirectField,
  EditorFtRowView,
} from "../../modules/ft-editor/types/viewTypes";

type TrainOption = {
  trainNumber: string;
  label: string;
  isUnpublished: boolean;
};

type Props = {
  selectedTrainNumber: string;
  onSelectedTrainNumberChange: (num: string) => void;
  trainOptions: TrainOption[];
  isSelectedTrainUnpublished: boolean;

  selectedOrigin: string;
  onOriginChange: (value: string) => void;
  selectedDestination: string;
  onDestinationChange: (value: string) => void;
  horaireLocationOptions: string[];

  onValidate: () => void;
  onCreateTrain: () => void;
  onOpenDeleteTrainConfirm: () => void;

  horaireValidationError: string | null;

  horaireDirection: EditorDirection;
  sourceStatus: "idle" | "loading" | "success" | "error";
  remoteInfo: string;
  inspectionLines: string[];
  sourceTableLabel: string;
  displayedHoraireRows: EditorFtRowView[];
  selectedRowId: string | null;
  onRowSelect: (row: EditorFtRowView) => void;
  onCellEditRequest: (row: EditorFtRowView, field: EditorDirectField | null) => void;
  onInlineComCommit: (rowId: string, nextCom: string) => void;
  onInlineHoraCommit: (rowId: string, nextHora: string) => void;
  onInlineTecnCommit: (rowId: string, nextTecn: string) => void;
  onInlineConcCommit: (rowId: string, nextConc: string) => void;
};

export default function HoraireTab({
  selectedTrainNumber,
  onSelectedTrainNumberChange,
  trainOptions,
  isSelectedTrainUnpublished,
  selectedOrigin,
  onOriginChange,
  selectedDestination,
  onDestinationChange,
  horaireLocationOptions,
  onValidate,
  onCreateTrain,
  onOpenDeleteTrainConfirm,
  horaireValidationError,
  horaireDirection,
  sourceStatus,
  remoteInfo,
  inspectionLines,
  sourceTableLabel,
  displayedHoraireRows,
  selectedRowId,
  onRowSelect,
  onCellEditRequest,
  onInlineComCommit,
  onInlineHoraCommit,
  onInlineTecnCommit,
  onInlineConcCommit,
}: Props) {
  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 12,
        }}
      >
        <div style={{ fontWeight: 600 }}>Train sélectionné :</div>

        <select
          value={selectedTrainNumber}
          onChange={(event) => onSelectedTrainNumberChange(event.target.value)}
          disabled={trainOptions.length === 0}
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: isSelectedTrainUnpublished
              ? "1px solid #2563eb"
              : "1px solid #d1d5db",
            background: "#ffffff",
            color: isSelectedTrainUnpublished ? "#2563eb" : "#111827",
            fontWeight: isSelectedTrainUnpublished ? 700 : 500,
            minWidth: 120,
            cursor: trainOptions.length === 0 ? "not-allowed" : "pointer",
          }}
        >
          {trainOptions.length === 0 ? (
            <option value="">Aucun train</option>
          ) : (
            trainOptions.map(({ trainNumber, label, isUnpublished }) => (
              <option
                key={trainNumber}
                value={trainNumber}
                style={{
                  color: isUnpublished ? "#2563eb" : "#111827",
                  fontWeight: isUnpublished ? 700 : 400,
                }}
              >
                {label}
              </option>
            ))
          )}
        </select>

        <div style={{ fontWeight: 600 }}>Origine :</div>

        <select
          value={selectedOrigin}
          onChange={(event) => onOriginChange(event.target.value)}
          disabled={horaireLocationOptions.length === 0}
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #d1d5db",
            background: "#ffffff",
            minWidth: 180,
            cursor:
              horaireLocationOptions.length === 0 ? "not-allowed" : "pointer",
          }}
        >
          <option value="">Choisir</option>
          {horaireLocationOptions.map((location) => (
            <option key={`origin-${location}`} value={location}>
              {location}
            </option>
          ))}
        </select>

        <div style={{ fontWeight: 600 }}>Destination :</div>

        <select
          value={selectedDestination}
          onChange={(event) => onDestinationChange(event.target.value)}
          disabled={horaireLocationOptions.length === 0}
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #d1d5db",
            background: "#ffffff",
            minWidth: 180,
            cursor:
              horaireLocationOptions.length === 0 ? "not-allowed" : "pointer",
          }}
        >
          <option value="">Choisir</option>
          {horaireLocationOptions.map((location) => (
            <option key={`destination-${location}`} value={location}>
              {location}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={onValidate}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #d1d5db",
            background: "#ffffff",
            color: "#111827",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Valider
        </button>

        <div
          style={{
            width: 1,
            height: 28,
            background: "#d1d5db",
            marginLeft: 4,
            marginRight: 4,
          }}
        />

        <button
          type="button"
          onClick={onCreateTrain}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #2563eb",
            background: "#2563eb",
            color: "#ffffff",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Créer
        </button>

        <button
          type="button"
          onClick={onOpenDeleteTrainConfirm}
          disabled={selectedTrainNumber.trim() === ""}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #dc2626",
            background:
              selectedTrainNumber.trim() === "" ? "#fca5a5" : "#dc2626",
            color: "#ffffff",
            fontWeight: 600,
            cursor:
              selectedTrainNumber.trim() === "" ? "not-allowed" : "pointer",
          }}
        >
          Supprimer
        </button>
      </div>

      {horaireValidationError ? (
        <div
          style={{
            marginBottom: 12,
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #fecaca",
            background: "#fef2f2",
            color: "#991b1b",
            fontWeight: 500,
          }}
        >
          {horaireValidationError}
        </div>
      ) : null}

      <div
        style={{
          border: isSelectedTrainUnpublished
            ? "2px solid #93c5fd"
            : "2px solid transparent",
          borderRadius: 16,
          padding: isSelectedTrainUnpublished ? 8 : 0,
          background: "#ffffff",
          transition: "border-color 0.15s ease",
        }}
      >
        <FTTable
          title="Données horaires"
          titleBadge={
            isSelectedTrainUnpublished ? (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "4px 10px",
                  borderRadius: 999,
                  border: "1px solid #93c5fd",
                  background: "#dbeafe",
                  color: "#1d4ed8",
                  fontWeight: 700,
                  fontSize: 14,
                  lineHeight: 1.2,
                }}
              >
                En cours d'édition
              </span>
            ) : null
          }
          directionLabel={getDirectionLabel(horaireDirection)}
          sourceStatus={sourceStatus}
          remoteInfo={remoteInfo}
          inspectionLines={inspectionLines}
          sourceArrayName={sourceTableLabel}
          rowCount={displayedHoraireRows.length}
          firstRowPreview={getRowPreview(displayedHoraireRows[0])}
          lastRowPreview={getRowPreview(
            displayedHoraireRows[displayedHoraireRows.length - 1]
          )}
          rows={displayedHoraireRows}
          columns={HORAIRE_COLUMNS}
          dimHoraireColumns={false}
          selectedRowId={selectedRowId}
          onRowSelect={onRowSelect}
          onCellEditRequest={onCellEditRequest}
          onInlineComCommit={onInlineComCommit}
          onInlineHoraCommit={onInlineHoraCommit}
          onInlineTecnCommit={onInlineTecnCommit}
          onInlineConcCommit={onInlineConcCommit}
        />
      </div>
    </>
  );
}

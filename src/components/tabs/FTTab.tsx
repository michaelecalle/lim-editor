import DirectionSelector from "../toolbar/DirectionSelector";
import FTTable from "../ft-table/FTTable";
import EditorStatusBanner from "../EditorStatusBanner";
import type {
  EditorDirection,
  EditorDirectField,
  EditorFtRowView,
} from "../../modules/ft-editor/types/viewTypes";

type Props = {
  direction: EditorDirection;
  onDirectionChange: (dir: EditorDirection) => void;
  directionLabel: string;
  sourceStatus: "idle" | "loading" | "success" | "error";
  remoteInfo: string;
  inspectionLines: string[];
  sourceTableLabel: string;
  sourceRows: EditorFtRowView[];
  firstRowPreview: string;
  lastRowPreview: string;
  selectedRowId: string | null;
  onRowSelect: (row: EditorFtRowView) => void;
  onCellEditRequest: (row: EditorFtRowView, field: EditorDirectField | null) => void;
  onDeleteRows: (rowIds: string[]) => void;
  onUpsertNote: (targetRowId: string, noteLines: string[]) => void;
  onInsertRowAbove: (targetRowId: string) => void;
  hasUnpublishedChanges: boolean;
  exportMessage: string;
  exportStatus: "idle" | "success" | "error";
  exportDiagnostics: string[];
};

export default function FTTab({
  direction,
  onDirectionChange,
  directionLabel,
  sourceStatus,
  remoteInfo,
  inspectionLines,
  sourceTableLabel,
  sourceRows,
  firstRowPreview,
  lastRowPreview,
  selectedRowId,
  onRowSelect,
  onCellEditRequest,
  onDeleteRows,
  onUpsertNote,
  onInsertRowAbove,
  hasUnpublishedChanges,
  exportMessage,
  exportStatus,
  exportDiagnostics,
}: Props) {
  return (
    <>
      <div style={{ marginBottom: 12 }}>
        <DirectionSelector value={direction} onChange={onDirectionChange} />
      </div>
      <FTTable
        directionLabel={directionLabel}
        sourceStatus={sourceStatus}
        remoteInfo={remoteInfo}
        inspectionLines={inspectionLines}
        sourceArrayName={sourceTableLabel}
        rowCount={sourceRows.length}
        firstRowPreview={firstRowPreview}
        lastRowPreview={lastRowPreview}
        rows={sourceRows}
        selectedRowId={selectedRowId}
        onRowSelect={onRowSelect}
        onCellEditRequest={onCellEditRequest}
        onDeleteRows={onDeleteRows}
        onUpsertNote={onUpsertNote}
        onInsertRowAbove={onInsertRowAbove}
      />

      <EditorStatusBanner
        title="Diagnostic export local"
        message={
          hasUnpublishedChanges
            ? `${exportMessage} Modifications locales non publiées détectées.`
            : `${exportMessage} Aucune modification locale non publiée.`
        }
        tone={
          exportStatus === "success"
            ? "success"
            : exportStatus === "error"
              ? "error"
              : hasUnpublishedChanges
                ? "warning"
                : "neutral"
        }
        details={
          exportDiagnostics.length > 0
            ? exportDiagnostics
            : ["Aucun diagnostic d'export disponible pour l'instant."]
        }
      />
    </>
  );
}

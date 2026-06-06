import { useCallback } from "react";
import "./LTVTab.css";
import {
  getLtvInputMode,
  formatLtvDateTimeForDisplay,
  LTV_TABLE_HEADERS,
  LTV_TEXT_FIELDS_BEFORE_FLAGS,
  LTV_FLAG_FIELDS,
} from "../../modules/ft-editor/utils/ftEditorUtils";
import type {
  LtvEditorRow,
  LtvEditorTextField,
  LtvEditorFlagField,
} from "../../modules/ft-editor/utils/ftEditorUtils";

// Seuil PK séparant la section Barcelone-Figueres (PK >= 616) du reste de la ligne.
const PK_SPLIT = 616;

function parsePk(value: string): number | null {
  const m = (value ?? "").replace(",", ".").match(/\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

// Une LTV appartient à Barcelone-Figueres si l'un de ses PK atteint >= 616.
function isBarcelonaFigueres(row: LtvEditorRow): boolean {
  const a = parsePk(row.kmIni);
  const b = parsePk(row.kmFin);
  const max = Math.max(a ?? Number.NEGATIVE_INFINITY, b ?? Number.NEGATIVE_INFINITY);
  return max >= PK_SPLIT;
}

type LtvNormalizedFileInfo = {
  publishedAt: string;
  source: string;
  fetchedAt: string;
  sourceUpdatedAt: string | null;
  sourceUpdatedFile: string | null;
  warningCount: number;
};

type Props = {
  ltvNormalizedStatus: "idle" | "loading" | "success" | "error";
  ltvNormalizedMessage: string;
  ltvNormalizedFileInfo: LtvNormalizedFileInfo | null;
  ltvNormalizedRows: LtvEditorRow[];
  draggedLtvRowId: string | null;
  dragOverLtvRowId: string | null;

  onAddLtvNormalizedRow: () => void;
  onRequestDeleteLtvNormalizedRow: (rowId: string) => void;
  onStartLtvRowDrag: (rowId: string) => void;
  onEnterLtvRowDrag: (rowId: string) => void;
  onDropLtvRow: (rowId: string) => void;
  onCancelLtvRowDrag: () => void;

  onUpdateLtvTextField: (rowId: string, field: LtvEditorTextField, value: string) => void;
  onNormalizeLtvCodeField: (rowId: string) => void;
  onNormalizeLtvKmField: (rowId: string, field: "kmIni" | "kmFin") => void;
  onToggleLtvFlagField: (rowId: string, field: LtvEditorFlagField) => void;
};

export default function LTVTab({
  ltvNormalizedStatus,
  ltvNormalizedMessage,
  ltvNormalizedFileInfo,
  ltvNormalizedRows,
  draggedLtvRowId,
  dragOverLtvRowId,
  onAddLtvNormalizedRow,
  onRequestDeleteLtvNormalizedRow,
  onStartLtvRowDrag,
  onEnterLtvRowDrag,
  onDropLtvRow,
  onCancelLtvRowDrag,
  onUpdateLtvTextField,
  onNormalizeLtvCodeField,
  onNormalizeLtvKmField,
  onToggleLtvFlagField,
}: Props) {
  // Fond d'une cellule : blanc par défaut, rose si la cellule a été éditée
  // manuellement (suivi des corrections — pas un code couleur de source).
  const cellBackground = useCallback(
    (row: LtvEditorRow, field: string) =>
      row.editedFields?.[field] ? "#fce7f3" : "#ffffff",
    []
  );

  const renderLtvTextCell = useCallback(
    (row: LtvEditorRow, field: LtvEditorTextField) => (
      <td
        key={`${row.id}-${field}`}
        style={{
          border: "1px solid #d1d5db",
          padding: 0,
          background: cellBackground(row, field),
          verticalAlign: "top",
        }}
      >
        <textarea
          inputMode={getLtvInputMode(field)}
          value={row[field]}
          onChange={(event) => onUpdateLtvTextField(row.id, field, event.target.value)}
          onBlur={() => {
            if (field === "code") {
              onNormalizeLtvCodeField(row.id);
            } else if (field === "kmIni" || field === "kmFin") {
              onNormalizeLtvKmField(row.id, field);
            }
          }}
          rows={2}
          style={{
            width: "100%",
            minHeight: 48,
            boxSizing: "border-box",
            border: "none",
            padding: "8px 6px",
            background: "transparent",
            color: "#111827",
            font: "inherit",
            outline: "none",
            resize: "vertical",
            whiteSpace: "pre-wrap",
            overflowWrap: "anywhere",
          }}
        />
      </td>
    ),
    [cellBackground, onNormalizeLtvCodeField, onNormalizeLtvKmField, onUpdateLtvTextField]
  );

  const renderLtvFlagCell = useCallback(
    (row: LtvEditorRow, field: LtvEditorFlagField) => {
      const isChecked = row[field];
      return (
        <td
          key={`${row.id}-${field}`}
          style={{
            border: "1px solid #d1d5db",
            padding: 0,
            background: cellBackground(row, field),
            verticalAlign: "middle",
            textAlign: "center",
          }}
        >
          <button
            type="button"
            onClick={() => onToggleLtvFlagField(row.id, field)}
            aria-pressed={isChecked}
            title="Cliquer, ou utiliser Entrée/Espace au clavier, pour cocher ou décocher"
            style={{
              width: "100%",
              minHeight: 32,
              border: "none",
              background: "transparent",
              color: isChecked ? "#047857" : "#9ca3af",
              font: "inherit",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            {isChecked ? "✓" : ""}
          </button>
        </td>
      );
    },
    [cellBackground, onToggleLtvFlagField]
  );

  const renderTableSection = useCallback(
    (rows: LtvEditorRow[], title: string, emptyMessage: string) => (
      <div
        style={{
          padding: 16,
          border: "1px solid #d1d5db",
          borderRadius: 16,
          background: "#ffffff",
          color: "#111827",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
            marginBottom: 12,
          }}
        >
          <div style={{ fontSize: 20, fontWeight: 700 }}>{title}</div>
          <div
            style={{
              padding: "6px 10px",
              borderRadius: 999,
              border: "1px solid #d1d5db",
              background: "#f9fafb",
              color: "#374151",
              fontWeight: 700,
              fontSize: 13,
            }}
          >
            {rows.length} LTV
          </div>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              minWidth: 1380,
              borderCollapse: "collapse",
              tableLayout: "fixed",
              fontSize: 13,
            }}
          >
            <thead>
              <tr>
                <th
                  style={{
                    width: 64,
                    border: "1px solid #d1d5db",
                    background: "#f3f4f6",
                    color: "#111827",
                    padding: "8px 6px",
                    textAlign: "center",
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                  }}
                >
                  —
                </th>
                <th
                  style={{
                    width: 48,
                    border: "1px solid #d1d5db",
                    background: "#f3f4f6",
                    color: "#111827",
                    padding: "8px 6px",
                    textAlign: "center",
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                  }}
                >
                  ↕
                </th>
                {LTV_TABLE_HEADERS.map((header) => (
                  <th
                    key={header}
                    style={{
                      border: "1px solid #d1d5db",
                      background: "#f3f4f6",
                      color: "#111827",
                      padding: "8px 6px",
                      textAlign: "left",
                      fontWeight: 700,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={18}
                    style={{
                      border: "1px solid #d1d5db",
                      padding: 18,
                      textAlign: "center",
                      color: "#6b7280",
                      background: "#ffffff",
                      fontWeight: 500,
                    }}
                  >
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const isDragged = draggedLtvRowId === row.id;
                  const isDragTarget =
                    dragOverLtvRowId === row.id && draggedLtvRowId !== row.id;

                  return (
                    <tr
                      key={row.id}
                      onDragOver={(event) => {
                        if (draggedLtvRowId == null) return;
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "move";
                        onEnterLtvRowDrag(row.id);
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        onDropLtvRow(row.id);
                      }}
                      style={{
                        opacity: isDragged ? 0.55 : 1,
                        outline: isDragTarget ? "2px solid #2563eb" : "none",
                        outlineOffset: -2,
                      }}
                    >
                      <td
                        key={`${row.id}-actions`}
                        style={{
                          width: 64,
                          border: "1px solid #d1d5db",
                          padding: 0,
                          background: "#ffffff",
                          verticalAlign: "middle",
                          textAlign: "center",
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => onRequestDeleteLtvNormalizedRow(row.id)}
                          title="Supprimer cette LTV"
                          style={{
                            width: "100%",
                            minHeight: 32,
                            border: "none",
                            background: "transparent",
                            color: "#dc2626",
                            fontSize: 18,
                            fontWeight: 900,
                            cursor: "pointer",
                          }}
                        >
                          ×
                        </button>
                      </td>

                      <td
                        key={`${row.id}-drag-handle`}
                        style={{
                          width: 48,
                          border: "1px solid #d1d5db",
                          padding: 0,
                          background: "#ffffff",
                          verticalAlign: "middle",
                          textAlign: "center",
                        }}
                      >
                        <div
                          draggable
                          onDragStart={(event) => {
                            event.dataTransfer.effectAllowed = "move";
                            event.dataTransfer.setData("text/plain", row.id);
                            onStartLtvRowDrag(row.id);
                          }}
                          onDragEnd={onCancelLtvRowDrag}
                          title="Déplacer cette LTV"
                          style={{
                            width: "100%",
                            minHeight: 32,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            background: "transparent",
                            color: "#6b7280",
                            fontSize: 18,
                            fontWeight: 900,
                            cursor: isDragged ? "grabbing" : "grab",
                            userSelect: "none",
                          }}
                        >
                          ⋮⋮
                        </div>
                      </td>

                      {LTV_TEXT_FIELDS_BEFORE_FLAGS.map((field) =>
                        renderLtvTextCell(row, field)
                      )}
                      {LTV_FLAG_FIELDS.map((field) => renderLtvFlagCell(row, field))}
                      {renderLtvTextCell(row, "observaciones")}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    ),
    [
      draggedLtvRowId,
      dragOverLtvRowId,
      onCancelLtvRowDrag,
      onDropLtvRow,
      onEnterLtvRowDrag,
      onRequestDeleteLtvNormalizedRow,
      onStartLtvRowDrag,
      renderLtvFlagCell,
      renderLtvTextCell,
    ]
  );

  const barcelonaFigueresRows = ltvNormalizedRows.filter(isBarcelonaFigueres);
  const resteRows = ltvNormalizedRows.filter((r) => !isBarcelonaFigueres(r));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Bandeau d'état + bouton d'ajout */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            color:
              ltvNormalizedStatus === "error"
                ? "#991b1b"
                : ltvNormalizedStatus === "success"
                  ? "#166534"
                  : "#4b5563",
            fontSize: 14,
            fontWeight: ltvNormalizedStatus === "error" ? 600 : 400,
            lineHeight: 1.5,
          }}
        >
          {ltvNormalizedMessage}
          {ltvNormalizedFileInfo ? (
            <>
              {" "}
              Publié le {formatLtvDateTimeForDisplay(ltvNormalizedFileInfo.publishedAt)}
            </>
          ) : null}
        </div>

        <button
          type="button"
          onClick={onAddLtvNormalizedRow}
          style={{
            padding: "8px 12px",
            borderRadius: 10,
            border: "1px solid #2563eb",
            background: "#2563eb",
            color: "#ffffff",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Ajouter une LTV
        </button>
      </div>

      {renderTableSection(
        barcelonaFigueresRows,
        "LTV Barcelone-Figueres (PK ≥ 616)",
        "Aucune LTV Barcelone-Figueres."
      )}

      {renderTableSection(
        resteRows,
        "Reste de la ligne (PK < 616)",
        "Aucune LTV sur le reste de la ligne."
      )}
    </div>
  );
}

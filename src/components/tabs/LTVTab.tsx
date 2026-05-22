import { useCallback } from "react";
import {
  getLtvInputMode,
  getLtvNormalizedRowBackground,
  formatLtvDateTimeForDisplay,
  normalizeLtvCode,
  LTV_TABLE_HEADERS,
  LTV_TEXT_FIELDS_BEFORE_FLAGS,
  LTV_FLAG_FIELDS,
  LTV_ADIF_REFERENCE_LINE,
} from "../../modules/ft-editor/utils/ftEditorUtils";
import type {
  LtvEditorRow,
  LtvEditorTextField,
  LtvEditorFlagField,
} from "../../modules/ft-editor/utils/ftEditorUtils";

type LtvNormalizedFileInfo = {
  publishedAt: string;
  source: string;
  fetchedAt: string;
  sourceUpdatedAt: string | null;
  sourceUpdatedFile: string | null;
  warningCount: number;
};

type Props = {
  // Normalized table state
  ltvNormalizedStatus: "idle" | "loading" | "success" | "error";
  ltvNormalizedMessage: string;
  ltvNormalizedFileInfo: LtvNormalizedFileInfo | null;
  ltvNormalizedRows: LtvEditorRow[];
  draggedLtvRowId: string | null;
  dragOverLtvRowId: string | null;
  importedLtvCodeSet: Set<string>;

  // ADIF table state
  ltvAdifRows: LtvEditorRow[];
  ltvAdifStatus: "idle" | "loading" | "success" | "error";
  ltvAdifMessage: string;
  ltvAdifOtherRows: LtvEditorRow[];

  // Normalized row handlers
  onAddLtvNormalizedRow: () => void;
  onRequestDeleteLtvNormalizedRow: (rowId: string) => void;
  onStartLtvRowDrag: (rowId: string) => void;
  onEnterLtvRowDrag: (rowId: string) => void;
  onDropLtvRow: (rowId: string) => void;
  onCancelLtvRowDrag: () => void;

  // Cell edit handlers
  onUpdateLtvTextField: (rowId: string, field: LtvEditorTextField, value: string) => void;
  onNormalizeLtvCodeField: (rowId: string) => void;
  onNormalizeLtvKmField: (rowId: string, field: "kmIni" | "kmFin") => void;
  onToggleLtvFlagField: (rowId: string, field: LtvEditorFlagField) => void;

  // ADIF import handler
  onImportLtvAdifRow: (row: LtvEditorRow) => void;
};

export default function LTVTab({
  ltvNormalizedStatus,
  ltvNormalizedMessage,
  ltvNormalizedFileInfo,
  ltvNormalizedRows,
  draggedLtvRowId,
  dragOverLtvRowId,
  importedLtvCodeSet,
  ltvAdifRows,
  ltvAdifStatus,
  ltvAdifMessage,
  ltvAdifOtherRows,
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
  onImportLtvAdifRow,
}: Props) {
  const renderLtvTextCell = useCallback(
    (row: LtvEditorRow, field: LtvEditorTextField) => {
      const background =
        row.origin === "adif" && row.editedFields?.[field]
          ? "#eff6ff"
          : getLtvNormalizedRowBackground(row);

      return (
        <td
          key={`${row.id}-${field}`}
          style={{
            border: "1px solid #d1d5db",
            padding: 0,
            background,
            verticalAlign: "top",
          }}
        >
          <textarea
            inputMode={getLtvInputMode(field)}
            value={row[field]}
            onChange={(event) =>
              onUpdateLtvTextField(row.id, field, event.target.value)
            }
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
      );
    },
    [onNormalizeLtvCodeField, onNormalizeLtvKmField, onUpdateLtvTextField]
  );

  const renderLtvFlagCell = useCallback(
    (row: LtvEditorRow, field: LtvEditorFlagField) => {
      const isChecked = row[field];
      const background =
        row.origin === "adif" && row.editedFields?.[field]
          ? "#eff6ff"
          : getLtvNormalizedRowBackground(row);

      return (
        <td
          key={`${row.id}-${field}`}
          style={{
            border: "1px solid #d1d5db",
            padding: 0,
            background,
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
    [onToggleLtvFlagField]
  );

  const renderLtvReadonlyTextCell = useCallback(
    (
      row: LtvEditorRow,
      field: LtvEditorTextField,
      options: { background?: string; color?: string } = {}
    ) => (
      <td
        key={`${row.id}-${field}`}
        style={{
          border: "1px solid #d1d5db",
          padding: "8px 6px",
          background: options.background ?? "#ffffff",
          color: options.color ?? "#111827",
          verticalAlign: "top",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {row[field]}
      </td>
    ),
    []
  );

  const renderLtvReadonlyFlagCell = useCallback(
    (
      row: LtvEditorRow,
      field: LtvEditorFlagField,
      options: {
        background?: string;
        checkedColor?: string;
        uncheckedColor?: string;
      } = {}
    ) => (
      <td
        key={`${row.id}-${field}`}
        style={{
          border: "1px solid #d1d5db",
          padding: "8px 6px",
          background: options.background ?? "#ffffff",
          color: row[field]
            ? options.checkedColor ?? "#1d4ed8"
            : options.uncheckedColor ?? "#9ca3af",
          verticalAlign: "middle",
          textAlign: "center",
          fontWeight: 800,
        }}
      >
        {row[field] ? "✓" : ""}
      </td>
    ),
    []
  );

  const renderLtvReadonlyTableRows = useCallback(
    (
      rows: LtvEditorRow[],
      emptyMessage: string,
      isError = false,
      allowImport = false
    ) =>
      rows.length === 0 ? (
        <tr>
          <td
            colSpan={18}
            style={{
              border: "1px solid #d1d5db",
              padding: 18,
              textAlign: "center",
              color: isError ? "#991b1b" : "#6b7280",
              background: isError ? "#fef2f2" : "#ffffff",
              fontWeight: 500,
            }}
          >
            {emptyMessage}
          </td>
        </tr>
      ) : (
        rows.map((row) => {
          const isAlreadyImported = importedLtvCodeSet.has(normalizeLtvCode(row.code));
          const cellBackground = isAlreadyImported ? "#f9fafb" : "#ffffff";
          const textColor = isAlreadyImported ? "#6b7280" : "#111827";

          return (
            <tr
              key={row.id}
              style={{
                opacity: isAlreadyImported ? 0.7 : 1,
              }}
            >
              <td
                key={`${row.id}-adif-empty-action`}
                style={{
                  width: 64,
                  border: "1px solid #d1d5db",
                  padding: 0,
                  background: cellBackground,
                  verticalAlign: "middle",
                  textAlign: "center",
                }}
              />

              <td
                key={`${row.id}-adif-import`}
                style={{
                  width: 48,
                  border: "1px solid #d1d5db",
                  padding: 0,
                  background: cellBackground,
                  verticalAlign: "middle",
                  textAlign: "center",
                }}
              >
                {allowImport ? (
                  isAlreadyImported ? null : (
                    <button
                      type="button"
                      onClick={() => onImportLtvAdifRow(row)}
                      title="Importer cette LTV dans le tableau normalisé"
                      style={{
                        width: "100%",
                        minHeight: 32,
                        border: "none",
                        background: "transparent",
                        color: "#16a34a",
                        fontSize: 18,
                        fontWeight: 900,
                        cursor: "pointer",
                      }}
                    >
                      ↑
                    </button>
                  )
                ) : (
                  <button
                    type="button"
                    disabled
                    title="Import non disponible ici pour l'instant"
                    style={{
                      width: "100%",
                      minHeight: 32,
                      border: "none",
                      background: "transparent",
                      color: "#9ca3af",
                      fontSize: 18,
                      fontWeight: 900,
                      cursor: "not-allowed",
                    }}
                  >
                    ↑
                  </button>
                )}
              </td>

              {LTV_TEXT_FIELDS_BEFORE_FLAGS.map((field) =>
                renderLtvReadonlyTextCell(row, field, {
                  background: cellBackground,
                  color: textColor,
                })
              )}

              {LTV_FLAG_FIELDS.map((field) =>
                renderLtvReadonlyFlagCell(row, field, {
                  background: cellBackground,
                  checkedColor: isAlreadyImported ? "#6b7280" : "#1d4ed8",
                  uncheckedColor: "#9ca3af",
                })
              )}

              {renderLtvReadonlyTextCell(row, "observaciones", {
                background: cellBackground,
                color: textColor,
              })}
            </tr>
          );
        })
      ),
    [
      onImportLtvAdifRow,
      importedLtvCodeSet,
      renderLtvReadonlyFlagCell,
      renderLtvReadonlyTextCell,
    ]
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      {/* Tableau LTV normalisé */}
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
          <div>
            <div
              style={{
                fontSize: 22,
                fontWeight: 700,
                marginBottom: 4,
              }}
            >
              Tableau LTV normalisé
            </div>
            <div
              style={{
                color:
                  ltvNormalizedStatus === "error"
                    ? "#991b1b"
                    : ltvNormalizedStatus === "success"
                      ? "#166534"
                      : "#4b5563",
                fontSize: 14,
                fontWeight:
                  ltvNormalizedStatus === "error" ? 600 : 400,
                lineHeight: 1.5,
              }}
            >
              <div>
                {ltvNormalizedMessage}
                {ltvNormalizedFileInfo ? (
                  <>
                    {" "}
                    Publié le{" "}
                    {formatLtvDateTimeForDisplay(
                      ltvNormalizedFileInfo.publishedAt
                    )}
                  </>
                ) : null}
              </div>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
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
              {ltvNormalizedRows.length} LTV normalisée
              {ltvNormalizedRows.length > 1 ? "s" : ""}
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
              {ltvNormalizedRows.length === 0 ? (
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
                    Aucune LTV normalisée pour le moment.
                  </td>
                </tr>
              ) : (
                ltvNormalizedRows.map((row) => {
                  const isDragged = draggedLtvRowId === row.id;
                  const isDragTarget =
                    dragOverLtvRowId === row.id &&
                    draggedLtvRowId !== row.id;
                  const normalizedRowBackground =
                    getLtvNormalizedRowBackground(row);

                  return (
                    <tr
                      key={row.id}
                      onDragOver={(event) => {
                        if (draggedLtvRowId == null) {
                          return;
                        }

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
                        outline: isDragTarget
                          ? "2px solid #2563eb"
                          : "none",
                        outlineOffset: -2,
                      }}
                    >
                      <td
                        key={`${row.id}-actions`}
                        style={{
                          width: 64,
                          border: "1px solid #d1d5db",
                          padding: 0,
                          background: normalizedRowBackground,
                          verticalAlign: "middle",
                          textAlign: "center",
                        }}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            onRequestDeleteLtvNormalizedRow(row.id)
                          }
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
                          background: normalizedRowBackground,
                          verticalAlign: "middle",
                          textAlign: "center",
                        }}
                      >
                        <div
                          draggable
                          onDragStart={(event) => {
                            event.dataTransfer.effectAllowed = "move";
                            event.dataTransfer.setData(
                              "text/plain",
                              row.id
                            );
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

                      {LTV_FLAG_FIELDS.map((field) =>
                        renderLtvFlagCell(row, field)
                      )}

                      {renderLtvTextCell(row, "observaciones")}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Tableau LTV ADIF — Barcelona/Figueras */}
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
          <div>
            <div
              style={{
                fontSize: 22,
                fontWeight: 700,
                marginBottom: 4,
              }}
            >
              Tableau LTV ADIF — Barcelona/Figueras
            </div>
            <div
              style={{
                color:
                  ltvAdifStatus === "error"
                    ? "#991b1b"
                    : ltvAdifStatus === "success"
                      ? "#166534"
                      : "#4b5563",
                fontSize: 14,
                fontWeight: ltvAdifStatus === "error" ? 600 : 400,
              }}
            >
              {ltvAdifMessage}
            </div>
          </div>

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
            {ltvAdifRows.length} LTV ADIF
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
                  {" "}
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
                  ↑
                </th>

                {LTV_TABLE_HEADERS.map((header) => (
                  <th
                    key={`adif-${header}`}
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
              {renderLtvReadonlyTableRows(
                ltvAdifRows,
                ltvAdifStatus === "loading"
                  ? "Chargement des LTV ADIF..."
                  : ltvAdifStatus === "error"
                    ? ltvAdifMessage
                    : `Aucune LTV ADIF ligne ${LTV_ADIF_REFERENCE_LINE} Barcelona/Figueras chargée pour le moment.`,
                ltvAdifStatus === "error",
                true
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Autres LTV ADIF */}
      <div
        style={{
          padding: 16,
          border: "1px solid #d1d5db",
          borderRadius: 16,
          background: "#ffffff",
          color: "#111827",
          opacity: 0.9,
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
          <div>
            <div
              style={{
                fontSize: 22,
                fontWeight: 700,
                marginBottom: 4,
              }}
            >
              Autres LTV ADIF ligne {LTV_ADIF_REFERENCE_LINE}
            </div>
            <div style={{ color: "#4b5563", fontSize: 14 }}>
              LTV ADIF hors section Barcelona/Figueras. Tableau de
              contrôle, import non fonctionnel pour l'instant.
            </div>
          </div>

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
            {ltvAdifOtherRows.length} autre
            {ltvAdifOtherRows.length > 1 ? "s" : ""} LTV ADIF
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
                  {" "}
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
                  ↑
                </th>

                {LTV_TABLE_HEADERS.map((header) => (
                  <th
                    key={`adif-other-${header}`}
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
              {renderLtvReadonlyTableRows(
                ltvAdifOtherRows,
                `Aucune autre LTV ADIF ligne ${LTV_ADIF_REFERENCE_LINE} chargée pour le moment.`
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

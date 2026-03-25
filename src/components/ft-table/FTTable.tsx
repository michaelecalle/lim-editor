import "./FTTable.css";
import { useState, type ReactNode } from "react";
import type {
  EditorDirectField,
  EditorFtRowView,
} from "../../modules/ft-editor/types/viewTypes";
import {
  FT_COLUMNS,
  type FTColumnKey,
} from "../../modules/ft-editor/constants/ftColumns";

type FTTableProps = {
  title?: string;
  directionLabel: string;
  sourceStatus: "idle" | "loading" | "success" | "error";
  remoteInfo: string;
  inspectionLines: string[];
  sourceArrayName: string;
  rowCount: number;
  firstRowPreview: string;
  lastRowPreview: string;
  rows: EditorFtRowView[];
  columns?: readonly FTColumnKey[];
  dimHoraireColumns?: boolean;
  selectedRowId: string | null;
  onRowSelect: (row: EditorFtRowView) => void;
  onCellEditRequest: (
    row: EditorFtRowView,
    field: EditorDirectField | null
  ) => void;
  onInlineComCommit?: (rowId: string, nextCom: string) => void;
  onInlineHoraCommit?: (rowId: string, nextHora: string) => void;
  onInlineTecnCommit?: (rowId: string, nextTecn: string) => void;
  onInlineConcCommit?: (rowId: string, nextConc: string) => void;
};

const NOTE_START_COLUMN_INDEX = 5;

function sanitizePositiveIntegerInput(value: string): string {
  return value.replace(/\D/g, "");
}

function normalizePositiveIntegerValue(value: string): string {
  const digits = sanitizePositiveIntegerInput(value);

  if (digits === "") {
    return "";
  }

  const normalized = String(Number(digits));

  if (normalized === "0") {
    return "";
  }

  return normalized;
}

function sanitizeNonNegativeIntegerInput(value: string): string {
  return value.replace(/\D/g, "");
}

function normalizeNonNegativeIntegerValue(value: string): string {
  const digits = sanitizeNonNegativeIntegerInput(value);

  if (digits === "") {
    return "";
  }

  return String(Number(digits));
}

function sanitizeHoraInput(value: string): string {
  return value.replace(/\D/g, "").slice(0, 4);
}

function formatHoraDigits(value: string): string {
  const digits = sanitizeHoraInput(value);

  if (digits.length === 0) {
    return "";
  }

  if (digits.length <= 2) {
    return digits;
  }

  const minutes = digits.slice(-2);
  const hours = digits.slice(0, -2);

  return `${hours}:${minutes}`;
}

function getDirectFieldForColumn(column: FTColumnKey): EditorDirectField | null {
  switch (column) {
    case "PK interne":
      return "pkInternal";
    case "Réseau":
      return "network";
    case "Sit Km":
      return "pkDisplay";
    case "Dependencia":
      return "dependencia";
    case "Bloqueo":
      return "bloqueo";
    case "V Max":
      return "vmax";
    case "Radio":
      return "radio";
    case "Ramp Caract":
      return "rc";
    case "ETCS":
      return "etcs";
    default:
      return null;
  }
}

function getRawCellValue(row: EditorFtRowView, column: FTColumnKey): string {
  switch (column) {
    case "PK interne":
      return row.visible.pkInternalDisplay;
    case "Réseau":
      return row.visible.networkDisplay;
    case "Bloqueo":
      return row.visible.bloqueo;
    case "V Max":
      return row.visible.vmax;
    case "Sit Km":
      return row.visible.pkDisplay;
    case "Dependencia":
      return row.visible.dependencia;
    case "Com":
      return row.visible.com;
    case "Hora":
      return row.visible.hora;
    case "Técn":
      return row.visible.tecn;
    case "Conc":
      return row.visible.conc;
    case "Radio":
      return row.visible.radio;
    case "Ramp Caract":
      return row.visible.rc;
    case "ETCS":
      return row.visible.etcs;
    default:
      return "";
  }
}

function isBarColumn(column: FTColumnKey): boolean {
  return (
    column === "Réseau" ||
    column === "Bloqueo" ||
    column === "V Max" ||
    column === "Ramp Caract"
  );
}

function isHoraireColumn(column: FTColumnKey): boolean {
  return (
    column === "Com" ||
    column === "Hora" ||
    column === "Técn" ||
    column === "Conc"
  );
}

function buildCalculatedNetworkBarMap(
  rows: EditorFtRowView[]
): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  let previousDataNetwork = "";
  let hasPreviousDataRow = false;

  for (const row of rows) {
    if (row.visual.isNoteOnly) {
      result[row.id] = false;
      continue;
    }

    const currentNetwork = row.visible.networkDisplay.trim();

    if (!hasPreviousDataRow) {
      result[row.id] = false;
      previousDataNetwork = currentNetwork;
      hasPreviousDataRow = true;
      continue;
    }

    result[row.id] = currentNetwork !== previousDataNetwork;
    previousDataNetwork = currentNetwork;
  }

  return result;
}

function buildCalculatedRcBarMap(rows: EditorFtRowView[]): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  let previousDataRc = "";
  let hasPreviousDataRow = false;

  for (const row of rows) {
    if (row.visual.isNoteOnly) {
      result[row.id] = false;
      continue;
    }

    const currentRc = row.visible.rc.trim();

    if (!hasPreviousDataRow) {
      result[row.id] = false;
      previousDataRc = currentRc;
      hasPreviousDataRow = true;
      continue;
    }

    result[row.id] = currentRc !== previousDataRc;
    previousDataRc = currentRc;
  }

  return result;
}

function buildEffectiveVmaxMap(rows: EditorFtRowView[]): Record<string, string> {
  const result: Record<string, string> = {};
  let previousDataVmax = "";

  for (const row of rows) {
    if (row.visual.isNoteOnly) {
      result[row.id] = "";
      continue;
    }

    const rawVmax = row.visible.vmax.trim();

    if (rawVmax !== "") {
      previousDataVmax = rawVmax;
      result[row.id] = rawVmax;
      continue;
    }

    result[row.id] = previousDataVmax;
  }

  return result;
}

function buildCalculatedVmaxBarMap(
  rows: EditorFtRowView[],
  effectiveVmaxMap: Record<string, string>
): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  let previousEffectiveVmax = "";
  let hasPreviousDataRow = false;

  for (const row of rows) {
    if (row.visual.isNoteOnly) {
      result[row.id] = false;
      continue;
    }

    const currentEffectiveVmax = effectiveVmaxMap[row.id] ?? "";

    if (!hasPreviousDataRow) {
      result[row.id] = false;
      previousEffectiveVmax = currentEffectiveVmax;
      hasPreviousDataRow = true;
      continue;
    }

    result[row.id] = currentEffectiveVmax !== previousEffectiveVmax;
    previousEffectiveVmax = currentEffectiveVmax;
  }

  return result;
}

function buildEffectiveBloqueoMap(rows: EditorFtRowView[]): Record<string, string> {
  const result: Record<string, string> = {};
  let previousDataBloqueo = "";

  for (const row of rows) {
    if (row.visual.isNoteOnly) {
      result[row.id] = "";
      continue;
    }

    const rawBloqueo = row.visible.bloqueo.trim();

    if (rawBloqueo !== "") {
      previousDataBloqueo = rawBloqueo;
      result[row.id] = rawBloqueo;
      continue;
    }

    result[row.id] = previousDataBloqueo;
  }

  return result;
}

function buildCalculatedBloqueoBarMap(
  rows: EditorFtRowView[],
  effectiveBloqueoMap: Record<string, string>
): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  let previousEffectiveBloqueo = "";
  let hasPreviousDataRow = false;

  for (const row of rows) {
    if (row.visual.isNoteOnly) {
      result[row.id] = false;
      continue;
    }

    const currentEffectiveBloqueo = effectiveBloqueoMap[row.id] ?? "";

    if (!hasPreviousDataRow) {
      result[row.id] = false;
      previousEffectiveBloqueo = currentEffectiveBloqueo;
      hasPreviousDataRow = true;
      continue;
    }

    result[row.id] = currentEffectiveBloqueo !== previousEffectiveBloqueo;
    previousEffectiveBloqueo = currentEffectiveBloqueo;
  }

  return result;
}

function hasBarForColumn(
  row: EditorFtRowView,
  column: FTColumnKey,
  calculatedNetworkBarMap: Record<string, boolean>,
  calculatedRcBarMap: Record<string, boolean>,
  calculatedVmaxBarMap: Record<string, boolean>,
  calculatedBloqueoBarMap: Record<string, boolean>
): boolean {
  switch (column) {
    case "Réseau":
      return calculatedNetworkBarMap[row.id] ?? false;
    case "Bloqueo":
      return calculatedBloqueoBarMap[row.id] ?? false;
    case "V Max":
      return calculatedVmaxBarMap[row.id] ?? false;
    case "Ramp Caract":
      return calculatedRcBarMap[row.id] ?? false;
    default:
      return false;
  }
}

function getRenderedCellValue(
  row: EditorFtRowView,
  column: FTColumnKey,
  effectiveVmaxMap: Record<string, string>,
  effectiveBloqueoMap: Record<string, string>,
  inlineHoraValues: Record<string, string>
): string {
  if (column === "V Max") {
    return effectiveVmaxMap[row.id] ?? "";
  }

  if (column === "Bloqueo") {
    return effectiveBloqueoMap[row.id] ?? "";
  }

  if (column === "Hora") {
    const inlineValue = inlineHoraValues[row.id];

    if (inlineValue !== undefined) {
      return inlineValue;
    }
  }

  return getRawCellValue(row, column);
}

function renderCellContent(
  row: EditorFtRowView,
  column: FTColumnKey,
  calculatedNetworkBarMap: Record<string, boolean>,
  calculatedRcBarMap: Record<string, boolean>,
  calculatedVmaxBarMap: Record<string, boolean>,
  calculatedBloqueoBarMap: Record<string, boolean>,
  effectiveVmaxMap: Record<string, string>,
  effectiveBloqueoMap: Record<string, string>,
  inlineHoraValues: Record<string, string>
): ReactNode {
  const value = getRenderedCellValue(
    row,
    column,
    effectiveVmaxMap,
    effectiveBloqueoMap,
    inlineHoraValues
  );
  const hasBar = hasBarForColumn(
    row,
    column,
    calculatedNetworkBarMap,
    calculatedRcBarMap,
    calculatedVmaxBarMap,
    calculatedBloqueoBarMap
  );

  const isCsvVmaxCell = column === "V Max" && row.technical.csv === true;
  const isConcCell = column === "Conc";

  const concStyle =
    isConcCell && row.visual.concTone === "computed"
      ? { color: "#2563eb", fontWeight: 600 }
      : isConcCell && row.visual.concTone === "manualOverride"
        ? { color: "#dc2626", fontWeight: 600 }
        : undefined;

  if (hasBar && value) {
    return (
      <div
        className={
          isCsvVmaxCell ? "ft-cell-stack ft-cell-stack--csv-vmax" : "ft-cell-stack"
        }
      >
        <div className="ft-cell-bar" />
        <span style={concStyle}>{value}</span>
      </div>
    );
  }

  if (hasBar && isBarColumn(column)) {
    return (
      <div
        className={isCsvVmaxCell ? "ft-cell-stack ft-cell-stack--csv-vmax" : undefined}
      >
        <div className="ft-cell-bar" />
      </div>
    );
  }

  if (!value) {
    return isCsvVmaxCell ? (
      <span className="ft-cell-empty ft-cell-empty--csv-vmax">—</span>
    ) : (
      <span className="ft-cell-empty">—</span>
    );
  }

  if (isCsvVmaxCell) {
    return (
      <span className="ft-cell-text--csv-vmax" style={concStyle}>
        {value}
      </span>
    );
  }

  if (concStyle) {
    return <span style={concStyle}>{value}</span>;
  }

  return value;
}

export default function FTTable({
  title = "Tableau FT",
  directionLabel,
  sourceStatus,
  remoteInfo,
  inspectionLines,
  sourceArrayName,
  rowCount,
  firstRowPreview,
  lastRowPreview,
  rows,
  columns = FT_COLUMNS,
  dimHoraireColumns = true,
  selectedRowId,
  onRowSelect,
  onCellEditRequest,
  onInlineComCommit,
  onInlineHoraCommit,
  onInlineTecnCommit,
  onInlineConcCommit,
}: FTTableProps) {
  const calculatedNetworkBarMap = buildCalculatedNetworkBarMap(rows);
  const calculatedRcBarMap = buildCalculatedRcBarMap(rows);
  const effectiveVmaxMap = buildEffectiveVmaxMap(rows);
  const calculatedVmaxBarMap = buildCalculatedVmaxBarMap(
    rows,
    effectiveVmaxMap
  );
  const effectiveBloqueoMap = buildEffectiveBloqueoMap(rows);
  const calculatedBloqueoBarMap = buildCalculatedBloqueoBarMap(
    rows,
    effectiveBloqueoMap
  );
  const displayedColumns = columns;
  const [editingCell, setEditingCell] = useState<{
    rowId: string;
    column: "Com" | "Hora" | "Técn" | "Conc";
  } | null>(null);
  const [editingInlineInput, setEditingInlineInput] = useState("");

  function getNextInlineValue(
    row: EditorFtRowView,
    column: "Com" | "Hora" | "Técn" | "Conc"
  ): string {
    if (column === "Hora") {
      return sanitizeHoraInput(row.visible.hora ?? "");
    }

    if (column === "Conc") {
      return sanitizeNonNegativeIntegerInput(row.visible.conc ?? "");
    }

    if (column === "Com") {
      return sanitizePositiveIntegerInput(row.visible.com ?? "");
    }

    return sanitizePositiveIntegerInput(row.visible.tecn ?? "");
  }

  function commitInlineValue(
    row: EditorFtRowView,
    column: "Com" | "Hora" | "Técn" | "Conc",
    rawInput: string
  ): void {
    if (column === "Com") {
      const normalizedValue = normalizePositiveIntegerValue(rawInput);
      onInlineComCommit?.(row.id, normalizedValue);
      return;
    }

    if (column === "Hora") {
      const formattedValue = formatHoraDigits(rawInput);
      onInlineHoraCommit?.(row.id, formattedValue);
      return;
    }

    if (column === "Técn") {
      const normalizedValue = normalizePositiveIntegerValue(rawInput);
      onInlineTecnCommit?.(row.id, normalizedValue);
      return;
    }

    const normalizedValue = normalizeNonNegativeIntegerValue(rawInput);
    onInlineConcCommit?.(row.id, normalizedValue);
  }

  function moveToNextInlineCell(
    currentRowId: string,
    column: "Com" | "Hora" | "Técn" | "Conc"
  ): void {
    const currentRowIndex = rows.findIndex((row) => row.id === currentRowId);

    if (currentRowIndex === -1) {
      setEditingCell(null);
      setEditingInlineInput("");
      return;
    }

    const nextRow = rows.find((row, index) => {
      if (index <= currentRowIndex) {
        return false;
      }

      if (row.visual.isNoteOnly) {
        return false;
      }

      return row.visible.dependencia.trim() !== "";
    });

    if (!nextRow) {
      setEditingCell(null);
      setEditingInlineInput("");
      return;
    }

    setEditingCell({
      rowId: nextRow.id,
      column,
    });
    setEditingInlineInput(getNextInlineValue(nextRow, column));
    onRowSelect(nextRow);
  }

  return (
    <div className="ft-table-placeholder">
      <div className="ft-table-placeholder__title">{title}</div>

      <div className="ft-table-v0-wrapper">
        <table className="ft-table-v0">
          <thead>
            <tr>
              {displayedColumns.map((column) => {
                const dimCell = dimHoraireColumns && isHoraireColumn(column);

                return (
                  <th
                    key={column}
                    style={
                      dimCell
                        ? {
                            background: "#e5e7eb",
                            color: "#6b7280",
                          }
                        : undefined
                    }
                  >
                    {column}
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {rows.map((row) => {
              const isSelected = row.id === selectedRowId;
              const rowClassName = isSelected ? "ft-table-v0__row--selected" : "";

              if (row.visual.isNoteOnly) {
                return (
                  <tr
                    key={row.id}
                    className={`ft-table-v0__note-row ${rowClassName}`.trim()}
                    onClick={() => onRowSelect(row)}
                  >
                    {displayedColumns
                      .slice(0, NOTE_START_COLUMN_INDEX)
                      .map((column) => (
                        <td
                          key={`${row.id}-${column}-empty-note-prefix`}
                          className="ft-note-prefix-cell"
                        />
                      ))}

                    <td
                      colSpan={displayedColumns.length - NOTE_START_COLUMN_INDEX}
                      className="ft-note-cell"
                    >
                      <div className="ft-note-row-content">
                        {row.visible.noteDisplay || "Note sans contenu"}
                      </div>
                    </td>
                  </tr>
                );
              }

              return (
                <tr
                  key={row.id}
                  className={rowClassName}
                  onClick={() => onRowSelect(row)}
                >
                  {displayedColumns.map((column) => {
                    const isHoraire = isHoraireColumn(column);
                    const dimCell = dimHoraireColumns && isHoraire;
                    const directField = getDirectFieldForColumn(column);
                    const isInlineComEditable = column === "Com" && !dimCell;
                    const isInlineHoraEditable = column === "Hora" && !dimCell;
                    const isInlineTecnEditable = column === "Técn" && !dimCell;
                    const isInlineConcEditable = column === "Conc" && !dimCell;
                    const isInlineEditable =
                      isInlineComEditable ||
                      isInlineHoraEditable ||
                      isInlineTecnEditable ||
                      isInlineConcEditable;
                    const isEditingInline =
                      editingCell != null &&
                      editingCell.rowId === row.id &&
                      editingCell.column === column;

                    return (
                      <td
                        key={`${row.id}-${column}`}
                        onClick={(event) => {
                          event.stopPropagation();

                          if (dimCell) {
                            return;
                          }

                          if (isInlineComEditable) {
                            const currentValue = row.visible.com ?? "";

                            setEditingCell({ rowId: row.id, column: "Com" });
                            setEditingInlineInput(
                              sanitizePositiveIntegerInput(currentValue)
                            );
                            onRowSelect(row);
                            return;
                          }

                          if (isInlineHoraEditable) {
                            const currentValue = row.visible.hora ?? "";

                            setEditingCell({ rowId: row.id, column: "Hora" });
                            setEditingInlineInput(
                              sanitizeHoraInput(currentValue)
                            );
                            onRowSelect(row);
                            return;
                          }

                          if (isInlineTecnEditable) {
                            const currentValue = row.visible.tecn ?? "";

                            setEditingCell({ rowId: row.id, column: "Técn" });
                            setEditingInlineInput(
                              sanitizePositiveIntegerInput(currentValue)
                            );
                            onRowSelect(row);
                            return;
                          }

                          if (isInlineConcEditable) {
                            const currentValue = row.visible.conc ?? "";

                            setEditingCell({ rowId: row.id, column: "Conc" });
                            setEditingInlineInput(
                              sanitizeNonNegativeIntegerInput(currentValue)
                            );
                            onRowSelect(row);
                            return;
                          }

                          onCellEditRequest(row, directField);
                        }}
                        style={
                          dimCell
                            ? {
                                cursor: "default",
                                background: "#f3f4f6",
                                color: "#6b7280",
                              }
                            : isInlineEditable
                              ? { cursor: "text" }
                              : { cursor: "pointer" }
                        }
                      >
                        {isEditingInline ? (
                          <input
                            type="text"
                            inputMode="numeric"
                            autoFocus
                            value={editingInlineInput}
                            onChange={(event) => {
                              if (column === "Hora") {
                                setEditingInlineInput(
                                  sanitizeHoraInput(event.target.value)
                                );
                                return;
                              }

                              if (column === "Conc") {
                                setEditingInlineInput(
                                  sanitizeNonNegativeIntegerInput(
                                    event.target.value
                                  )
                                );
                                return;
                              }

                              setEditingInlineInput(
                                sanitizePositiveIntegerInput(event.target.value)
                              );
                            }}
                            onBlur={() => {
                              commitInlineValue(row, column, editingInlineInput);
                              setEditingCell(null);
                              setEditingInlineInput("");
                            }}
                            onClick={(event) => {
                              event.stopPropagation();
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                commitInlineValue(row, column, editingInlineInput);
                                moveToNextInlineCell(row.id, column);
                                return;
                              }

                              if (event.key === "Escape") {
                                setEditingCell(null);
                                setEditingInlineInput("");
                              }
                            }}
                            style={{
                              width:
                                column === "Hora"
                                  ? 60
                                  : 48,
                              boxSizing: "border-box",
                              padding: "4px 6px",
                            }}
                          />
                        ) : (
                          renderCellContent(
                            row,
                            column,
                            calculatedNetworkBarMap,
                            calculatedRcBarMap,
                            calculatedVmaxBarMap,
                            calculatedBloqueoBarMap,
                            effectiveVmaxMap,
                            effectiveBloqueoMap,
                            {}
                          )
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="ft-table-placeholder__text">
        Sens sélectionné : <strong>{directionLabel}</strong>
      </div>

      <div className="ft-table-placeholder__text">
        Tableau source utilisé : <strong>{sourceArrayName}</strong>
      </div>

      <div className="ft-table-placeholder__text">
        État source distante : <strong>{sourceStatus}</strong>
      </div>

      <div className="ft-table-placeholder__text">
        Info source : <strong>{remoteInfo}</strong>
      </div>

      <div className="ft-table-placeholder__text">
        Diagnostic brut du fichier distant :
      </div>

      <ul className="ft-table-placeholder__list">
        {inspectionLines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>

      <div className="ft-table-placeholder__text">
        Nombre de lignes pour ce sens : <strong>{rowCount}</strong>
      </div>

      <div className="ft-table-placeholder__text">
        Aperçu première ligne : <strong>{firstRowPreview}</strong>
      </div>

      <div className="ft-table-placeholder__text">
        Aperçu dernière ligne : <strong>{lastRowPreview}</strong>
      </div>

      <div className="ft-table-placeholder__text">
        Aperçu tabulaire V0 :
      </div>
    </div>
  );
}
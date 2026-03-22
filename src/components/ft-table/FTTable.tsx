import "./FTTable.css";
import type { ReactNode } from "react";
import type {
  EditorDirectField,
  EditorFtRowView,
} from "../../modules/ft-editor/types/viewTypes";
import { FT_COLUMNS } from "../../modules/ft-editor/constants/ftColumns";

type FTTableProps = {
  directionLabel: string;
  sourceStatus: "idle" | "loading" | "success" | "error";
  remoteInfo: string;
  inspectionLines: string[];
  sourceArrayName: string;
  rowCount: number;
  firstRowPreview: string;
  lastRowPreview: string;
  rows: EditorFtRowView[];
  selectedRowId: string | null;
  onRowSelect: (row: EditorFtRowView) => void;
  onCellEditRequest: (
    row: EditorFtRowView,
    field: EditorDirectField | null
  ) => void;
};

const NOTE_START_COLUMN_INDEX = 5;

function getDirectFieldForColumn(
  column: (typeof FT_COLUMNS)[number]
): EditorDirectField | null {
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

function getRawCellValue(
  row: EditorFtRowView,
  column: (typeof FT_COLUMNS)[number]
): string {
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

function isBarColumn(column: (typeof FT_COLUMNS)[number]): boolean {
  return (
    column === "Réseau" ||
    column === "Bloqueo" ||
    column === "V Max" ||
    column === "Ramp Caract"
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
  column: (typeof FT_COLUMNS)[number],
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
  column: (typeof FT_COLUMNS)[number],
  effectiveVmaxMap: Record<string, string>,
  effectiveBloqueoMap: Record<string, string>
): string {
  if (column === "V Max") {
    return effectiveVmaxMap[row.id] ?? "";
  }

  if (column === "Bloqueo") {
    return effectiveBloqueoMap[row.id] ?? "";
  }

  return getRawCellValue(row, column);
}

function renderCellContent(
  row: EditorFtRowView,
  column: (typeof FT_COLUMNS)[number],
  calculatedNetworkBarMap: Record<string, boolean>,
  calculatedRcBarMap: Record<string, boolean>,
  calculatedVmaxBarMap: Record<string, boolean>,
  calculatedBloqueoBarMap: Record<string, boolean>,
  effectiveVmaxMap: Record<string, string>,
  effectiveBloqueoMap: Record<string, string>
): ReactNode {
  const value = getRenderedCellValue(
    row,
    column,
    effectiveVmaxMap,
    effectiveBloqueoMap
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

  if (hasBar && value) {
    return (
      <div
        className={
          isCsvVmaxCell ? "ft-cell-stack ft-cell-stack--csv-vmax" : "ft-cell-stack"
        }
      >
        <div className="ft-cell-bar" />
        <span>{value}</span>
      </div>
    );
  }

  if (hasBar && isBarColumn(column)) {
    return (
      <div className={isCsvVmaxCell ? "ft-cell-stack ft-cell-stack--csv-vmax" : undefined}>
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

  return isCsvVmaxCell ? <span className="ft-cell-text--csv-vmax">{value}</span> : value;
}

export default function FTTable({
  directionLabel,
  sourceStatus,
  remoteInfo,
  inspectionLines,
  sourceArrayName,
  rowCount,
  firstRowPreview,
  lastRowPreview,
  rows,
  selectedRowId,
  onRowSelect,
  onCellEditRequest,
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

  return (
    <div className="ft-table-placeholder">
      <div className="ft-table-placeholder__title">Tableau FT</div>

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

      <div className="ft-table-v0-wrapper">
        <table className="ft-table-v0">
          <thead>
            <tr>
              {FT_COLUMNS.map((column) => (
                <th key={column}>{column}</th>
              ))}
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
                    {FT_COLUMNS.slice(0, NOTE_START_COLUMN_INDEX).map((column) => (
                      <td
                        key={`${row.id}-${column}-empty-note-prefix`}
                        className="ft-note-prefix-cell"
                      />
                    ))}

                    <td
                      colSpan={FT_COLUMNS.length - NOTE_START_COLUMN_INDEX}
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
                  {FT_COLUMNS.map((column) => (
                    <td
                      key={`${row.id}-${column}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        onCellEditRequest(row, getDirectFieldForColumn(column));
                      }}
                      style={{ cursor: "pointer" }}
                    >
                      {renderCellContent(
                        row,
                        column,
                        calculatedNetworkBarMap,
                        calculatedRcBarMap,
                        calculatedVmaxBarMap,
                        calculatedBloqueoBarMap,
                        effectiveVmaxMap,
                        effectiveBloqueoMap
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="ft-table-placeholder__text">
        Zone centrale réservée au tableau principal.
      </div>
    </div>
  );
}

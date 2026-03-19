import {
  getSourceRowsForDirection,
  getSourceTableNameFromDirection,
} from "../../../data/ligneFTSource";
import type { FtSourceDirectionTables } from "../types/sourceTypes";
import type {
  EditorDirection,
  EditorFtRowView,
  EditorSourceTableName,
} from "../types/viewTypes";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readStringField(
  record: UnknownRecord,
  key: string,
  warnings: string[]
): string {
  const value = record[key];

  if (value == null) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    warnings.push(`Champ "${key}" converti en texte.`);
    return String(value);
  }

  warnings.push(`Champ "${key}" ignoré (type non géré).`);
  return "";
}

function readNullableNumberField(
  record: UnknownRecord,
  key: string,
  warnings: string[]
): number | null {
  const value = record[key];

  if (value == null || value === "") {
    return null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.replace(",", ".").trim();
    const parsed = Number(normalized);

    if (Number.isFinite(parsed)) {
      return parsed;
    }

    warnings.push(`Champ "${key}" non numérique ignoré.`);
    return null;
  }

  warnings.push(`Champ "${key}" non numérique ignoré.`);
  return null;
}

function readBooleanField(
  record: UnknownRecord,
  key: string,
  warnings: string[]
): boolean {
  const value = record[key];

  if (value == null) {
    return false;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    if (normalized === "true") {
      warnings.push(`Champ "${key}" converti depuis texte "true".`);
      return true;
    }

    if (normalized === "false") {
      warnings.push(`Champ "${key}" converti depuis texte "false".`);
      return false;
    }
  }

  warnings.push(`Champ "${key}" non booléen ignoré.`);
  return false;
}

function formatPk(value: number | null): string {
  if (value == null) {
    return "";
  }

  return value.toFixed(1);
}

function getEffectivePk(
  pkAdif: number | null,
  pkLfp: number | null,
  pkRfn: number | null,
  fallbackPk: number | null
): number | null {
  const candidates = [pkAdif, pkLfp, pkRfn].filter(
    (value): value is number => value != null
  );

  if (candidates.length > 0) {
    return Math.min(...candidates);
  }

  return fallbackPk;
}

function readNoteDisplay(record: UnknownRecord, warnings: string[]): string {
  const notes = record["notes"];

  const collected: string[] = [];

  if (Array.isArray(notes)) {
    for (const entry of notes) {
      if (typeof entry === "string" && entry.trim() !== "") {
        collected.push(entry.trim());
      } else if (entry != null) {
        warnings.push(`Entrée "notes" ignorée (type non géré).`);
      }
    }
  } else if (notes != null) {
    warnings.push(`Champ "notes" ignoré (type non géré).`);
  }

  return collected.join(" | ");
}

function buildEmptyRowView(
  rawRow: unknown,
  sourceTableName: EditorSourceTableName,
  sourceIndex: number,
  warnings: string[]
): EditorFtRowView {
  return {
    id: `${sourceTableName}-${sourceIndex}`,
    identity: {
      sourceTableName,
      sourceIndex,
    },
    visible: {
      pkInternalDisplay: "",
      networkDisplay: "",
      pkDisplay: "",
      dependencia: "",
      com: "",
      hora: "",
      tecn: "",
      conc: "",
      bloqueo: "",
      vmax: "",
      radio: "",
      rc: "",
      noteDisplay: "",
    },
    visual: {
      isNoteOnly: false,
      bloqueoBar: false,
      vmaxBar: false,
      vmaxHighlight: false,
      rcBar: false,
    },
    technical: {
      network: null,
      pkInternal: null,
      pkAdif: null,
      pkLfp: null,
      pkRfn: null,
      csv: false,
    },
    debug: {
      sourceRaw: rawRow,
      warnings,
    },
  };
}

function buildRowView(
  rawRow: unknown,
  sourceTableName: EditorSourceTableName,
  sourceIndex: number
): EditorFtRowView {
  const warnings: string[] = [];

  if (!isRecord(rawRow)) {
    warnings.push("Ligne source non exploitable : objet attendu.");
    return buildEmptyRowView(rawRow, sourceTableName, sourceIndex, warnings);
  }

  const type = readStringField(rawRow, "type", warnings);
  const pkInternal = readNullableNumberField(rawRow, "pkInterne", warnings);
  const pkAdif = readNullableNumberField(rawRow, "pkAdif", warnings);
  const pkLfp = readNullableNumberField(rawRow, "pkLfp", warnings);
  const pkRfn = readNullableNumberField(rawRow, "pkRfn", warnings);
  const sitKm = readNullableNumberField(rawRow, "sitKm", warnings);
  const csv = readBooleanField(rawRow, "csv", warnings);

  const reseau = readStringField(rawRow, "reseau", warnings).trim();
  const network = reseau !== "" ? reseau : null;

  const effectivePk = getEffectivePk(pkAdif, pkLfp, pkRfn, sitKm);

  const dependencia = readStringField(rawRow, "dependencia", warnings);
  const bloqueo = readStringField(rawRow, "bloqueo", warnings);
  const vmax = readStringField(rawRow, "vmax", warnings);
  const radio = readStringField(rawRow, "radio", warnings);
  const rc = readStringField(rawRow, "rampCaract", warnings);
  const noteDisplay = readNoteDisplay(rawRow, warnings);

  const isNoteOnly = type === "note";

  return {
    id:
      typeof rawRow["id"] === "string" && rawRow["id"].trim() !== ""
        ? rawRow["id"].trim()
        : `${sourceTableName}-${sourceIndex}`,
    identity: {
      sourceTableName,
      sourceIndex,
    },
    visible: {
      pkInternalDisplay: formatPk(pkInternal),
      networkDisplay: network ?? "",
      pkDisplay: formatPk(effectivePk),
      dependencia,
      com: "",
      hora: "",
      tecn: "",
      conc: "",
      bloqueo,
      vmax,
      radio,
      rc,
      noteDisplay,
    },
    visual: {
      isNoteOnly,
      bloqueoBar: false,
      vmaxBar: false,
      vmaxHighlight: false,
      rcBar: false,
    },
    technical: {
      network,
      pkInternal,
      pkAdif,
      pkLfp,
      pkRfn,
      csv,
    },
    debug: {
      sourceRaw: rawRow,
      warnings,
    },
  };
}

export function getDirectionRows(
  source: FtSourceDirectionTables,
  direction: EditorDirection
): EditorFtRowView[] {
  const sourceTableName = getSourceTableNameFromDirection(direction);
  const rawRows = getSourceRowsForDirection(source, direction);

  const mappedRows = rawRows.map((rawRow, sourceIndex) =>
    buildRowView(rawRow, sourceTableName, sourceIndex)
  );

  return direction === "NORD_SUD" ? [...mappedRows].reverse() : mappedRows;
}
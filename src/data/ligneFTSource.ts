import type { EditorDirection } from "../modules/ft-editor/types/viewTypes";
import type { FtSourceDirectionTables } from "../modules/ft-editor/types/sourceTypes";

export const LIGNE_FT_RAW_URL =
  "https://raw.githubusercontent.com/michaelecalle/lim-editor/main/src/data/ligneFT.normalized.ts";

export type RemoteFtSourceResult =
  | {
      ok: true;
      rawText: string;
    }
  | {
      ok: false;
      errorMessage: string;
    };

export type RawFtSourceInspection = {
  hasNormalizedExport: boolean;
  hasNordSudTable: boolean;
  hasSudNordTable: boolean;
  nordSudOccurrences: number;
  sudNordOccurrences: number;
};

export type ParsedFtSourceResult =
  | {
      ok: true;
      source: FtSourceDirectionTables;
    }
  | {
      ok: false;
      errorMessage: string;
    };

export type NormalizedFtSourceValidationResult = {
  isValid: boolean;
  diagnostics: string[];
  rowCountNordSud: number;
  rowCountSudNord: number;
};

export async function fetchRemoteFtSourceRaw(): Promise<RemoteFtSourceResult> {
  try {
const cacheBustedUrl = `${LIGNE_FT_RAW_URL}?t=${Date.now()}`;

const response = await fetch(cacheBustedUrl, {
  method: "GET",
  cache: "no-store",
});

    if (!response.ok) {
      return {
        ok: false,
        errorMessage: `HTTP ${response.status} ${response.statusText}`,
      };
    }

    const rawText = await response.text();

    return {
      ok: true,
      rawText,
    };
  } catch (error) {
    return {
      ok: false,
      errorMessage:
        error instanceof Error ? error.message : "Erreur réseau inconnue",
    };
  }
}

export function inspectRemoteFtSourceRaw(
  rawText: string
): RawFtSourceInspection {
  const nordSudMatches = rawText.match(/"nordSud"|nordSud/g) ?? [];
  const sudNordMatches = rawText.match(/"sudNord"|sudNord/g) ?? [];

  return {
    hasNormalizedExport: rawText.includes("export const LIGNE_FT_NORMALIZED"),
    hasNordSudTable: rawText.includes("nordSud"),
    hasSudNordTable: rawText.includes("sudNord"),
    nordSudOccurrences: nordSudMatches.length,
    sudNordOccurrences: sudNordMatches.length,
  };
}

function extractObjectLiteral(rawText: string, exportName: string): string | null {
  const marker = `export const ${exportName}`;
  const markerIndex = rawText.indexOf(marker);

  if (markerIndex === -1) {
    return null;
  }

  const equalsIndex = rawText.indexOf("=", markerIndex);

  if (equalsIndex === -1) {
    return null;
  }

  const firstBraceIndex = rawText.indexOf("{", equalsIndex);

  if (firstBraceIndex === -1) {
    return null;
  }

  let depth = 0;

  for (let index = firstBraceIndex; index < rawText.length; index += 1) {
    const char = rawText[index];

    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;

      if (depth === 0) {
        return rawText.slice(firstBraceIndex, index + 1);
      }
    }
  }

  return null;
}

function evaluateObjectLiteral(objectLiteral: string): FtSourceDirectionTables {
  const evaluator = new Function(`return (${objectLiteral});`);
  const value = evaluator();

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Le contenu extrait n'est pas un objet.");
  }

  const record = value as Record<string, unknown>;
  const nordSud = record["nordSud"];
  const sudNord = record["sudNord"];
  const trains = record["trains"];

  if (typeof nordSud !== "object" || nordSud === null || Array.isArray(nordSud)) {
    throw new Error('Le tableau "nordSud" est introuvable ou invalide.');
  }

  if (typeof sudNord !== "object" || sudNord === null || Array.isArray(sudNord)) {
    throw new Error('Le tableau "sudNord" est introuvable ou invalide.');
  }

  if (
    trains != null &&
    (typeof trains !== "object" || Array.isArray(trains))
  ) {
    throw new Error('Le champ "trains" est invalide.');
  }

  const nordSudRows = (nordSud as Record<string, unknown>)["rows"];
  const sudNordRows = (sudNord as Record<string, unknown>)["rows"];

  if (!Array.isArray(nordSudRows)) {
    throw new Error('Le champ "nordSud.rows" est invalide.');
  }

  if (!Array.isArray(sudNordRows)) {
    throw new Error('Le champ "sudNord.rows" est invalide.');
  }

  return {
    nordSud: {
      rows: nordSudRows,
    },
    sudNord: {
      rows: sudNordRows,
    },
    trains:
      trains != null ? (trains as FtSourceDirectionTables["trains"]) : undefined,
  };
}

export function parseFtSourceArraysFromRaw(
  rawText: string
): ParsedFtSourceResult {
  try {
    const normalizedLiteral = extractObjectLiteral(rawText, "LIGNE_FT_NORMALIZED");

    if (!normalizedLiteral) {
      return {
        ok: false,
        errorMessage: "Impossible d'extraire LIGNE_FT_NORMALIZED.",
      };
    }

    const source = evaluateObjectLiteral(normalizedLiteral);

    return {
      ok: true,
      source,
    };
  } catch (error) {
    return {
      ok: false,
      errorMessage:
        error instanceof Error
          ? error.message
          : "Erreur inconnue pendant le parsing du fichier FT normalisé.",
    };
  }
}

export function getSourceTableNameFromDirection(
  direction: EditorDirection
): "nordSud" | "sudNord" {
  return direction === "NORD_SUD" ? "nordSud" : "sudNord";
}

export function getSourceRowsForDirection(
  source: FtSourceDirectionTables,
  direction: EditorDirection
): unknown[] {
  const tableName = getSourceTableNameFromDirection(direction);
  return source[tableName].rows;
}

export function buildNormalizedFtSourceFileContent(
  source: FtSourceDirectionTables
): string {
  const serialized = JSON.stringify(source, null, 2);

  return [
    'import type { LigneFTNormalized } from "../types/ligneFTNormalized";',
    "",
    `export const LIGNE_FT_NORMALIZED: LigneFTNormalized = ${serialized};`,
    "",
  ].join("\n");
}

export function downloadTextFile(
  filename: string,
  content: string,
  mimeType = "text/plain;charset=utf-8"
): void {
  const blob = new Blob([content], { type: mimeType });
  const objectUrl = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(objectUrl);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateNormalizedFtSource(
  source: FtSourceDirectionTables
): NormalizedFtSourceValidationResult {
  const diagnostics: string[] = [];

  const nordSudRows = Array.isArray(source.nordSud?.rows) ? source.nordSud.rows : [];
  const sudNordRows = Array.isArray(source.sudNord?.rows) ? source.sudNord.rows : [];

  if (!Array.isArray(source.nordSud?.rows)) {
    diagnostics.push('Structure invalide : "nordSud.rows" absent ou invalide.');
  }

  if (!Array.isArray(source.sudNord?.rows)) {
    diagnostics.push('Structure invalide : "sudNord.rows" absent ou invalide.');
  }

  diagnostics.push(`Lignes nordSud : ${nordSudRows.length}`);
  diagnostics.push(`Lignes sudNord : ${sudNordRows.length}`);

  for (const [tableName, rows] of [
    ["nordSud", nordSudRows],
    ["sudNord", sudNordRows],
  ] as const) {
    rows.forEach((row, index) => {
      if (!isPlainObject(row)) {
        diagnostics.push(`${tableName}[${index}] invalide : objet attendu.`);
        return;
      }

      if (typeof row["id"] !== "string" || row["id"].trim() === "") {
        diagnostics.push(`${tableName}[${index}] invalide : id manquant ou vide.`);
      }

      if (typeof row["type"] !== "string" || row["type"].trim() === "") {
        diagnostics.push(`${tableName}[${index}] invalide : type manquant ou vide.`);
      }

      if (!Array.isArray(row["notes"])) {
        diagnostics.push(`${tableName}[${index}] invalide : notes doit être un tableau.`);
      }

      if (typeof row["csv"] !== "boolean") {
        diagnostics.push(`${tableName}[${index}] invalide : csv doit être booléen.`);
      }
    });
  }

  if (source.trains != null) {
    if (!isPlainObject(source.trains)) {
      diagnostics.push('Structure invalide : "trains" doit être un objet.');
    } else {
      for (const [trainNumber, trainData] of Object.entries(source.trains)) {
        if (!isPlainObject(trainData)) {
          diagnostics.push(`trains.${trainNumber} invalide : objet attendu.`);
          continue;
        }

        const meta = trainData["meta"];
        const byRowKey = trainData["byRowKey"];

        if (!isPlainObject(meta)) {
          diagnostics.push(`trains.${trainNumber}.meta invalide : objet attendu.`);
        } else {
          if (typeof meta["origine"] !== "string") {
            diagnostics.push(`trains.${trainNumber}.meta.origine invalide : chaîne attendue.`);
          }

          if (typeof meta["destination"] !== "string") {
            diagnostics.push(`trains.${trainNumber}.meta.destination invalide : chaîne attendue.`);
          }
        }

        if (!isPlainObject(byRowKey)) {
          diagnostics.push(`trains.${trainNumber}.byRowKey invalide : objet attendu.`);
          continue;
        }

        for (const [rowKey, rowData] of Object.entries(byRowKey)) {
          if (!isPlainObject(rowData)) {
            diagnostics.push(`trains.${trainNumber}.byRowKey.${rowKey} invalide : objet attendu.`);
            continue;
          }

          for (const fieldName of ["com", "hora", "tecn", "conc"] as const) {
            const fieldValue = rowData[fieldName];

            if (fieldValue != null && typeof fieldValue !== "string") {
              diagnostics.push(
                `trains.${trainNumber}.byRowKey.${rowKey}.${fieldName} invalide : chaîne attendue.`
              );
            }
          }
        }
      }
    }
  }

  const hasStructuralError = diagnostics.some(
    (line) =>
      line.includes("invalide") || line.includes("absent ou invalide")
  );

  return {
    isValid: !hasStructuralError,
    diagnostics,
    rowCountNordSud: nordSudRows.length,
    rowCountSudNord: sudNordRows.length,
  };
}
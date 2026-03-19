import * as fs from "node:fs";
import * as path from "node:path";

import type {
  LigneFTNormalized,
  FtLineCommon,
  FtLineType,
} from "../src/types/ligneFTNormalized";

// =========================
// Source distante legacy
// =========================

const LEGACY_LIGNE_FT_RAW_URL =
  "https://raw.githubusercontent.com/michaelecalle/limgpt/main/src/data/ligneFT.ts";

// =========================
// Types source minimaux locaux
// =========================

type FtSourceEntryLike = {
  pk?: unknown;
  dependencia?: unknown;
  network?: unknown;
  pk_rfn?: unknown;
  pk_lfp?: unknown;
  pk_adif?: unknown;
  pk_internal?: unknown;
  note?: unknown;
  notes?: unknown;
  isNoteOnly?: unknown;
  bloqueo?: unknown;
  radio?: unknown;
  vmax?: unknown;
  rc?: unknown;
};

type CsvSens = "PAIR" | "IMPAIR";

type CsvZoneLike = {
  sens?: unknown;
  pkFrom?: unknown;
  pkTo?: unknown;
  ignoreIfFirst?: unknown;
};

type LegacyParsedFtSourceResult =
  | {
      ok: true;
      source: {
        FT_LIGNE_PAIR: unknown[];
        FT_LIGNE_IMPAIR: unknown[];
        CSV_ZONES: unknown[];
      };
    }
  | {
      ok: false;
      errorMessage: string;
    };

// =========================
// Chemins
// =========================

const PROJECT_ROOT = process.cwd();
const OUTPUT_FILE = path.join(PROJECT_ROOT, "src", "data", "ligneFT.normalized.ts");
const ARCHIVE_DIR = path.join(PROJECT_ROOT, "src", "data", "archive");

// =========================
// Helpers
// =========================

function toStringValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value);
}

function toNotesArray(entry: FtSourceEntryLike): string[] {
  if (Array.isArray(entry?.notes)) {
    return entry.notes
      .map((note) => toStringValue(note))
      .filter((note) => note !== "");
  }

  const singleNote = toStringValue(entry?.note);
  return singleNote ? [singleNote] : [];
}

function buildId(prefix: "ns" | "sn", type: FtLineType, index: number): string {
  const padded = String(index).padStart(4, "0");
  return `${prefix}-${type}-${padded}`;
}

function getTimestampForFilename(): string {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");

  return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
}

function firstNonEmptyString(...values: unknown[]): string {
  for (const value of values) {
    const text = toStringValue(value).trim();
    if (text !== "") {
      return text;
    }
  }

  return "";
}

function toNumberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().replace(",", ".");
    if (normalized === "") {
      return null;
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function normalizeCsvSens(value: unknown): CsvSens | null {
  return value === "PAIR" || value === "IMPAIR" ? value : null;
}

function isPkWithinBounds(pk: number, boundA: number, boundB: number): boolean {
  const min = Math.min(boundA, boundB);
  const max = Math.max(boundA, boundB);
  return pk >= min && pk <= max;
}

function isEntryInCsvZone(
  entry: FtSourceEntryLike,
  csvSens: CsvSens,
  csvZones: CsvZoneLike[]
): boolean {
  const entryPk = toNumberValue(entry?.pk);

  if (entryPk === null) {
    return false;
  }

  return csvZones.some((zone) => {
    const zoneSens = normalizeCsvSens(zone?.sens);
    if (zoneSens !== csvSens) {
      return false;
    }

    const pkFrom = toNumberValue(zone?.pkFrom);
    const pkTo = toNumberValue(zone?.pkTo);

    if (pkFrom === null || pkTo === null) {
      return false;
    }

    return isPkWithinBounds(entryPk, pkFrom, pkTo);
  });
}

// =========================
// Fetch + parsing legacy
// =========================

async function fetchLegacyFtSourceRaw(): Promise<string> {
  const response = await fetch(LEGACY_LIGNE_FT_RAW_URL, {
    method: "GET",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }

  return response.text();
}

function extractArrayLiteral(rawText: string, exportName: string): string | null {
  const marker = `export const ${exportName}`;
  const markerIndex = rawText.indexOf(marker);

  if (markerIndex === -1) {
    return null;
  }

  const equalsIndex = rawText.indexOf("=", markerIndex);

  if (equalsIndex === -1) {
    return null;
  }

  const firstBracketIndex = rawText.indexOf("[", equalsIndex);

  if (firstBracketIndex === -1) {
    return null;
  }

  let depth = 0;

  for (let index = firstBracketIndex; index < rawText.length; index += 1) {
    const char = rawText[index];

    if (char === "[") {
      depth += 1;
    } else if (char === "]") {
      depth -= 1;

      if (depth === 0) {
        return rawText.slice(firstBracketIndex, index + 1);
      }
    }
  }

  return null;
}

function evaluateArrayLiteral(arrayLiteral: string): unknown[] {
  const evaluator = new Function(`return (${arrayLiteral});`);
  const value = evaluator();

  if (!Array.isArray(value)) {
    throw new Error("Le contenu extrait n'est pas un tableau.");
  }

  return value;
}

function parseLegacyFtSourceArraysFromRaw(
  rawText: string
): LegacyParsedFtSourceResult {
  try {
    const pairLiteral = extractArrayLiteral(rawText, "FT_LIGNE_PAIR");
    const impairLiteral = extractArrayLiteral(rawText, "FT_LIGNE_IMPAIR");
    const csvZonesLiteral = extractArrayLiteral(rawText, "CSV_ZONES");

    if (!pairLiteral) {
      return {
        ok: false,
        errorMessage: "Impossible d'extraire FT_LIGNE_PAIR.",
      };
    }

    if (!impairLiteral) {
      return {
        ok: false,
        errorMessage: "Impossible d'extraire FT_LIGNE_IMPAIR.",
      };
    }

    if (!csvZonesLiteral) {
      return {
        ok: false,
        errorMessage: "Impossible d'extraire CSV_ZONES.",
      };
    }

    const FT_LIGNE_PAIR = evaluateArrayLiteral(pairLiteral);
    const FT_LIGNE_IMPAIR = evaluateArrayLiteral(impairLiteral);
    const CSV_ZONES = evaluateArrayLiteral(csvZonesLiteral);

    return {
      ok: true,
      source: {
        FT_LIGNE_PAIR,
        FT_LIGNE_IMPAIR,
        CSV_ZONES,
      },
    };
  } catch (error) {
    return {
      ok: false,
      errorMessage:
        error instanceof Error
          ? error.message
          : "Erreur inconnue pendant le parsing des tableaux legacy FT.",
    };
  }
}

// =========================
// Conversion
// =========================

function convertEntryToNormalizedRow(
  prefix: "ns" | "sn",
  entry: FtSourceEntryLike,
  index: number,
  csvSens: CsvSens,
  csvZones: CsvZoneLike[]
): FtLineCommon {
  const type: FtLineType = entry?.isNoteOnly === true ? "note" : "data";

  const resolvedPkInterne = firstNonEmptyString(
    entry?.pk_internal,
    entry?.pk
  );

  return {
    id: buildId(prefix, type, index + 1),
    type,

    reseau: toStringValue(entry?.network),

    pkInterne: resolvedPkInterne,
    pkAdif: toStringValue(entry?.pk_adif),
    pkLfp: toStringValue(entry?.pk_lfp),
    pkRfn: toStringValue(entry?.pk_rfn),

    bloqueo: toStringValue(entry?.bloqueo),
    vmax: toStringValue(entry?.vmax),
    sitKm: toStringValue(entry?.pk),
    dependencia: toStringValue(entry?.dependencia),
    radio: toStringValue(entry?.radio),
    rampCaract: toStringValue(entry?.rc),

    csv: isEntryInCsvZone(entry, csvSens, csvZones),

    notes: toNotesArray(entry),
  };
}

function convertTable(
  prefix: "ns" | "sn",
  table: unknown[],
  csvSens: CsvSens,
  csvZones: CsvZoneLike[]
): FtLineCommon[] {
  return table.map((entry, index) =>
    convertEntryToNormalizedRow(
      prefix,
      entry as FtSourceEntryLike,
      index,
      csvSens,
      csvZones
    )
  );
}

// =========================
// Génération du fichier TS
// =========================

function buildNormalizedFileContent(data: LigneFTNormalized): string {
  const serialized = JSON.stringify(data, null, 2);

  return [
    'import type { LigneFTNormalized } from "../types/ligneFTNormalized";',
    "",
    `export const LIGNE_FT_NORMALIZED: LigneFTNormalized = ${serialized};`,
    "",
  ].join("\n");
}

// =========================
// Écriture des fichiers
// =========================

function writeOutputFiles(content: string): { outputFile: string; archiveFile: string } {
  fs.mkdirSync(ARCHIVE_DIR, { recursive: true });

  const timestamp = getTimestampForFilename();
  const archiveFile = path.join(
    ARCHIVE_DIR,
    `ligneFT.normalized.${timestamp}.ts`
  );

  fs.writeFileSync(OUTPUT_FILE, content, "utf-8");
  fs.writeFileSync(archiveFile, content, "utf-8");

  return {
    outputFile: OUTPUT_FILE,
    archiveFile,
  };
}

// =========================
// Main
// =========================

async function main(): Promise<void> {
  try {
    console.log("[INFO] Début de la conversion ligneFT -> ligneFT.normalized");
    console.log("[INFO] Téléchargement de la source distante legacy");

    const rawText = await fetchLegacyFtSourceRaw();

    console.log("[OK] Source distante legacy chargée");
    console.log("[INFO] Parsing des tableaux FT legacy");

    const parsedResult = parseLegacyFtSourceArraysFromRaw(rawText);

    if (!parsedResult.ok) {
      throw new Error(`Impossible de parser la source distante : ${parsedResult.errorMessage}`);
    }

    const { FT_LIGNE_IMPAIR, FT_LIGNE_PAIR, CSV_ZONES } = parsedResult.source;

    if (!Array.isArray(FT_LIGNE_IMPAIR)) {
      throw new Error("FT_LIGNE_IMPAIR est introuvable ou invalide.");
    }

    if (!Array.isArray(FT_LIGNE_PAIR)) {
      throw new Error("FT_LIGNE_PAIR est introuvable ou invalide.");
    }

    if (!Array.isArray(CSV_ZONES)) {
      throw new Error("CSV_ZONES est introuvable ou invalide.");
    }

    console.log("[OK] Tableaux source extraits");
    console.log("[INFO] Conversion FT_LIGNE_IMPAIR -> nordSud");
    const nordSudRows = convertTable(
      "ns",
      FT_LIGNE_IMPAIR,
      "IMPAIR",
      CSV_ZONES as CsvZoneLike[]
    );

    console.log("[INFO] Conversion FT_LIGNE_PAIR -> sudNord");
    const sudNordRows = convertTable(
      "sn",
      FT_LIGNE_PAIR,
      "PAIR",
      CSV_ZONES as CsvZoneLike[]
    );

    const normalizedData: LigneFTNormalized = {
      nordSud: { rows: nordSudRows },
      sudNord: { rows: sudNordRows },
    };

    const content = buildNormalizedFileContent(normalizedData);
    const { outputFile, archiveFile } = writeOutputFiles(content);

    console.log(`[OK] nordSud : ${nordSudRows.length} lignes`);
    console.log(`[OK] sudNord : ${sudNordRows.length} lignes`);
    console.log(`[OK] Fichier courant écrit : ${outputFile}`);
    console.log(`[OK] Archive écrite : ${archiveFile}`);
    console.log("[OK] Conversion terminée avec succès");
  } catch (error) {
    console.error("[ERREUR] La conversion a échoué.");
    console.error(error);
    process.exitCode = 1;
  }
}

void main();
import type { LigneFTNormalized } from "../../types/ligneFTNormalized";
import { assertValidNormalizedData } from "./validation.js";

function stableStringify(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getDefaultLigneValue(origine: string, destination: string): string {
  const normalizedOrigin = origine.trim().toUpperCase();
  const normalizedDestination = destination.trim().toUpperCase();

  return normalizedOrigin.includes("CAN TUNIS AV") ||
    normalizedDestination.includes("CAN TUNIS AV")
    ? "050 - 066"
    : "050";
}

function normalizeMetaForBackwardCompatibility(meta: unknown): unknown {
  if (!isObject(meta)) {
    return meta;
  }

  const origine = typeof meta.origine === "string" ? meta.origine : "";
  const destination = typeof meta.destination === "string" ? meta.destination : "";
  const ligneStored = typeof meta.ligne === "string" ? meta.ligne.trim() : "";

  return {
    ...meta,
    ligne:
      ligneStored !== ""
        ? ligneStored
        : getDefaultLigneValue(origine, destination),
  };
}

export function normalizeNormalizedDataForBackwardCompatibility(
  data: unknown,
): unknown {
  if (!isObject(data)) {
    return data;
  }

  if (!isObject(data.trains)) {
    return data;
  }

  const nextTrains: Record<string, unknown> = {};

  for (const [trainNumber, trainData] of Object.entries(data.trains)) {
    if (!isObject(trainData)) {
      nextTrains[trainNumber] = trainData;
      continue;
    }

    const nextTrainData: Record<string, unknown> = {
      ...trainData,
    };

    if (isObject(trainData.meta)) {
      nextTrainData.meta = normalizeMetaForBackwardCompatibility(trainData.meta);
    }

    if (Array.isArray(trainData.variants)) {
      nextTrainData.variants = trainData.variants.map((variant) => {
        if (!isObject(variant)) {
          return variant;
        }

        return {
          ...variant,
          meta: normalizeMetaForBackwardCompatibility(variant.meta),
        };
      });
    }

    nextTrains[trainNumber] = nextTrainData;
  }

  return {
    ...data,
    trains: nextTrains,
  };
}

export function buildNormalizedTsFile(data: LigneFTNormalized): string {
  assertValidNormalizedData(data);

  const serializedData = stableStringify(data);

  return [
    'import type { LigneFTNormalized } from "../types/ligneFTNormalized";',
    "",
    "export const LIGNE_FT_NORMALIZED: LigneFTNormalized = " + serializedData + ";",
    "",
  ].join("\n");
}

export function extractNormalizedDataFromTs(content: string): unknown {
  const normalizedContent = content.replace(/^\uFEFF/, "");

  const match = normalizedContent.match(
    /export\s+const\s+LIGNE_FT_NORMALIZED\s*:\s*LigneFTNormalized\s*=\s*([\s\S]*?)\s*;\s*$/,
  );

  if (!match) {
    throw new Error("Unable to find LIGNE_FT_NORMALIZED export in TypeScript file");
  }

  const objectLiteral = match[1].trim();

  try {
    return JSON.parse(objectLiteral);
  } catch (error) {
    throw new Error(
      `Unable to parse LIGNE_FT_NORMALIZED object as JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

export function parseAndValidateNormalizedTs(content: string): LigneFTNormalized {
  const rawData = extractNormalizedDataFromTs(content);
  const data = normalizeNormalizedDataForBackwardCompatibility(rawData);
  assertValidNormalizedData(data);
  return data;
}
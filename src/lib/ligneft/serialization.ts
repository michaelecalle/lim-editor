import type { LigneFTNormalized } from "../../types/ligneFTNormalized";
import { assertValidNormalizedData } from "./validation";

function stableStringify(value: unknown): string {
  return JSON.stringify(value, null, 2);
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
    /export\s+const\s+LIGNE_FT_NORMALIZED\s*:\s*LigneFTNormalized\s*=\s*([\s\S]*);?\s*$/,
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
  const data = extractNormalizedDataFromTs(content);
  assertValidNormalizedData(data);
  return data;
}
import type { FtLineCommon, LigneFTNormalized } from "../../types/ligneFTNormalized";
import { LigneFtValidationError } from "./errors.js";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function validateLine(line: unknown, path: string): string[] {
  const errors: string[] = [];

  if (!isObject(line)) {
    errors.push(`${path} must be an object`);
    return errors;
  }

  if (typeof line.id !== "string" || line.id.trim() === "") {
    errors.push(`${path}.id must be a non-empty string`);
  }

  if (line.type !== "data" && line.type !== "note") {
    errors.push(`${path}.type must be "data" or "note"`);
  }

  if (typeof line.reseau !== "string") {
    errors.push(`${path}.reseau must be a string`);
  }

  if (typeof line.pkInterne !== "string") {
    errors.push(`${path}.pkInterne must be a string`);
  }

  if (typeof line.pkAdif !== "string") {
    errors.push(`${path}.pkAdif must be a string`);
  }

  if (typeof line.pkLfp !== "string") {
    errors.push(`${path}.pkLfp must be a string`);
  }

  if (typeof line.pkRfn !== "string") {
    errors.push(`${path}.pkRfn must be a string`);
  }

  if (typeof line.bloqueo !== "string") {
    errors.push(`${path}.bloqueo must be a string`);
  }

  if (typeof line.vmax !== "string") {
    errors.push(`${path}.vmax must be a string`);
  }

  if (typeof line.sitKm !== "string") {
    errors.push(`${path}.sitKm must be a string`);
  }

  if (typeof line.dependencia !== "string") {
    errors.push(`${path}.dependencia must be a string`);
  }

  if (typeof line.radio !== "string") {
    errors.push(`${path}.radio must be a string`);
  }

  if (typeof line.rampCaract !== "string") {
    errors.push(`${path}.rampCaract must be a string`);
  }

  if (typeof line.csv !== "boolean") {
    errors.push(`${path}.csv must be a boolean`);
  }

  if (!isStringArray(line.notes)) {
    errors.push(`${path}.notes must be a string[]`);
  }

  return errors;
}

function validateRows(rows: unknown, path: string): string[] {
  const errors: string[] = [];

  if (!Array.isArray(rows)) {
    errors.push(`${path} must be an array`);
    return errors;
  }

  rows.forEach((line, index) => {
    errors.push(...validateLine(line, `${path}[${index}]`));
  });

  return errors;
}

export function validateNormalizedData(data: unknown): string[] {
  const errors: string[] = [];

  if (!isObject(data)) {
    return ["data must be an object"];
  }

  if (!isObject(data.nordSud)) {
    errors.push(`data.nordSud must be an object`);
  } else {
    errors.push(...validateRows(data.nordSud.rows, "data.nordSud.rows"));
  }

  if (!isObject(data.sudNord)) {
    errors.push(`data.sudNord must be an object`);
  } else {
    errors.push(...validateRows(data.sudNord.rows, "data.sudNord.rows"));
  }

  return errors;
}

export function assertValidNormalizedData(data: unknown): asserts data is LigneFTNormalized {
  const errors = validateNormalizedData(data);

  if (errors.length > 0) {
    throw new LigneFtValidationError("Invalid ligneFT normalized data", errors);
  }
}

export function isValidFtLineCommon(value: unknown): value is FtLineCommon {
  return validateLine(value, "line").length === 0;
}

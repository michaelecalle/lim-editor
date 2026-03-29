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

function validateVariantDays(days: unknown, path: string): string[] {
  const errors: string[] = [];

  if (!isObject(days)) {
    errors.push(`${path} must be an object`);
    return errors;
  }

  for (const dayName of [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
  ] as const) {
    if (typeof days[dayName] !== "boolean") {
      errors.push(`${path}.${dayName} must be a boolean`);
    }
  }

  return errors;
}

function validateVariantValidity(validity: unknown, path: string): string[] {
  const errors: string[] = [];

  if (!isObject(validity)) {
    errors.push(`${path} must be an object`);
    return errors;
  }

  if (typeof validity.startDate !== "string") {
    errors.push(`${path}.startDate must be a string`);
  }

  if (typeof validity.endDate !== "string") {
    errors.push(`${path}.endDate must be a string`);
  }

  errors.push(...validateVariantDays(validity.days, `${path}.days`));

  return errors;
}

function validateTrainRowData(rowData: unknown, path: string): string[] {
  const errors: string[] = [];

  if (!isObject(rowData)) {
    errors.push(`${path} must be an object`);
    return errors;
  }

  for (const fieldName of ["com", "hora", "tecn", "conc"] as const) {
    const fieldValue = rowData[fieldName];

    if (fieldValue != null && typeof fieldValue !== "string") {
      errors.push(`${path}.${fieldName} must be a string when present`);
    }
  }

  return errors;
}

function validateVariantByRowKey(byRowKey: unknown, path: string): string[] {
  const errors: string[] = [];

  if (!isObject(byRowKey)) {
    errors.push(`${path} must be an object`);
    return errors;
  }

  for (const [rowKey, rowData] of Object.entries(byRowKey)) {
    errors.push(...validateTrainRowData(rowData, `${path}.${rowKey}`));
  }

  return errors;
}

function validateTrainVariant(variant: unknown, path: string): string[] {
  const errors: string[] = [];

  if (!isObject(variant)) {
    errors.push(`${path} must be an object`);
    return errors;
  }

  const meta = variant.meta;
  const byRowKey = variant.byRowKey;

  if (!isObject(meta)) {
    errors.push(`${path}.meta must be an object`);
  } else {
    if (typeof meta.origine !== "string") {
      errors.push(`${path}.meta.origine must be a string`);
    }

    if (typeof meta.destination !== "string") {
      errors.push(`${path}.meta.destination must be a string`);
    }

    errors.push(...validateVariantValidity(meta.validity, `${path}.meta.validity`));
  }

  errors.push(...validateVariantByRowKey(byRowKey, `${path}.byRowKey`));

  return errors;
}

function validateTrainData(trainData: unknown, path: string): string[] {
  const errors: string[] = [];

  if (!isObject(trainData)) {
    errors.push(`${path} must be an object`);
    return errors;
  }

  if (!isObject(trainData.meta)) {
    errors.push(`${path}.meta must be an object`);
  } else {
    if (typeof trainData.meta.origine !== "string") {
      errors.push(`${path}.meta.origine must be a string`);
    }

    if (typeof trainData.meta.destination !== "string") {
      errors.push(`${path}.meta.destination must be a string`);
    }
  }

  if (!isObject(trainData.byRowKey)) {
    errors.push(`${path}.byRowKey must be an object`);
  } else {
    for (const [rowKey, rowData] of Object.entries(trainData.byRowKey)) {
      errors.push(...validateTrainRowData(rowData, `${path}.byRowKey.${rowKey}`));
    }
  }

  if (trainData.variants != null) {
    if (!Array.isArray(trainData.variants)) {
      errors.push(`${path}.variants must be an array when present`);
    } else {
      trainData.variants.forEach((variant, index) => {
        errors.push(...validateTrainVariant(variant, `${path}.variants[${index}]`));
      });
    }
  }

  if (
    trainData.publishState != null &&
    trainData.publishState !== "published" &&
    trainData.publishState !== "local"
  ) {
    errors.push(`${path}.publishState must be "published" or "local" when present`);
  }

  return errors;
}

function validateTrains(trains: unknown, path: string): string[] {
  const errors: string[] = [];

  if (!isObject(trains)) {
    errors.push(`${path} must be an object`);
    return errors;
  }

  for (const [trainNumber, trainData] of Object.entries(trains)) {
    errors.push(...validateTrainData(trainData, `${path}.${trainNumber}`));
  }

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

  if ("trains" in data && data.trains != null) {
    errors.push(...validateTrains(data.trains, "data.trains"));
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
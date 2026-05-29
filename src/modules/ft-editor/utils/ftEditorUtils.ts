import type { LigneFTNormalized } from "../../../types/ligneFTNormalized";
import type {
  EditorDirection,
  EditorFtRowView,
} from "../types/viewTypes";
import type {
  FtSourceDirectionTables,
  FtSourceTrainData,
  FtSourceTrainMeta,
  FtSourceTrainRowData,
  FtSourceTrainVariantData,
} from "../types/sourceTypes";
import { getDirectionRows } from "../selectors/getDirectionRows";

// ── Types ─────────────────────────────────────────────────────────────────────

export type LtvEditorRow = {
  id: string;
  origin: "normalized" | "adif" | "manual";
  status: "unchanged" | "modified" | "added";
  code: string;
  section: string;
  via: string;
  kmIni: string;
  kmFin: string;
  speed: string;
  motivo: string;
  fecha1: string;
  hora1: string;
  fecha2: string;
  hora2: string;
  viaCheck: boolean;
  sistema: boolean;
  soloCabeza: boolean;
  csv: boolean;
  observaciones: string;
  editedFields?: Partial<Record<string, boolean>>;
  vatardFields?: Partial<Record<string, boolean>>;
};

export type LtvAdifApiEntry = {
  objectId: number;
  ltvId: number | null;
  ligne: string;
  ligneDescription: string;
  pkDebut: number;
  pkFin: number;
  vitesse: number;
  voies: string;
  motif: string;
  debutZone: string;
  finZone: string;
  csv: string | null;
  calendrier: string | null;
  dateDebutVigueur: number | null;
  heureDebutVigueur: string | null;
  dateFinPrevue: number | null;
  heureFinPrevue: string | null;
  horaire: string | null;
  nonSignaleeSysteme: string | null;
  nonSignaleeVoie: string | null;
  observations: string | null;
  vehiculeTete: string | null;
  typeTrain: string | null;
  typeTrainObs: string | null;
};

export type LtvAdifApiResponse =
  | {
      ok: true;
      source: string;
      fetchedAt: string;
      sourceUpdatedAt: string | null;
      sourceUpdatedFile: string | null;
      total: number;
      ltv: LtvAdifApiEntry[];
      warning?: string;
    }
  | {
      ok: false;
      error?: string;
    };

export type LtvNormalizedFile = {
  meta: {
    line: string;
    publishedAt: string;
    adif: {
      source: string;
      fetchedAt: string;
      sourceUpdatedAt: string | null;
      sourceUpdatedFile: string | null;
    };
  };
  rows: LtvEditorRow[];
  warnings: string[];
};

export type LtvEditorTextField =
  | "code"
  | "section"
  | "via"
  | "kmIni"
  | "kmFin"
  | "speed"
  | "motivo"
  | "fecha1"
  | "hora1"
  | "fecha2"
  | "hora2"
  | "observaciones";

export type LtvEditorFlagField = "viaCheck" | "sistema" | "soloCabeza" | "csv";

// ── Constants ─────────────────────────────────────────────────────────────────

export const LTV_TEXT_FIELDS_BEFORE_FLAGS: LtvEditorTextField[] = [
  "code",
  "section",
  "via",
  "kmIni",
  "kmFin",
  "speed",
  "motivo",
  "fecha1",
  "hora1",
  "fecha2",
  "hora2",
];

export const LTV_FLAG_FIELDS: LtvEditorFlagField[] = [
  "viaCheck",
  "sistema",
  "soloCabeza",
  "csv",
];

export const LTV_TABLE_HEADERS = [
  "CÓDIGO LTV",
  "Trayecto / Estación",
  "Vía",
  "Km. Ini",
  "Km. Fin",
  "Veloc.",
  "Motivo",
  "Establecido fecha",
  "Establecido hora",
  "Fin prevista fecha",
  "Fin prevista hora",
  "No señalizada vía",
  "No señalizada sistema",
  "Sólo vehic. cabeza",
  "CSV",
  "Observaciones",
];

export const LTV_ADIF_ENDPOINT_URL = "https://lim2.vercel.app/api/ltv";
export const LTV_ADIF_REFERENCE_LINE = "050";
export const LTV_ADIF_REFERENCE_PK = 616;
export const LTV_VATARD_ENDPOINT_URL = "https://lim2.vercel.app/api/ltv-vatard";

export type VatardApiEntry = {
  code: string;
  stations: string;
  track: string;
  startKm: string;
  endKm: string;
  speed: string;
  speedNum: number;
  reason: string;
  startDateTime: string;
  endDateTime: string;
  csv: boolean;
  comment: string;
  firstAppearanceDate: string;
  lastSeen: string;
  active: boolean;
  designSpeed: number;
  reductionPercentage: number;
  kmLength: number;
  line: string;
};

export type LtvVatardApiResponse =
  | {
      ok: true;
      source: string;
      fetchedAt: string;
      total: number;
      raw: VatardApiEntry[];
    }
  | {
      ok: false;
      error?: string;
    };

// ── Utility functions ─────────────────────────────────────────────────────────

export function isAdifEntryOnReferenceLine(entry: LtvAdifApiEntry): boolean {
  return entry.ligne.trim() === LTV_ADIF_REFERENCE_LINE;
}

export function isAdifEntryOnReferenceRoute(entry: LtvAdifApiEntry): boolean {
  return (
    isAdifEntryOnReferenceLine(entry) &&
    (entry.pkDebut >= LTV_ADIF_REFERENCE_PK ||
      entry.pkFin >= LTV_ADIF_REFERENCE_PK)
  );
}

export function getDirectionLabel(direction: EditorDirection): string {
  return direction === "NORD_SUD" ? "Nord → Sud" : "Sud → Nord";
}

export function getSourceTableLabel(direction: EditorDirection): string {
  return direction === "NORD_SUD" ? "nordSud" : "sudNord";
}

export function getRowPreview(row: EditorFtRowView | undefined): string {
  if (!row) {
    return "aucune";
  }

  const pk = row.visible.pkDisplay || "?";
  const dependencia = row.visible.dependencia || "?";
  const com = row.visible.com || "?";
  const vmax = row.visible.vmax || "-";
  const rc = row.visible.rc || "-";

  if (row.visual.isNoteOnly) {
    return `noteOnly / pk=${pk} / com=${com} / vmax=${vmax} / rc=${rc}`;
  }

  return `pk=${pk} / dependencia=${dependencia} / vmax=${vmax} / rc=${rc}`;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function getDirectionFromTrainNumber(
  trainNumber: string
): EditorDirection | null {
  const digits = trainNumber.replace(/\D/g, "").trim();

  if (digits === "") {
    return null;
  }

  const parsed = Number(digits);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return parsed % 2 === 0 ? "NORD_SUD" : "SUD_NORD";
}

export function findVariantForDate(
  trainData: FtSourceTrainData,
  dateStr: string
): FtSourceTrainVariantData | null {
  for (const variant of trainData.variants) {
    const dates = variant.meta.validity.specificDates;
    if (Array.isArray(dates) && dates.length > 0) {
      if (dates.includes(dateStr)) return variant;
    }
  }

  const date = new Date(dateStr + "T00:00:00");
  const dayKeys = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ] as const;
  const dayKey = dayKeys[date.getDay()];

  for (const variant of trainData.variants) {
    const { normalizedStart, normalizedEnd } = normalizeVariantDateRange(
      variant.meta.validity.startDate,
      variant.meta.validity.endDate
    );
    if (dateStr >= normalizedStart && dateStr <= normalizedEnd) {
      if (variant.meta.validity.days[dayKey]) {
        return variant;
      }
    }
  }

  return trainData.variants[0] ?? null;
}

export function parseHoraToMinutesForConc(value: string): number | null {
  const trimmed = value.trim();

  if (!/^\d{1,2}:\d{2}$/.test(trimmed)) {
    return null;
  }

  const [hoursText, minutesText] = trimmed.split(":");
  const hours = Number(hoursText);
  const minutes = Number(minutesText);

  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }

  return hours * 60 + minutes;
}

export function hasLeadingZeros(trainNumber: string): boolean {
  return /^0\d+$/.test(trainNumber.trim());
}

export function removeLeadingZeros(trainNumber: string): string {
  const trimmed = trainNumber.trim();
  const normalized = trimmed.replace(/^0+/, "");
  return normalized === "" ? "0" : normalized;
}

export function buildDefaultVariantValidity() {
  return {
    startDate: "",
    endDate: "",
    days: {
      monday: true,
      tuesday: true,
      wednesday: true,
      thursday: true,
      friday: true,
      saturday: true,
      sunday: true,
    },
    specificDates: [] as string[],
  };
}

export function getDefaultLigneValue(origine: string, destination: string): string {
  const normalizedOrigin = origine.trim().toUpperCase();
  const normalizedDestination = destination.trim().toUpperCase();

  return normalizedOrigin.includes("CAN TUNIS AV") ||
    normalizedDestination.includes("CAN TUNIS AV")
    ? "050 - 066"
    : "050";
}

export function formatVariantDateForDisplay(value: string): string {
  const trimmed = value.trim();

  if (trimmed === "") {
    return "—";
  }

  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return trimmed;
  }

  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}

export function buildEmptyLocalTrainVariantData(): FtSourceTrainVariantData {
  return {
    meta: {
      origine: "",
      destination: "",
      ligne: getDefaultLigneValue("", ""),
      numeroEspagne: "",
      numeroFrance: "",
      categorieEspagne: "",
      categorieFrance: "",
      materiel: "",
      composition: "",
      validity: buildDefaultVariantValidity(),
    },
    byRowKey: {},
  };
}

export function buildLegacyTrainMeta(trainData: FtSourceTrainData): FtSourceTrainMeta {
  const rawTrainData = trainData as unknown;

  if (!isRecord(rawTrainData)) {
    return {
      origine: "",
      destination: "",
      ligne: "050",
      numeroEspagne: "",
      numeroFrance: "",
      categorieEspagne: "",
      categorieFrance: "",
      materiel: "",
      composition: "",
    };
  }

  const rawMeta = rawTrainData["meta"];

  if (!isRecord(rawMeta)) {
    return {
      origine: "",
      destination: "",
      ligne: "050",
      numeroEspagne: "",
      numeroFrance: "",
      categorieEspagne: "",
      categorieFrance: "",
      materiel: "",
      composition: "",
    };
  }

  const origine =
    typeof rawMeta["origine"] === "string" ? rawMeta["origine"] : "";
  const destination =
    typeof rawMeta["destination"] === "string" ? rawMeta["destination"] : "";
  const ligneStored =
    typeof rawMeta["ligne"] === "string" ? rawMeta["ligne"].trim() : "";

  return {
    origine,
    destination,
    ligne:
      ligneStored !== ""
        ? ligneStored
        : getDefaultLigneValue(origine, destination),
    numeroEspagne:
      typeof rawMeta["numeroEspagne"] === "string"
        ? rawMeta["numeroEspagne"]
        : "",
    numeroFrance:
      typeof rawMeta["numeroFrance"] === "string"
        ? rawMeta["numeroFrance"]
        : "",
    categorieEspagne:
      typeof rawMeta["categorieEspagne"] === "string"
        ? rawMeta["categorieEspagne"]
        : "",
    categorieFrance:
      typeof rawMeta["categorieFrance"] === "string"
        ? rawMeta["categorieFrance"]
        : "",
    materiel:
      typeof rawMeta["materiel"] === "string" ? rawMeta["materiel"] : "",
    composition:
      typeof rawMeta["composition"] === "string" ? rawMeta["composition"] : "",
  };
}

export function buildLegacyTrainByRowKey(
  trainData: FtSourceTrainData
): Record<string, FtSourceTrainRowData> {
  const rawTrainData = trainData as unknown;

  if (!isRecord(rawTrainData)) {
    return {};
  }

  const rawByRowKey = rawTrainData["byRowKey"];

  if (!isRecord(rawByRowKey)) {
    return {};
  }

  return rawByRowKey as Record<string, FtSourceTrainRowData>;
}

export function getVariantCount(trainData: FtSourceTrainData | undefined): number {
  if (!trainData) {
    return 0;
  }

  if (Array.isArray(trainData.variants) && trainData.variants.length > 0) {
    return trainData.variants.length;
  }

  return 1;
}

export function getVariantAtIndex(
  trainData: FtSourceTrainData | undefined,
  variantIndex: number
): FtSourceTrainVariantData | null {
  if (!trainData) {
    return null;
  }

  if (Array.isArray(trainData.variants) && trainData.variants.length > 0) {
    if (variantIndex < 0 || variantIndex >= trainData.variants.length) {
      return null;
    }

    return trainData.variants[variantIndex] ?? null;
  }

  if (variantIndex !== 0) {
    return null;
  }

  return {
    meta: {
      ...buildLegacyTrainMeta(trainData),
      validity: buildDefaultVariantValidity(),
    },
    byRowKey: buildLegacyTrainByRowKey(trainData),
  };
}

export function replaceVariantAtIndex(
  trainData: FtSourceTrainData,
  variantIndex: number,
  nextVariant: FtSourceTrainVariantData
): FtSourceTrainData {
  if (Array.isArray(trainData.variants) && trainData.variants.length > 0) {
    if (variantIndex < 0 || variantIndex >= trainData.variants.length) {
      return trainData;
    }

    return {
      ...trainData,
      variants: trainData.variants.map((variant, index) =>
        index === variantIndex ? nextVariant : variant
      ),
    };
  }

  if (variantIndex !== 0) {
    return trainData;
  }

  return {
    publishState: trainData.publishState,
    variants: [nextVariant],
  };
}

export function buildEmptyLocalTrainData(): FtSourceTrainData {
  return {
    variants: [buildEmptyLocalTrainVariantData()],
    publishState: "local",
  };
}

export function getVariantActiveDayCount(days: {
  monday: boolean;
  tuesday: boolean;
  wednesday: boolean;
  thursday: boolean;
  friday: boolean;
  saturday: boolean;
  sunday: boolean;
}): number {
  return Object.values(days).filter(Boolean).length;
}

export function getOverlappingVariantDayLabels(
  firstDays: {
    monday: boolean;
    tuesday: boolean;
    wednesday: boolean;
    thursday: boolean;
    friday: boolean;
    saturday: boolean;
    sunday: boolean;
  },
  secondDays: {
    monday: boolean;
    tuesday: boolean;
    wednesday: boolean;
    thursday: boolean;
    friday: boolean;
    saturday: boolean;
    sunday: boolean;
  }
): string[] {
  const overlappingDays: string[] = [];

  if (firstDays.monday && secondDays.monday) {
    overlappingDays.push("L");
  }

  if (firstDays.tuesday && secondDays.tuesday) {
    overlappingDays.push("M");
  }

  if (firstDays.wednesday && secondDays.wednesday) {
    overlappingDays.push("M");
  }

  if (firstDays.thursday && secondDays.thursday) {
    overlappingDays.push("J");
  }

  if (firstDays.friday && secondDays.friday) {
    overlappingDays.push("V");
  }

  if (firstDays.saturday && secondDays.saturday) {
    overlappingDays.push("S");
  }

  if (firstDays.sunday && secondDays.sunday) {
    overlappingDays.push("D");
  }

  return overlappingDays;
}

export function doVariantDaysOverlap(
  firstDays: {
    monday: boolean;
    tuesday: boolean;
    wednesday: boolean;
    thursday: boolean;
    friday: boolean;
    saturday: boolean;
    sunday: boolean;
  },
  secondDays: {
    monday: boolean;
    tuesday: boolean;
    wednesday: boolean;
    thursday: boolean;
    friday: boolean;
    saturday: boolean;
    sunday: boolean;
  }
): boolean {
  return getOverlappingVariantDayLabels(firstDays, secondDays).length > 0;
}

export function normalizeVariantDateRange(startDate: string, endDate: string): {
  normalizedStart: string;
  normalizedEnd: string;
} {
  return {
    normalizedStart: startDate.trim() === "" ? "0000-01-01" : startDate.trim(),
    normalizedEnd: endDate.trim() === "" ? "9999-12-31" : endDate.trim(),
  };
}

export function doVariantDateRangesOverlap(
  firstStartDate: string,
  firstEndDate: string,
  secondStartDate: string,
  secondEndDate: string
): boolean {
  const firstRange = normalizeVariantDateRange(firstStartDate, firstEndDate);
  const secondRange = normalizeVariantDateRange(secondStartDate, secondEndDate);

  return (
    firstRange.normalizedStart <= secondRange.normalizedEnd &&
    secondRange.normalizedStart <= firstRange.normalizedEnd
  );
}

export function getConflictingVariantIndex(
  variants: FtSourceTrainVariantData[],
  currentVariantIndex: number,
  draftValidity: {
    startDate: string;
    endDate: string;
    days: {
      monday: boolean;
      tuesday: boolean;
      wednesday: boolean;
      thursday: boolean;
      friday: boolean;
      saturday: boolean;
      sunday: boolean;
    };
  }
): number | null {
  for (let index = 0; index < variants.length; index += 1) {
    if (index === currentVariantIndex) {
      continue;
    }

    const otherVariant = variants[index];
    const otherValidity = otherVariant.meta.validity;

    if (!doVariantDaysOverlap(draftValidity.days, otherValidity.days)) {
      continue;
    }

    if (
      !doVariantDateRangesOverlap(
        draftValidity.startDate,
        draftValidity.endDate,
        otherValidity.startDate,
        otherValidity.endDate
      )
    ) {
      continue;
    }

    return index;
  }

  return null;
}

export function isTrainNumberInputValid(value: string): boolean {
  const trimmed = value.trim();
  return /^\d{1,6}$/.test(trimmed);
}

export function getSuggestedNumeroFranceForPublish(
  source: FtSourceDirectionTables,
  trainNumber: string,
  variant: FtSourceTrainVariantData
): string {
  const trimmedTrainNumber = trainNumber.trim();

  if (trimmedTrainNumber === "") {
    return "";
  }

  const trimmedStoredNumeroFrance = variant.meta.numeroFrance.trim();

  if (trimmedStoredNumeroFrance !== "") {
    return trimmedStoredNumeroFrance;
  }

  const direction = getDirectionFromTrainNumber(trimmedTrainNumber);

  if (direction == null) {
    return "";
  }

  const trimmedOrigin = variant.meta.origine.trim();
  const trimmedDestination = variant.meta.destination.trim();

  if (trimmedOrigin === "" || trimmedDestination === "") {
    return "";
  }

  const directionRows = getDirectionRows(source, direction);
  const originIndex = directionRows.findIndex(
    (row) => row.visible.dependencia.trim() === trimmedOrigin
  );
  const destinationIndex = directionRows.findIndex(
    (row) => row.visible.dependencia.trim() === trimmedDestination
  );

  if (originIndex === -1 || destinationIndex === -1) {
    return "";
  }

  const startIndex = Math.min(originIndex, destinationIndex);
  const endIndex = Math.max(originIndex, destinationIndex);

  const isTransfrontalier = directionRows
    .slice(startIndex, endIndex + 1)
    .some((row) => row.visible.dependencia.trim() === "LIMITE ADIF - LFPSA");

  if (!isTransfrontalier) {
    return "";
  }

  const digits = trimmedTrainNumber.replace(/\D/g, "").trim();

  if (!/^\d+$/.test(digits)) {
    return "";
  }

  const parsed = Number(digits);

  if (!Number.isFinite(parsed)) {
    return "";
  }

  return String(parsed % 2 === 0 ? parsed + 1 : parsed - 1);
}

export function materializeComputedConcForPublish(
  source: FtSourceDirectionTables
): FtSourceDirectionTables {
  if (!source.trains) {
    return source;
  }

  let hasAnyChange = false;
  const nextTrains: NonNullable<FtSourceDirectionTables["trains"]> = {};

  for (const [trainNumber, trainData] of Object.entries(source.trains)) {
    const direction = getDirectionFromTrainNumber(trainNumber);

    if (direction == null) {
      nextTrains[trainNumber] = trainData;
      continue;
    }

    const selectedVariant = getVariantAtIndex(trainData, 0);

    if (!selectedVariant) {
      nextTrains[trainNumber] = trainData;
      continue;
    }

    const orderedRows = getDirectionRows(source, direction);
    let previousHoraMinutes: number | null = null;
    let trainChanged = false;
    const nextByRowKey: Record<string, FtSourceTrainRowData> = {
      ...selectedVariant.byRowKey,
    };

    for (const row of orderedRows) {
      const existingRowData = selectedVariant.byRowKey[row.id] as
        | FtSourceTrainRowData
        | undefined;

      const effectiveHora =
        existingRowData?.hora != null ? existingRowData.hora : row.visible.hora;

      const currentHoraMinutes = parseHoraToMinutesForConc(effectiveHora ?? "");

      if (existingRowData?.conc != null) {
        if (currentHoraMinutes != null) {
          previousHoraMinutes = currentHoraMinutes;
        }
        continue;
      }

      if (currentHoraMinutes != null && previousHoraMinutes != null) {
        const rawDiff = currentHoraMinutes - previousHoraMinutes;
        const computedConc = String(rawDiff >= 0 ? rawDiff : rawDiff + 24 * 60);
        const nextRowData: FtSourceTrainRowData = {
          ...(existingRowData as FtSourceTrainRowData | undefined),
          conc: computedConc,
        };

        nextByRowKey[row.id] = nextRowData;
        trainChanged = true;
      }

      if (currentHoraMinutes != null) {
        previousHoraMinutes = currentHoraMinutes;
      }
    }

    nextTrains[trainNumber] = trainChanged
      ? replaceVariantAtIndex(trainData, 0, {
          ...selectedVariant,
          byRowKey: nextByRowKey,
        })
      : trainData;

    if (trainChanged) {
      hasAnyChange = true;
    }
  }

  if (!hasAnyChange) {
    return source;
  }

  return {
    ...source,
    trains: nextTrains,
  };
}

export function buildPublishedSourceForPublish(
  source: FtSourceDirectionTables
): LigneFTNormalized {
  if (!source.trains) {
    return source as unknown as LigneFTNormalized;
  }

  const nextTrains: NonNullable<LigneFTNormalized["trains"]> = {};

  for (const [trainNumber, trainData] of Object.entries(source.trains)) {
    const primaryVariant = getVariantAtIndex(trainData, 0);

    if (!primaryVariant) {
      nextTrains[trainNumber] = {
        meta: buildLegacyTrainMeta(trainData),
        byRowKey: buildLegacyTrainByRowKey(trainData),
      };
      continue;
    }

    const publishedPrimaryNumeroFrance = getSuggestedNumeroFranceForPublish(
      source,
      trainNumber,
      primaryVariant
    );

    const publishedVariants =
      Array.isArray(trainData.variants) && trainData.variants.length > 0
        ? trainData.variants.map((variant) => ({
            meta: {
              origine: variant.meta.origine,
              destination: variant.meta.destination,
              ligne:
                variant.meta.ligne.trim() === ""
                  ? getDefaultLigneValue(
                      variant.meta.origine,
                      variant.meta.destination
                    )
                  : variant.meta.ligne.trim(),
              numeroEspagne: variant.meta.numeroEspagne,
              numeroFrance: getSuggestedNumeroFranceForPublish(
                source,
                trainNumber,
                variant
              ),
              categorieEspagne: variant.meta.categorieEspagne,
              categorieFrance: variant.meta.categorieFrance,
              materiel: variant.meta.materiel.trim(),
              composition:
                variant.meta.composition.trim() === ""
                  ? "US"
                  : variant.meta.composition.trim(),
              validity: {
                startDate: variant.meta.validity.startDate,
                endDate: variant.meta.validity.endDate,
                days: {
                  monday: variant.meta.validity.days.monday,
                  tuesday: variant.meta.validity.days.tuesday,
                  wednesday: variant.meta.validity.days.wednesday,
                  thursday: variant.meta.validity.days.thursday,
                  friday: variant.meta.validity.days.friday,
                  saturday: variant.meta.validity.days.saturday,
                  sunday: variant.meta.validity.days.sunday,
                },
                ...(Array.isArray(variant.meta.validity.specificDates) &&
                variant.meta.validity.specificDates.length > 0
                  ? { specificDates: variant.meta.validity.specificDates }
                  : {}),
              },
            },
            byRowKey: {
              ...variant.byRowKey,
            },
          }))
        : undefined;

    nextTrains[trainNumber] = {
      meta: {
        origine: primaryVariant.meta.origine,
        destination: primaryVariant.meta.destination,
        ligne:
          primaryVariant.meta.ligne.trim() === ""
            ? getDefaultLigneValue(
                primaryVariant.meta.origine,
                primaryVariant.meta.destination
              )
            : primaryVariant.meta.ligne.trim(),
        numeroEspagne: primaryVariant.meta.numeroEspagne,
        numeroFrance: publishedPrimaryNumeroFrance,
        categorieEspagne: primaryVariant.meta.categorieEspagne,
        categorieFrance: primaryVariant.meta.categorieFrance,
        materiel: primaryVariant.meta.materiel.trim(),
        composition:
          primaryVariant.meta.composition.trim() === ""
            ? "US"
            : primaryVariant.meta.composition.trim(),
      },
      byRowKey: {
        ...primaryVariant.byRowKey,
      },
      ...(publishedVariants ? { variants: publishedVariants } : {}),
    };
  }

  return {
    ...source,
    trains: nextTrains,
  } as unknown as LigneFTNormalized;
}

export function buildEmptyLtvEditorRow(id: string): LtvEditorRow {
  return {
    id,
    origin: "manual",
    status: "added",
    code: "",
    section: "",
    via: "",
    kmIni: "",
    kmFin: "",
    speed: "",
    motivo: "",
    fecha1: "",
    hora1: "",
    fecha2: "",
    hora2: "",
    viaCheck: false,
    sistema: false,
    soloCabeza: false,
    csv: false,
    observaciones: "",
  };
}

export function buildNextLtvManualId(rows: LtvEditorRow[]): string {
  let maxNumber = 0;

  for (const row of rows) {
    const match = row.id.match(/^ltv-manual-(\d+)$/);

    if (!match) {
      continue;
    }

    maxNumber = Math.max(maxNumber, Number(match[1]));
  }

  return `ltv-manual-${String(maxNumber + 1).padStart(4, "0")}`;
}

export function moveLtvEditorRow(
  rows: LtvEditorRow[],
  draggedRowId: string,
  targetRowId: string
): LtvEditorRow[] {
  if (draggedRowId === targetRowId) {
    return rows;
  }

  const draggedIndex = rows.findIndex((row) => row.id === draggedRowId);
  const targetIndex = rows.findIndex((row) => row.id === targetRowId);

  if (draggedIndex === -1 || targetIndex === -1) {
    return rows;
  }

  const nextRows = [...rows];
  const [draggedRow] = nextRows.splice(draggedIndex, 1);

  if (!draggedRow) {
    return rows;
  }

  nextRows.splice(targetIndex, 0, draggedRow);
  return nextRows;
}

export function formatLtvDateInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  const day = digits.slice(0, 2);
  const month = digits.slice(2, 4);
  const year = digits.slice(4, 8);

  if (digits.length <= 2) {
    return day;
  }

  if (digits.length <= 4) {
    return `${day}/${month}`;
  }

  return `${day}/${month}/${year}`;
}

export function formatLtvTimeInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 4);
  const hours = digits.slice(0, 2);
  const minutes = digits.slice(2, 4);

  if (digits.length <= 2) {
    return hours;
  }

  return `${hours}:${minutes}`;
}

export function normalizeLtvKm(value: string): string {
  if (value.trim() === "") return "";
  const dotIndex = value.indexOf(".");
  if (dotIndex === -1) {
    return `${value}.000`;
  }
  const intPart = value.slice(0, dotIndex);
  const decPart = value.slice(dotIndex + 1);
  return `${intPart}.${decPart.padEnd(3, "0")}`;
}

export function formatLtvDecimalKmInput(value: string): string {
  const normalizedValue = value.replace(",", ".").replace(/[^\d.]/g, "");

  if (!normalizedValue.includes(".")) {
    const digits = normalizedValue.replace(/\D/g, "").slice(0, 6);

    if (digits.length <= 3) {
      return digits;
    }

    return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  }

  const [rawIntegerPart, ...decimalParts] = normalizedValue.split(".");
  const integerPart = rawIntegerPart.replace(/\D/g, "").slice(0, 3);
  const decimalPart = decimalParts.join("").replace(/\D/g, "").slice(0, 3);

  if (integerPart === "" && decimalPart === "") {
    return "";
  }

  return `${integerPart}.${decimalPart}`;
}

export function normalizeLtvCode(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 9);

  if (digits === "") {
    return "";
  }

  return digits.padStart(9, "0");
}

export function normalizeLtvFieldForComparison(value: string, field: string): string {
  let v = (value ?? "").trim().normalize("NFKC");
  if (field === "via") {
    v = v.replace(/l/g, "I");
  }
  return v;
}

export function formatLtvTextInput(
  field: LtvEditorTextField,
  value: string
): string {
  if (field === "code") {
    return value.replace(/\D/g, "").slice(0, 9);
  }

  if (field === "kmIni" || field === "kmFin") {
    return formatLtvDecimalKmInput(value);
  }

  if (field === "speed") {
    const hasAsterisk = value.includes("*");
    const digits = value.replace(/\D/g, "");

    return hasAsterisk && digits !== "" ? `${digits}*` : digits;
  }

  if (field === "fecha1" || field === "fecha2") {
    return formatLtvDateInput(value);
  }

  if (field === "hora1" || field === "hora2") {
    return formatLtvTimeInput(value);
  }

  return value;
}

export function getLtvInputMode(
  field: LtvEditorTextField
): "text" | "numeric" | "decimal" {
  if (field === "kmIni" || field === "kmFin") {
    return "decimal";
  }

  if (
    field === "code" ||
    field === "speed" ||
    field === "fecha1" ||
    field === "fecha2" ||
    field === "hora1" ||
    field === "hora2"
  ) {
    return "numeric";
  }

  return "text";
}

export function formatAdifTextValue(value: string | number | null | undefined): string {
  if (value == null) {
    return "";
  }

  return String(value).trim();
}

export function formatAdifLtvSection(entry: LtvAdifApiEntry): string {
  const start = formatAdifTextValue(entry.debutZone);
  const end = formatAdifTextValue(entry.finZone);

  if (start !== "" && end !== "" && start !== end) {
    return `${start} → ${end}`;
  }

  if (start !== "") {
    return start;
  }

  if (end !== "") {
    return end;
  }

  return formatAdifTextValue(entry.ligneDescription);
}

export function formatAdifLtvKm(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) {
    return "";
  }

  return normalizeLtvKm(formatLtvDecimalKmInput(String(value)));
}

export function formatAdifLtvDate(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear());

  return `${day}/${month}/${year}`;
}

export function formatAdifLtvTime(value: string | null | undefined): string {
  const trimmed = formatAdifTextValue(value);

  if (trimmed === "") {
    return "";
  }

  const match = trimmed.match(/(\d{1,2}):(\d{2})/);

  if (!match) {
    return trimmed;
  }

  const hours = match[1].padStart(2, "0");
  const minutes = match[2];

  return `${hours}:${minutes}`;
}

export function isAdifFlagEnabled(value: string | null | undefined): boolean {
  const normalizedValue = formatAdifTextValue(value)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase();

  return ["1", "S", "SI", "YES", "TRUE", "X"].includes(normalizedValue);
}

export function formatAdifSourceDateForMessage(
  value: string | null | undefined
): string {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleDateString("fr-FR");
}

export function mapAdifEntryToLtvEditorRow(entry: LtvAdifApiEntry): LtvEditorRow {
  const code =
    entry.ltvId != null && Number.isFinite(entry.ltvId)
      ? String(entry.ltvId)
      : String(entry.objectId);

  return {
    id: `ltv-adif-${entry.objectId}`,
    origin: "adif",
    status: "unchanged",
    code,
    section: formatAdifLtvSection(entry),
    via: formatAdifTextValue(entry.voies),
    kmIni: formatAdifLtvKm(entry.pkDebut),
    kmFin: formatAdifLtvKm(entry.pkFin),
    speed: formatAdifTextValue(entry.vitesse),
    motivo: formatAdifTextValue(entry.motif),
    fecha1: formatAdifLtvDate(entry.dateDebutVigueur),
    hora1: formatAdifLtvTime(entry.heureDebutVigueur),
    fecha2: formatAdifLtvDate(entry.dateFinPrevue),
    hora2: formatAdifLtvTime(entry.heureFinPrevue),
    viaCheck: isAdifFlagEnabled(entry.nonSignaleeVoie),
    sistema: isAdifFlagEnabled(entry.nonSignaleeSysteme),
    soloCabeza: isAdifFlagEnabled(entry.vehiculeTete),
    csv: isAdifFlagEnabled(entry.csv),
    observaciones: formatAdifTextValue(entry.observations),
  };
}

function normalizeViaForVatardMatching(via: string): string {
  return via.trim().replace(/l/gi, "I").toUpperCase();
}

function vatardEntryMatchKey(entry: VatardApiEntry): string {
  return `${normalizeLtvKm(entry.startKm)}|${normalizeLtvKm(entry.endKm)}|${String(entry.speedNum)}|${normalizeViaForVatardMatching(entry.track)}`;
}

function adifRowMatchKeyForVatard(row: LtvEditorRow): string {
  return `${row.kmIni}|${row.kmFin}|${row.speed}|${normalizeViaForVatardMatching(row.via)}`;
}

export function enrichLtvRowsFromVatard(
  rows: LtvEditorRow[],
  vatardEntries: VatardApiEntry[]
): LtvEditorRow[] {
  const lookup = new Map<string, VatardApiEntry>();
  for (const entry of vatardEntries) {
    lookup.set(vatardEntryMatchKey(entry), entry);
  }

  return rows.map((row) => {
    const match = lookup.get(adifRowMatchKeyForVatard(row));
    if (!match) return row;

    const vatardFields: Partial<Record<string, boolean>> = {};
    const enriched: LtvEditorRow = { ...row };

    if (!row.motivo.trim() && match.reason.trim()) {
      enriched.motivo = match.reason;
      vatardFields.motivo = true;
    }
    if (!row.observaciones.trim() && match.comment.trim()) {
      enriched.observaciones = match.comment;
      vatardFields.observaciones = true;
    }
    if (!row.csv && match.csv === true) {
      enriched.csv = true;
      vatardFields.csv = true;
    }

    if (Object.keys(vatardFields).length > 0) {
      enriched.vatardFields = vatardFields;
    }
    return enriched;
  });
}

export function getLtvNormalizedRowBackground(row: LtvEditorRow): string {
  if (row.origin === "adif") {
    return "#ecfdf5"; // vert — importé depuis ADIF
  }

  if (row.origin === "manual") {
    return "#fce7f3"; // rose — ajout manuel
  }

  return "#f9fafb";
}

export function isLtvRowCompletelyEmpty(row: LtvEditorRow): boolean {
  return (
    row.code.trim() === "" &&
    row.section.trim() === "" &&
    row.via.trim() === "" &&
    row.kmIni.trim() === "" &&
    row.kmFin.trim() === "" &&
    row.speed.trim() === "" &&
    row.motivo.trim() === "" &&
    row.fecha1.trim() === "" &&
    row.hora1.trim() === "" &&
    row.fecha2.trim() === "" &&
    row.hora2.trim() === "" &&
    row.observaciones.trim() === "" &&
    !row.viaCheck &&
    !row.sistema &&
    !row.soloCabeza &&
    !row.csv
  );
}

export function getLtvPublicationWarnings(rows: LtvEditorRow[]): string[] {
  const warnings: string[] = [];

  rows.forEach((row, index) => {
    const missingFields: string[] = [];

    if (row.code.trim() === "") {
      missingFields.push("code");
    }

    if (row.kmIni.trim() === "") {
      missingFields.push("kmIni");
    }

    if (row.kmFin.trim() === "") {
      missingFields.push("kmFin");
    }

    if (row.speed.trim() === "") {
      missingFields.push("speed");
    }

    if (missingFields.length > 0) {
      warnings.push(
        `Ligne ${index + 1} : champs essentiels manquants (${missingFields.join(
          ", "
        )}).`
      );
    }
  });

  return warnings;
}

export function buildLtvNormalizedFile(
  rows: LtvEditorRow[],
  adifMeta: {
    source: string;
    fetchedAt: string;
    sourceUpdatedAt: string | null;
    sourceUpdatedFile: string | null;
  }
): LtvNormalizedFile {
  const publishableRows: LtvEditorRow[] = rows
    .filter((row) => !isLtvRowCompletelyEmpty(row))
    .map((row): LtvEditorRow => ({
      ...row,
      code: normalizeLtvCode(row.code),
      origin: row.origin === "adif" ? "adif" : "manual",
      status: "unchanged",
    }));

  return {
    meta: {
      line: LTV_ADIF_REFERENCE_LINE,
      publishedAt: new Date().toISOString(),
      adif: adifMeta,
    },
    rows: publishableRows,
    warnings: getLtvPublicationWarnings(publishableRows),
  };
}

export function readLtvTextField(
  value: unknown,
  field: LtvEditorTextField
): string {
  const textValue = typeof value === "string" ? value : "";

  if (field === "code") {
    return normalizeLtvCode(textValue);
  }

  const formatted = formatLtvTextInput(field, textValue);

  if (field === "kmIni" || field === "kmFin") {
    return normalizeLtvKm(formatted);
  }

  return formatted;
}

export function readLtvFlagField(value: unknown): boolean {
  return value === true;
}

function readLtvFieldMap(value: unknown): Partial<Record<string, boolean>> | undefined {
  if (!isRecord(value)) return undefined;
  const result: Partial<Record<string, boolean>> = {};
  for (const [field, flag] of Object.entries(value)) {
    if (flag === true) result[field] = true;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

export function readLtvEditedFields(value: unknown): Partial<Record<string, boolean>> | undefined {
  return readLtvFieldMap(value);
}

export function readLtvVatardFields(value: unknown): Partial<Record<string, boolean>> | undefined {
  return readLtvFieldMap(value);
}

export function readLtvNormalizedRowsFromFile(data: unknown): LtvEditorRow[] {
  if (!isRecord(data) || !Array.isArray(data.rows)) {
    return [];
  }

  return data.rows
    .map((rawRow, index): LtvEditorRow | null => {
      if (!isRecord(rawRow)) {
        return null;
      }

      const rawOrigin = rawRow.origin;
      const origin: LtvEditorRow["origin"] =
        rawOrigin === "adif" || rawOrigin === "manual" ? rawOrigin : "manual";

      const rawStatus = rawRow.status;
      const status: LtvEditorRow["status"] =
        rawStatus === "modified" || rawStatus === "added"
          ? rawStatus
          : "unchanged";

      const fallbackId =
        origin === "adif"
          ? `ltv-adif-loaded-${index + 1}`
          : `ltv-manual-loaded-${index + 1}`;

      return {
        id: typeof rawRow.id === "string" && rawRow.id.trim() !== ""
          ? rawRow.id
          : fallbackId,
        origin,
        status,
        code: readLtvTextField(rawRow.code, "code"),
        section: readLtvTextField(rawRow.section, "section"),
        via: readLtvTextField(rawRow.via, "via"),
        kmIni: readLtvTextField(rawRow.kmIni, "kmIni"),
        kmFin: readLtvTextField(rawRow.kmFin, "kmFin"),
        speed: readLtvTextField(rawRow.speed, "speed"),
        motivo: readLtvTextField(rawRow.motivo, "motivo"),
        fecha1: readLtvTextField(rawRow.fecha1, "fecha1"),
        hora1: readLtvTextField(rawRow.hora1, "hora1"),
        fecha2: readLtvTextField(rawRow.fecha2, "fecha2"),
        hora2: readLtvTextField(rawRow.hora2, "hora2"),
        viaCheck: readLtvFlagField(rawRow.viaCheck),
        sistema: readLtvFlagField(rawRow.sistema),
        soloCabeza: readLtvFlagField(rawRow.soloCabeza),
        csv: readLtvFlagField(rawRow.csv),
        observaciones: readLtvTextField(rawRow.observaciones, "observaciones"),
        editedFields: readLtvEditedFields(rawRow.editedFields),
        vatardFields: readLtvVatardFields(rawRow.vatardFields),
      };
    })
    .filter((row): row is LtvEditorRow => row !== null);
}

export function readLtvNormalizedFileInfo(data: unknown): {
  publishedAt: string;
  source: string;
  fetchedAt: string;
  sourceUpdatedAt: string | null;
  sourceUpdatedFile: string | null;
  warningCount: number;
} | null {
  if (!isRecord(data) || !isRecord(data.meta)) {
    return null;
  }

  const meta = data.meta;
  const adif = isRecord(meta.adif) ? meta.adif : {};
  const warnings = Array.isArray(data.warnings) ? data.warnings : [];

  return {
    publishedAt: typeof meta.publishedAt === "string" ? meta.publishedAt : "",
    source: typeof adif.source === "string" ? adif.source : "unknown",
    fetchedAt: typeof adif.fetchedAt === "string" ? adif.fetchedAt : "",
    sourceUpdatedAt:
      typeof adif.sourceUpdatedAt === "string" ? adif.sourceUpdatedAt : null,
    sourceUpdatedFile:
      typeof adif.sourceUpdatedFile === "string"
        ? adif.sourceUpdatedFile
        : null,
    warningCount: warnings.length,
  };
}

export function formatLtvDateTimeForDisplay(value: string): string {
  const trimmedValue = value.trim();

  if (trimmedValue === "") {
    return "—";
  }

  const date = new Date(trimmedValue);

  if (Number.isNaN(date.getTime())) {
    return trimmedValue;
  }

  return date.toLocaleString("fr-FR", {
    dateStyle: "long",
    timeStyle: "medium",
  });
}

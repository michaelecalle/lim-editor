import type { LigneFTNormalized } from "../types/ligneFTNormalized";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ArchiveListModal from "../components/ArchiveListModal";
import EditorStatusBanner from "../components/EditorStatusBanner";
import PublishConfirmDialog from "../components/PublishConfirmDialog";
import PublishVersionButton from "../components/PublishVersionButton";
import RestoreArchiveButton from "../components/RestoreArchiveButton";
import EditorShell from "../components/layout/EditorShell";
import DirectionSelector from "../components/toolbar/DirectionSelector";
import FTTable from "../components/ft-table/FTTable";
import RowDetailsPanel from "../components/details/RowDetailsPanel";
import type {
  EditorDirectField,
  EditorDirection,
  EditorFtRowView,
} from "../modules/ft-editor/types/viewTypes";
import type {
  FtSourceDirectionTables,
  FtSourceTrainData,
  FtSourceTrainMeta,
  FtSourceTrainRowData,
  FtSourceTrainVariantData,
} from "../modules/ft-editor/types/sourceTypes";
import {
  buildNormalizedFtSourceFileContent,
  downloadTextFile,
  fetchRemoteFtSourceRaw,
  inspectRemoteFtSourceRaw,
  parseFtSourceArraysFromRaw,
  validateNormalizedFtSource,
} from "../data/ligneFTSource";
import {
  fetchLigneFtArchive,
  fetchLigneFtArchives,
  publishLigneFtData,
} from "../modules/ft-editor/api/ligneftApi";
import { HORAIRE_COLUMNS } from "../modules/ft-editor/constants/ftColumns";
import { getDirectionRows } from "../modules/ft-editor/selectors/getDirectionRows";
import { areSourceTablesEqual } from "../modules/ft-editor/utils/areSourceTablesEqual";

type SourceStatus = "idle" | "loading" | "success" | "error";
type EditorTab = "FT" | "HORAIRE" | "LTV";

function getDirectionLabel(direction: EditorDirection): string {
  return direction === "NORD_SUD" ? "Nord → Sud" : "Sud → Nord";
}

function getSourceTableLabel(direction: EditorDirection): string {
  return direction === "NORD_SUD" ? "nordSud" : "sudNord";
}

function getRowPreview(row: EditorFtRowView | undefined): string {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getDirectionFromTrainNumber(
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

function parseHoraToMinutesForConc(value: string): number | null {
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

function hasLeadingZeros(trainNumber: string): boolean {
  return /^0\d+$/.test(trainNumber.trim());
}

function removeLeadingZeros(trainNumber: string): string {
  const trimmed = trainNumber.trim();
  const normalized = trimmed.replace(/^0+/, "");
  return normalized === "" ? "0" : normalized;
}

function buildDefaultVariantValidity() {
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
  };
}

function formatVariantDateForDisplay(value: string): string {
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

function buildEmptyLocalTrainVariantData(): FtSourceTrainVariantData {
  return {
    meta: {
      origine: "",
      destination: "",
      validity: buildDefaultVariantValidity(),
    },
    byRowKey: {},
  };
}

function buildLegacyTrainMeta(trainData: FtSourceTrainData): FtSourceTrainMeta {
  const rawTrainData = trainData as unknown;

  if (!isRecord(rawTrainData)) {
    return {
      origine: "",
      destination: "",
    };
  }

  const rawMeta = rawTrainData["meta"];

  if (!isRecord(rawMeta)) {
    return {
      origine: "",
      destination: "",
    };
  }

  return {
    origine: typeof rawMeta["origine"] === "string" ? rawMeta["origine"] : "",
    destination:
      typeof rawMeta["destination"] === "string" ? rawMeta["destination"] : "",
  };
}

function buildLegacyTrainByRowKey(
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

function getVariantCount(trainData: FtSourceTrainData | undefined): number {
  if (!trainData) {
    return 0;
  }

  if (Array.isArray(trainData.variants) && trainData.variants.length > 0) {
    return trainData.variants.length;
  }

  return 1;
}

function getVariantAtIndex(
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

function replaceVariantAtIndex(
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

function buildEmptyLocalTrainData(): FtSourceTrainData {
  return {
    variants: [buildEmptyLocalTrainVariantData()],
    publishState: "local",
  };
}

function getVariantActiveDayCount(days: {
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

function getOverlappingVariantDayLabels(
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

function doVariantDaysOverlap(
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

function normalizeVariantDateRange(startDate: string, endDate: string): {
  normalizedStart: string;
  normalizedEnd: string;
} {
  return {
    normalizedStart: startDate.trim() === "" ? "0000-01-01" : startDate.trim(),
    normalizedEnd: endDate.trim() === "" ? "9999-12-31" : endDate.trim(),
  };
}

function doVariantDateRangesOverlap(
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

function getConflictingVariantIndex(
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

function isTrainNumberInputValid(value: string): boolean {
  const trimmed = value.trim();
  return /^\d{1,6}$/.test(trimmed);
}

function materializeComputedConcForPublish(
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

function buildPublishedSourceForPublish(
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

    const variants =
      Array.isArray(trainData.variants) && trainData.variants.length > 0
        ? trainData.variants.map((variant) => ({
            meta: {
              origine: variant.meta.origine,
              destination: variant.meta.destination,
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
      },
      byRowKey: {
        ...primaryVariant.byRowKey,
      },
      ...(variants ? { variants } : {}),
    };
  }

  return {
    ...source,
    trains: nextTrains,
  } as unknown as LigneFTNormalized;
}

export default function FTEditorPage() {
  const [activeTab, setActiveTab] = useState<EditorTab>("FT");
  const [direction, setDirection] = useState<EditorDirection>("NORD_SUD");
  const [selectedTrainNumber, setSelectedTrainNumber] = useState<string>("");
  const [selectedOrigin, setSelectedOrigin] = useState<string>("");
  const [selectedDestination, setSelectedDestination] = useState<string>("");
  const [validatedOrigin, setValidatedOrigin] = useState<string>("");
  const [validatedDestination, setValidatedDestination] = useState<string>("");
  const [horaireSelectionsByTrain, setHoraireSelectionsByTrain] = useState<
    Record<
      string,
      {
        selectedOrigin: string;
        selectedDestination: string;
        validatedOrigin: string;
        validatedDestination: string;
      }
    >
  >({});
  const [selectedVariantIndexByTrain, setSelectedVariantIndexByTrain] = useState<
    Record<string, number>
  >({});
  const [horaireValidationError, setHoraireValidationError] = useState<
    string | null
  >(null);
  const [sourceStatus, setSourceStatus] = useState<SourceStatus>("idle");
  const [remoteInfo, setRemoteInfo] = useState<string>(
    "Aucune tentative de chargement."
  );
  const [inspectionLines, setInspectionLines] = useState<string[]>([
    "Aucune inspection effectuée.",
  ]);
  const [parsedSource, setParsedSource] = useState<FtSourceDirectionTables>({
    nordSud: { rows: [] },
    sudNord: { rows: [] },
  });
  const [referenceData, setReferenceData] = useState<FtSourceDirectionTables>({
    nordSud: { rows: [] },
    sudNord: { rows: [] },
  });
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [requestedEditorField, setRequestedEditorField] =
    useState<EditorDirectField | null>(null);
  const [exportStatus, setExportStatus] = useState<
    "idle" | "success" | "error"
  >("idle");
  const [exportMessage, setExportMessage] = useState<string>(
    "Aucun export local effectué."
  );
  const [exportDiagnostics, setExportDiagnostics] = useState<string[]>([]);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isPublishDialogOpen, setIsPublishDialogOpen] = useState(false);
    const [publishSuccessMessage, setPublishSuccessMessage] = useState<string | null>(null);
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false);
  const [isRestoreListLoading, setIsRestoreListLoading] = useState(false);
  const [restoreArchives, setRestoreArchives] = useState<
    { name: string; timestamp: string | null }[]
  >([]);
  const [restoreErrorMessage, setRestoreErrorMessage] = useState<string | null>(
    null
  );
  const [isCreateTrainModalOpen, setIsCreateTrainModalOpen] = useState(false);
  const [createTrainInput, setCreateTrainInput] = useState("");
  const createTrainInputRef = useRef<HTMLInputElement | null>(null);
  const [isLeadingZeroConfirmOpen, setIsLeadingZeroConfirmOpen] =
    useState(false);
  const [pendingLeadingZeroTrainNumber, setPendingLeadingZeroTrainNumber] =
    useState("");
  const [isDuplicateTrainConfirmOpen, setIsDuplicateTrainConfirmOpen] =
    useState(false);
  const [pendingDuplicateTrainNumber, setPendingDuplicateTrainNumber] =
    useState("");
  const [lastDuplicateVariantDecision, setLastDuplicateVariantDecision] =
    useState<"yes" | "no" | null>(null);
  const [isDeleteTrainConfirmOpen, setIsDeleteTrainConfirmOpen] =
    useState(false);
  const [pendingVariantDeleteIndex, setPendingVariantDeleteIndex] = useState<
    number | null
  >(null);
  const [variantValidityDraft, setVariantValidityDraft] = useState<{
    trainNumber: string;
    variantIndex: number;
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
  }>({
    trainNumber: "",
    variantIndex: -1,
    startDate: "",
    endDate: "",
    days: buildDefaultVariantValidity().days,
  });
  const [openVariantValidityEditor, setOpenVariantValidityEditor] = useState<{
    trainNumber: string;
    variantIndex: number;
  }>({
    trainNumber: "",
    variantIndex: -1,
  });
  const [variantValidityError, setVariantValidityError] = useState<string | null>(
    null
  );

  const directionLabel = getDirectionLabel(direction);
  const sourceTableLabel = getSourceTableLabel(direction);

  useEffect(() => {
    if (!isCreateTrainModalOpen) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      createTrainInputRef.current?.focus();
      createTrainInputRef.current?.select();
    });

    function handleWindowKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }

      if (isLeadingZeroConfirmOpen || isDuplicateTrainConfirmOpen) {
        return;
      }

      setCreateTrainInput("");
      setPendingLeadingZeroTrainNumber("");
      setPendingDuplicateTrainNumber("");
      setIsLeadingZeroConfirmOpen(false);
      setIsDuplicateTrainConfirmOpen(false);
      setLastDuplicateVariantDecision(null);
      setIsCreateTrainModalOpen(false);
    }

    window.addEventListener("keydown", handleWindowKeyDown);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("keydown", handleWindowKeyDown);
    };
  }, [
    isCreateTrainModalOpen,
    isDuplicateTrainConfirmOpen,
    isLeadingZeroConfirmOpen,
  ]);

  useEffect(() => {
    if (!isLeadingZeroConfirmOpen) {
      return;
    }

    function handleWindowKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setPendingLeadingZeroTrainNumber("");
        setIsLeadingZeroConfirmOpen(false);
      }
    }

    window.addEventListener("keydown", handleWindowKeyDown);

    return () => {
      window.removeEventListener("keydown", handleWindowKeyDown);
    };
  }, [isLeadingZeroConfirmOpen]);

  useEffect(() => {
    if (!isDuplicateTrainConfirmOpen) {
      return;
    }

    function handleWindowKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setLastDuplicateVariantDecision("no");
        setPendingDuplicateTrainNumber("");
        setIsDuplicateTrainConfirmOpen(false);
      }
    }

    window.addEventListener("keydown", handleWindowKeyDown);

    return () => {
      window.removeEventListener("keydown", handleWindowKeyDown);
    };
  }, [isDuplicateTrainConfirmOpen]);

  useEffect(() => {
    if (!isDeleteTrainConfirmOpen) {
      return;
    }

    function handleWindowKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsDeleteTrainConfirmOpen(false);
      }
    }

    window.addEventListener("keydown", handleWindowKeyDown);

    return () => {
      window.removeEventListener("keydown", handleWindowKeyDown);
    };
  }, [isDeleteTrainConfirmOpen]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setSourceStatus("loading");
      setRemoteInfo("Chargement du fichier distant en cours...");
      setInspectionLines(["Inspection en attente..."]);
      setParsedSource({
        nordSud: { rows: [] },
        sudNord: { rows: [] },
      });

      const result = await fetchRemoteFtSourceRaw();

      if (cancelled) {
        return;
      }

      if (!result.ok) {
        setSourceStatus("error");
        setRemoteInfo(result.errorMessage);
        setInspectionLines([
          "Inspection impossible car le chargement a échoué.",
        ]);
        return;
      }

      const inspection = inspectRemoteFtSourceRaw(result.rawText);
      const parsed = parseFtSourceArraysFromRaw(result.rawText);

      if (!parsed.ok) {
        setSourceStatus("error");
        setRemoteInfo(
          `Fichier chargé (${result.rawText.length} caractères), mais parsing impossible.`
        );
        setInspectionLines([
          `export const LIGNE_FT_NORMALIZED présent : ${
            inspection.hasNormalizedExport ? "oui" : "non"
          }`,
          `nordSud présent : ${inspection.hasNordSudTable ? "oui" : "non"}`,
          `sudNord présent : ${inspection.hasSudNordTable ? "oui" : "non"}`,
          `Erreur de parsing : ${parsed.errorMessage}`,
        ]);
        return;
      }

      setSourceStatus("success");
      setRemoteInfo(
        `Fichier chargé et tableaux extraits : ${result.rawText.length} caractères reçus.`
      );
      setInspectionLines([
        `export const LIGNE_FT_NORMALIZED présent : ${
          inspection.hasNormalizedExport ? "oui" : "non"
        }`,
        `nordSud présent : ${inspection.hasNordSudTable ? "oui" : "non"}`,
        `sudNord présent : ${inspection.hasSudNordTable ? "oui" : "non"}`,
        `Occurrences nordSud : ${inspection.nordSudOccurrences}`,
        `Occurrences sudNord : ${inspection.sudNordOccurrences}`,
        `Lignes extraites nordSud : ${parsed.source.nordSud.rows.length}`,
        `Lignes extraites sudNord : ${parsed.source.sudNord.rows.length}`,
      ]);
      setParsedSource(parsed.source);
      setReferenceData(parsed.source);
    }

    run();

    return () => {
      cancelled = true;
    };
  }, []);

  const sourceRows = useMemo(() => {
    return getDirectionRows(parsedSource, direction);
  }, [parsedSource, direction]);

  const selectedVariantIndex =
    selectedVariantIndexByTrain[selectedTrainNumber] ?? 0;

  const selectedTrainData = parsedSource.trains?.[selectedTrainNumber];
  const selectedVariantCount = getVariantCount(selectedTrainData);
  const selectedVariant = getVariantAtIndex(
    selectedTrainData,
    selectedVariantIndex
  );

  const horaireRows = useMemo(() => {
    if (!selectedVariant) {
      return sourceRows.map((row) => ({
        ...row,
        visual: {
          ...row.visual,
          concTone: "default" as const,
        },
      }));
    }

    function parseHoraToMinutes(value: string): number | null {
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

    let previousHoraMinutes: number | null = null;

    return sourceRows.map((row) => {
      const rowTrainData = selectedVariant.byRowKey[row.id] as
        | FtSourceTrainRowData
        | undefined;

      const nextCom =
        rowTrainData?.com != null ? rowTrainData.com : row.visible.com;
      const nextHora =
        rowTrainData?.hora != null ? rowTrainData.hora : row.visible.hora;
      const nextTecn =
        rowTrainData?.tecn != null ? rowTrainData.tecn : row.visible.tecn;

      const currentHoraMinutes = parseHoraToMinutes(nextHora ?? "");
      let computedConc = "";

      if (currentHoraMinutes != null && previousHoraMinutes != null) {
        const rawDiff = currentHoraMinutes - previousHoraMinutes;
        computedConc = String(rawDiff >= 0 ? rawDiff : rawDiff + 24 * 60);
      }

      let nextConc = "";
      let concTone: "default" | "computed" | "manualOverride" = "default";

      if (rowTrainData?.conc != null) {
        nextConc = rowTrainData.conc;

        if (computedConc !== "" && rowTrainData.conc !== computedConc) {
          concTone = "manualOverride";
        }
      } else if (computedConc !== "") {
        nextConc = computedConc;
        concTone = "computed";
      }

      if (currentHoraMinutes != null) {
        previousHoraMinutes = currentHoraMinutes;
      }

      return {
        ...row,
        visible: {
          ...row.visible,
          com: nextCom ?? "",
          hora: nextHora ?? "",
          tecn: nextTecn ?? "",
          conc: nextConc,
        },
        visual: {
          ...row.visual,
          concTone,
        },
      };
    });
  }, [selectedVariant, sourceRows]);

  const availableTrainNumbers = useMemo(() => {
    return Object.keys(parsedSource.trains ?? {}).sort((a, b) =>
      a.localeCompare(b, "fr", { numeric: true, sensitivity: "base" })
    );
  }, [parsedSource]);

  const unpublishedTrainNumbers = useMemo(() => {
    return new Set(
      Object.entries(parsedSource.trains ?? {})
        .filter(([, trainData]) => trainData.publishState === "local")
        .map(([trainNumber]) => trainNumber)
    );
  }, [parsedSource.trains]);

  const isSelectedTrainUnpublished =
    selectedTrainNumber.trim() !== "" &&
    unpublishedTrainNumbers.has(selectedTrainNumber);

  const horaireLocationOptions = useMemo(() => {
    const values = sourceRows
      .map((row) => row.visible.dependencia.trim())
      .filter((value) => value !== "");

    return Array.from(new Set(values));
  }, [sourceRows]);

  const displayedHoraireRows = useMemo(() => {
    if (validatedOrigin === "" || validatedDestination === "") {
      return horaireRows;
    }

    const originIndex = horaireRows.findIndex(
      (row) => row.visible.dependencia.trim() === validatedOrigin
    );
    const destinationIndex = horaireRows.findIndex(
      (row) => row.visible.dependencia.trim() === validatedDestination
    );

    if (originIndex === -1 || destinationIndex === -1) {
      return horaireRows;
    }

    const startIndex = Math.min(originIndex, destinationIndex);
    const endIndex = Math.max(originIndex, destinationIndex);

    return horaireRows.slice(startIndex, endIndex + 1);
  }, [horaireRows, validatedOrigin, validatedDestination]);

  const handleValidateHoraireSelection = useCallback(() => {
    const trimmedOrigin = selectedOrigin.trim();
    const trimmedDestination = selectedDestination.trim();

    if (trimmedOrigin === "") {
      setHoraireValidationError("Choisis une origine.");
      return;
    }

    if (trimmedDestination === "") {
      setHoraireValidationError("Choisis une destination.");
      return;
    }

    if (trimmedOrigin === trimmedDestination) {
      setHoraireValidationError(
        "L’origine et la destination doivent être différentes."
      );
      return;
    }

    const originIndex = horaireRows.findIndex(
      (row) => row.visible.dependencia.trim() === trimmedOrigin
    );
    const destinationIndex = horaireRows.findIndex(
      (row) => row.visible.dependencia.trim() === trimmedDestination
    );

    if (originIndex === -1 || destinationIndex === -1) {
      setHoraireValidationError(
        "Origine ou destination introuvable dans le tableau actuel."
      );
      return;
    }

    if (originIndex > destinationIndex) {
      setHoraireValidationError(
        "L’ordre origine / destination n’est pas cohérent avec le sens actuellement affiché."
      );
      return;
    }

    setValidatedOrigin(trimmedOrigin);
    setValidatedDestination(trimmedDestination);
    setHoraireValidationError(null);

    if (selectedTrainNumber.trim() !== "") {
      setHoraireSelectionsByTrain((previous) => ({
        ...previous,
        [selectedTrainNumber]: {
          selectedOrigin: trimmedOrigin,
          selectedDestination: trimmedDestination,
          validatedOrigin: trimmedOrigin,
          validatedDestination: trimmedDestination,
        },
      }));

      setParsedSource((previous) => {
        const previousTrains = previous.trains ?? {};
        const previousTrain = previousTrains[selectedTrainNumber];

        if (!previousTrain) {
          return previous;
        }

        const nextSelectedVariant = getVariantAtIndex(
          previousTrain,
          selectedVariantIndex
        );

        if (!nextSelectedVariant) {
          return previous;
        }

        return {
          ...previous,
          trains: {
            ...previousTrains,
            [selectedTrainNumber]: replaceVariantAtIndex(
              previousTrain,
              selectedVariantIndex,
              {
                ...nextSelectedVariant,
                meta: {
                  ...nextSelectedVariant.meta,
                  origine: trimmedOrigin,
                  destination: trimmedDestination,
                },
              }
            ),
          },
        };
      });
    }
  }, [
    horaireRows,
    selectedDestination,
    selectedOrigin,
    selectedTrainNumber,
    selectedVariantIndex,
  ]);

  const hasUnpublishedChanges = useMemo(() => {
    return !areSourceTablesEqual(parsedSource, referenceData);
  }, [parsedSource, referenceData]);

  useEffect(() => {
    if (availableTrainNumbers.length === 0) {
      if (selectedTrainNumber !== "") {
        setSelectedTrainNumber("");
      }
      return;
    }

    const stillExists = availableTrainNumbers.includes(selectedTrainNumber);

    if (!stillExists) {
      setSelectedTrainNumber(availableTrainNumbers[0]);
    }
  }, [availableTrainNumbers, selectedTrainNumber]);

  useEffect(() => {
    if (selectedTrainNumber.trim() === "") {
      return;
    }

    const nextDirection = getDirectionFromTrainNumber(selectedTrainNumber);

    if (nextDirection == null) {
      return;
    }

    setDirection((previous) =>
      previous === nextDirection ? previous : nextDirection
    );
  }, [selectedTrainNumber]);

  useEffect(() => {
    if (selectedTrainNumber.trim() === "") {
      setSelectedOrigin("");
      setSelectedDestination("");
      setValidatedOrigin("");
      setValidatedDestination("");
      setHoraireValidationError(null);
      return;
    }

    const savedSelection = horaireSelectionsByTrain[selectedTrainNumber];

    if (savedSelection) {
      setSelectedOrigin(savedSelection.selectedOrigin);
      setSelectedDestination(savedSelection.selectedDestination);
      setValidatedOrigin(savedSelection.validatedOrigin);
      setValidatedDestination(savedSelection.validatedDestination);
      setHoraireValidationError(null);
      return;
    }

    const selectedVariant = getVariantAtIndex(
      parsedSource.trains?.[selectedTrainNumber],
      selectedVariantIndex
    );
    const metaOrigin = selectedVariant?.meta.origine?.trim() ?? "";
    const metaDestination = selectedVariant?.meta.destination?.trim() ?? "";

    if (metaOrigin !== "" && metaDestination !== "") {
      setSelectedOrigin(metaOrigin);
      setSelectedDestination(metaDestination);
      setValidatedOrigin(metaOrigin);
      setValidatedDestination(metaDestination);
      setHoraireValidationError(null);
      return;
    }

    setSelectedOrigin("");
    setSelectedDestination("");
    setValidatedOrigin("");
    setValidatedDestination("");
    setHoraireValidationError(null);
  }, [
    horaireSelectionsByTrain,
    parsedSource,
    selectedTrainNumber,
    selectedVariantIndex,
  ]);

  useEffect(() => {
    if (sourceRows.length === 0) {
      setSelectedRowId(null);
      return;
    }

    const selectedRowStillExists = sourceRows.some(
      (row) => row.id === selectedRowId
    );

    if (!selectedRowStillExists) {
      setSelectedRowId(sourceRows[0].id);
    }
  }, [sourceRows, selectedRowId]);

  useEffect(() => {
    const validity = selectedVariant?.meta.validity;
    const nextTrainNumber = selectedTrainNumber;
    const nextVariantIndex = selectedVariantIndex;
    const nextStartDate = validity?.startDate ?? "";
    const nextEndDate = validity?.endDate ?? "";
    const nextDays = validity?.days ?? buildDefaultVariantValidity().days;

    setVariantValidityDraft((previous) => {
      if (
        previous.trainNumber === nextTrainNumber &&
        previous.variantIndex === nextVariantIndex &&
        previous.startDate === nextStartDate &&
        previous.endDate === nextEndDate &&
        previous.days.monday === nextDays.monday &&
        previous.days.tuesday === nextDays.tuesday &&
        previous.days.wednesday === nextDays.wednesday &&
        previous.days.thursday === nextDays.thursday &&
        previous.days.friday === nextDays.friday &&
        previous.days.saturday === nextDays.saturday &&
        previous.days.sunday === nextDays.sunday
      ) {
        return previous;
      }

      return {
        trainNumber: nextTrainNumber,
        variantIndex: nextVariantIndex,
        startDate: nextStartDate,
        endDate: nextEndDate,
        days: {
          monday: nextDays.monday,
          tuesday: nextDays.tuesday,
          wednesday: nextDays.wednesday,
          thursday: nextDays.thursday,
          friday: nextDays.friday,
          saturday: nextDays.saturday,
          sunday: nextDays.sunday,
        },
      };
    });

    setVariantValidityError(null);
  }, [
    selectedTrainNumber,
    selectedVariantIndex,
    selectedVariant?.meta.validity?.startDate,
    selectedVariant?.meta.validity?.endDate,
    selectedVariant?.meta.validity?.days?.monday,
    selectedVariant?.meta.validity?.days?.tuesday,
    selectedVariant?.meta.validity?.days?.wednesday,
    selectedVariant?.meta.validity?.days?.thursday,
    selectedVariant?.meta.validity?.days?.friday,
    selectedVariant?.meta.validity?.days?.saturday,
    selectedVariant?.meta.validity?.days?.sunday,
  ]);

  const firstRowPreview = useMemo(() => {
    return getRowPreview(sourceRows[0]);
  }, [sourceRows]);

  const lastRowPreview = useMemo(() => {
    return getRowPreview(sourceRows[sourceRows.length - 1]);
  }, [sourceRows]);

  const selectedRow = useMemo(() => {
    return sourceRows.find((row) => row.id === selectedRowId) ?? null;
  }, [sourceRows, selectedRowId]);

  const bloqueoOptions = useMemo(() => {
    const values = sourceRows
      .map((row) => row.visible.bloqueo.trim())
      .filter((value) => value !== "");

    return Array.from(new Set(values)).sort((a, b) =>
      a.localeCompare(b, "fr", { sensitivity: "base" })
    );
  }, [sourceRows]);

  const vmaxOptions = useMemo(() => {
    const values = sourceRows
      .map((row) => row.visible.vmax.trim())
      .filter((value) => value !== "");

    return Array.from(new Set(values)).sort((a, b) =>
      a.localeCompare(b, "fr", { sensitivity: "base", numeric: true })
    );
  }, [sourceRows]);

  const rcOptions = useMemo(() => {
    const values = sourceRows
      .map((row) => row.visible.rc.trim())
      .filter((value) => value !== "");

    return Array.from(new Set(values)).sort((a, b) =>
      a.localeCompare(b, "fr", { sensitivity: "base", numeric: true })
    );
  }, [sourceRows]);

  const radioOptions = useMemo(() => {
    const values = sourceRows
      .map((row) => row.visible.radio.trim())
      .filter((value) => value !== "");

    return Array.from(new Set(values)).sort((a, b) =>
      a.localeCompare(b, "fr", { sensitivity: "base", numeric: true })
    );
  }, [sourceRows]);

  const networkOptions = useMemo(() => {
    const values = sourceRows
      .map((row) => row.technical.network?.trim() ?? "")
      .filter((value) => value !== "");

    return Array.from(new Set(values)).sort((a, b) =>
      a.localeCompare(b, "fr", { sensitivity: "base" })
    );
  }, [sourceRows]);

  const etcsOptions = useMemo(() => {
    const values = sourceRows
      .map((row) => row.visible.etcs.trim())
      .filter((value) => value !== "");

    return Array.from(new Set(values)).sort((a, b) =>
      a.localeCompare(b, "fr", { sensitivity: "base" })
    );
  }, [sourceRows]);

  const handleApplyBloqueo = useCallback(
    (nextBloqueo: string) => {
      if (!selectedRow) {
        return;
      }

      const trimmedValue = nextBloqueo.trim();

      setParsedSource((previous) => {
        const tableName = selectedRow.identity.sourceTableName;
        const currentTable = previous[tableName];

        const nextRows = currentTable.rows.map((rawRow) => {
          if (!isRecord(rawRow)) {
            return rawRow;
          }

          const rawId = typeof rawRow["id"] === "string" ? rawRow["id"] : "";

          if (rawId !== selectedRow.id) {
            return rawRow;
          }

          return {
            ...rawRow,
            bloqueo: trimmedValue,
          };
        });

        return {
          ...previous,
          [tableName]: {
            rows: nextRows,
          },
        };
      });
    },
    [selectedRow]
  );

  const handleApplyNetwork = useCallback(
    (nextNetwork: string) => {
      if (!selectedRow) {
        return;
      }

      const trimmedValue = nextNetwork.trim();

      setParsedSource((previous) => {
        const tableName = selectedRow.identity.sourceTableName;
        const currentTable = previous[tableName];

        const nextRows = currentTable.rows.map((rawRow) => {
          if (!isRecord(rawRow)) {
            return rawRow;
          }

          const rawId = typeof rawRow["id"] === "string" ? rawRow["id"] : "";

          if (rawId !== selectedRow.id) {
            return rawRow;
          }

          return {
            ...rawRow,
            reseau: trimmedValue,
          };
        });

        return {
          ...previous,
          [tableName]: {
            rows: nextRows,
          },
        };
      });
    },
    [selectedRow]
  );

  const handleApplyVmax = useCallback(
    (nextVmax: string) => {
      if (!selectedRow) {
        return;
      }

      const trimmedValue = nextVmax.trim();

      setParsedSource((previous) => {
        const tableName = selectedRow.identity.sourceTableName;
        const currentTable = previous[tableName];

        const nextRows = currentTable.rows.map((rawRow) => {
          if (!isRecord(rawRow)) {
            return rawRow;
          }

          const rawId = typeof rawRow["id"] === "string" ? rawRow["id"] : "";

          if (rawId !== selectedRow.id) {
            return rawRow;
          }

          return {
            ...rawRow,
            vmax: trimmedValue,
          };
        });

        return {
          ...previous,
          [tableName]: {
            rows: nextRows,
          },
        };
      });
    },
    [selectedRow]
  );

  const handleApplyRc = useCallback(
    (nextRc: string) => {
      if (!selectedRow) {
        return;
      }

      const trimmedValue = nextRc.trim();

      setParsedSource((previous) => {
        const tableName = selectedRow.identity.sourceTableName;
        const currentTable = previous[tableName];

        const nextRows = currentTable.rows.map((rawRow) => {
          if (!isRecord(rawRow)) {
            return rawRow;
          }

          const rawId = typeof rawRow["id"] === "string" ? rawRow["id"] : "";

          if (rawId !== selectedRow.id) {
            return rawRow;
          }

          return {
            ...rawRow,
            rampCaract: trimmedValue,
          };
        });

        return {
          ...previous,
          [tableName]: {
            rows: nextRows,
          },
        };
      });
    },
    [selectedRow]
  );

  const handleApplyRadio = useCallback(
    (nextRadio: string) => {
      if (!selectedRow) {
        return;
      }

      const trimmedValue = nextRadio.trim();

      setParsedSource((previous) => {
        const tableName = selectedRow.identity.sourceTableName;
        const currentTable = previous[tableName];

        const nextRows = currentTable.rows.map((rawRow) => {
          if (!isRecord(rawRow)) {
            return rawRow;
          }

          const rawId = typeof rawRow["id"] === "string" ? rawRow["id"] : "";

          if (rawId !== selectedRow.id) {
            return rawRow;
          }

          return {
            ...rawRow,
            radio: trimmedValue,
          };
        });

        return {
          ...previous,
          [tableName]: {
            rows: nextRows,
          },
        };
      });
    },
    [selectedRow]
  );

  const handleApplyDependencia = useCallback(
    (nextDependencia: string) => {
      if (!selectedRow) {
        return;
      }

      const trimmedValue = nextDependencia.trim();

      setParsedSource((previous) => {
        const tableName = selectedRow.identity.sourceTableName;
        const currentTable = previous[tableName];

        const nextRows = currentTable.rows.map((rawRow) => {
          if (!isRecord(rawRow)) {
            return rawRow;
          }

          const rawId = typeof rawRow["id"] === "string" ? rawRow["id"] : "";

          if (rawId !== selectedRow.id) {
            return rawRow;
          }

          return {
            ...rawRow,
            dependencia: trimmedValue,
          };
        });

        return {
          ...previous,
          [tableName]: {
            rows: nextRows,
          },
        };
      });
    },
    [selectedRow]
  );

  const handleApplyPkInternal = useCallback(
    (nextPkInternal: string) => {
      if (!selectedRow) {
        return;
      }

      const trimmedValue = nextPkInternal.trim();

      setParsedSource((previous) => {
        const tableName = selectedRow.identity.sourceTableName;
        const currentTable = previous[tableName];

        const nextRows = currentTable.rows.map((rawRow) => {
          if (!isRecord(rawRow)) {
            return rawRow;
          }

          const rawId = typeof rawRow["id"] === "string" ? rawRow["id"] : "";

          if (rawId !== selectedRow.id) {
            return rawRow;
          }

          return {
            ...rawRow,
            pkInterne: trimmedValue,
          };
        });

        return {
          ...previous,
          [tableName]: {
            rows: nextRows,
          },
        };
      });
    },
    [selectedRow]
  );

  const handleApplyPkDisplay = useCallback(
    (nextPkDisplay: string) => {
      if (!selectedRow) {
        return;
      }

      const trimmedValue = nextPkDisplay.trim();

      setParsedSource((previous) => {
        const tableName = selectedRow.identity.sourceTableName;
        const currentTable = previous[tableName];

        const nextRows = currentTable.rows.map((rawRow) => {
          if (!isRecord(rawRow)) {
            return rawRow;
          }

          const rawId = typeof rawRow["id"] === "string" ? rawRow["id"] : "";

          if (rawId !== selectedRow.id) {
            return rawRow;
          }

          return {
            ...rawRow,
            sitKm: trimmedValue,
          };
        });

        return {
          ...previous,
          [tableName]: {
            rows: nextRows,
          },
        };
      });
    },
    [selectedRow]
  );

  const handleApplyCsv = useCallback(
    (nextCsv: boolean) => {
      if (!selectedRow) {
        return;
      }

      setParsedSource((previous) => {
        const tableName = selectedRow.identity.sourceTableName;
        const currentTable = previous[tableName];

        const nextRows = currentTable.rows.map((rawRow) => {
          if (!isRecord(rawRow)) {
            return rawRow;
          }

          const rawId = typeof rawRow["id"] === "string" ? rawRow["id"] : "";

          if (rawId !== selectedRow.id) {
            return rawRow;
          }

          return {
            ...rawRow,
            csv: nextCsv,
          };
        });

        return {
          ...previous,
          [tableName]: {
            rows: nextRows,
          },
        };
      });
    },
    [selectedRow]
  );

  const handleApplyEtcs = useCallback(
    (nextEtcs: string) => {
      if (!selectedRow) {
        return;
      }

      const trimmedValue = nextEtcs.trim();

      setParsedSource((previous) => {
        const tableName = selectedRow.identity.sourceTableName;
        const currentTable = previous[tableName];

        const nextRows = currentTable.rows.map((rawRow) => {
          if (!isRecord(rawRow)) {
            return rawRow;
          }

          const rawId = typeof rawRow["id"] === "string" ? rawRow["id"] : "";

          if (rawId !== selectedRow.id) {
            return rawRow;
          }

          return {
            ...rawRow,
            etcs: trimmedValue,
          };
        });

        return {
          ...previous,
          [tableName]: {
            rows: nextRows,
          },
        };
      });
    },
    [selectedRow]
  );

  const handlePublishClick = useCallback(() => {
    if (!hasUnpublishedChanges || isPublishing) {
      return;
    }

    setExportStatus("idle");
    setExportMessage("Aucun export local effectué.");
    setExportDiagnostics([]);
    setPublishSuccessMessage(null);
    setIsPublishDialogOpen(true);
  }, [hasUnpublishedChanges, isPublishing]);

  const handleCancelPublish = useCallback(() => {
    if (isPublishing) {
      return;
    }

    setPublishSuccessMessage(null);
    setIsPublishDialogOpen(false);
  }, [isPublishing]);

  const handleOpenRestoreModal = useCallback(async () => {
    if (isRestoreListLoading || isPublishing) {
      return;
    }

    setRestoreErrorMessage(null);
    setRestoreArchives([]);
    setIsRestoreListLoading(true);
    setIsRestoreModalOpen(true);

    try {
      const response = await fetchLigneFtArchives();
      setRestoreArchives(response.archives);
    } catch (error) {
      setRestoreErrorMessage(
        error instanceof Error
          ? `Chargement des archives échoué : ${error.message}`
          : "Chargement des archives échoué : erreur inconnue."
      );
    } finally {
      setIsRestoreListLoading(false);
    }
  }, [isRestoreListLoading, isPublishing]);

  const handleCloseRestoreModal = useCallback(() => {
    if (isRestoreListLoading) {
      return;
    }

    setIsRestoreModalOpen(false);
  }, [isRestoreListLoading]);

  const handleSelectArchive = useCallback(async (archiveName: string) => {
    if (isRestoreListLoading) {
      return;
    }

    setRestoreErrorMessage(null);
    setIsRestoreListLoading(true);

    try {
      const response = await fetchLigneFtArchive(archiveName);
      const restoredData = response.archive.data as FtSourceDirectionTables;

      setParsedSource(restoredData);
      setExportStatus("success");
      setExportMessage(
        `Archive chargée localement : ${response.archive.name}. Cette version n’est pas encore remise en service tant qu’elle n’est pas republiée.`
      );
      setExportDiagnostics([
        `Archive chargée : ${response.archive.name}`,
        "Aucune publication automatique n’a été effectuée.",
      ]);
      setRestoreErrorMessage(null);
      setIsRestoreModalOpen(false);
    } catch (error) {
      setRestoreErrorMessage(
        error instanceof Error
          ? `Chargement de l’archive échoué : ${error.message}`
          : "Chargement de l’archive échoué : erreur inconnue."
      );
    } finally {
      setIsRestoreListLoading(false);
    }
  }, []);

  const handleConfirmPublish = useCallback(async () => {
    if (isPublishing) {
      return;
    }

    setIsPublishing(true);

    try {
      const materializedSource = materializeComputedConcForPublish(parsedSource);
      const publishedPayload = buildPublishedSourceForPublish(materializedSource);
      const response = await publishLigneFtData(publishedPayload);

      setParsedSource(materializedSource);
      setReferenceData(materializedSource);
      setExportStatus("success");
      setExportMessage(
        `Publication réussie : fichier actif mis à jour dans LIM Editor et JSON actif publié aussi vers LIM2, archive créée ${response.diagnostic.archiveCreated.name}.`
      );
      setExportDiagnostics([
        `Fichier TS publié dans LIM Editor : ${response.diagnostic.publishedPath}`,
        `Fichier JSON publié dans LIM Editor : ${response.diagnostic.publishedJsonPath}`,
        `Fichier JSON publié dans LIM2 : ${response.diagnostic.publishedLim2JsonPath}`,
        `Archive créée : ${response.diagnostic.archiveCreated.path}`,
        response.diagnostic.purgedArchives.length > 0
          ? `Archives purgées : ${response.diagnostic.purgedArchives.join(", ")}`
          : "Aucune archive à purger.",
      ]);
      setPublishSuccessMessage(
        "La publication a bien été effectuée. La mise à jour peut nécessiter quelques minutes avant d’être visible sur les versions en ligne."
      );
    } catch (error) {
      setExportStatus("error");
      setExportMessage(
        error instanceof Error
          ? `Publication échouée : ${error.message}`
          : "Publication échouée : erreur inconnue."
      );
      setExportDiagnostics([
        "La version en service n’a pas été remplacée par l’éditeur tant que la publication n’a pas abouti.",
      ]);
    } finally {
      setIsPublishing(false);
    }
  }, [isPublishing, parsedSource]);

  const handleCreateTrain = useCallback(() => {
    setCreateTrainInput("");
    setPendingLeadingZeroTrainNumber("");
    setPendingDuplicateTrainNumber("");
    setIsLeadingZeroConfirmOpen(false);
    setIsDuplicateTrainConfirmOpen(false);
    setLastDuplicateVariantDecision(null);
    setIsCreateTrainModalOpen(true);
  }, []);

  const handleCancelCreateTrain = useCallback(() => {
    setCreateTrainInput("");
    setPendingLeadingZeroTrainNumber("");
    setPendingDuplicateTrainNumber("");
    setIsLeadingZeroConfirmOpen(false);
    setIsDuplicateTrainConfirmOpen(false);
    setLastDuplicateVariantDecision(null);
    setIsCreateTrainModalOpen(false);
  }, []);

  const finalizeCreateTrain = useCallback(
    (nextTrainNumber: string) => {
      const existingTrain = parsedSource.trains?.[nextTrainNumber];

      if (existingTrain != null) {
        setPendingDuplicateTrainNumber(nextTrainNumber);
        setIsDuplicateTrainConfirmOpen(true);
        return;
      }

      setParsedSource((previous) => {
        const previousTrains = previous.trains ?? {};

        return {
          ...previous,
          trains: {
            ...previousTrains,
            [nextTrainNumber]: buildEmptyLocalTrainData(),
          },
        };
      });

      setSelectedTrainNumber(nextTrainNumber);
      setCreateTrainInput("");
      setPendingLeadingZeroTrainNumber("");
      setPendingDuplicateTrainNumber("");
      setIsLeadingZeroConfirmOpen(false);
      setIsDuplicateTrainConfirmOpen(false);
      setLastDuplicateVariantDecision(null);
      setIsCreateTrainModalOpen(false);
    },
    [parsedSource.trains]
  );

  const handleConfirmCreateTrain = useCallback(() => {
    const nextTrainNumber = createTrainInput.trim();

    if (!isTrainNumberInputValid(nextTrainNumber)) {
      return;
    }

    if (hasLeadingZeros(nextTrainNumber)) {
      setPendingLeadingZeroTrainNumber(nextTrainNumber);
      setIsLeadingZeroConfirmOpen(true);
      return;
    }

    finalizeCreateTrain(nextTrainNumber);
  }, [createTrainInput, finalizeCreateTrain]);

  const handleKeepLeadingZeroTrainNumber = useCallback(() => {
    const nextTrainNumber = pendingLeadingZeroTrainNumber.trim();

    if (!isTrainNumberInputValid(nextTrainNumber)) {
      return;
    }

    finalizeCreateTrain(nextTrainNumber);
  }, [finalizeCreateTrain, pendingLeadingZeroTrainNumber]);

  const handleRemoveLeadingZerosFromTrainNumber = useCallback(() => {
    const nextTrainNumber = removeLeadingZeros(pendingLeadingZeroTrainNumber);

    if (!isTrainNumberInputValid(nextTrainNumber)) {
      return;
    }

    finalizeCreateTrain(nextTrainNumber);
  }, [finalizeCreateTrain, pendingLeadingZeroTrainNumber]);

  const handleCancelLeadingZeroConfirm = useCallback(() => {
    setPendingLeadingZeroTrainNumber("");
    setIsLeadingZeroConfirmOpen(false);
  }, []);

  const handleDuplicateVariantYes = useCallback(() => {
    const targetTrainNumber = pendingDuplicateTrainNumber.trim();

    if (targetTrainNumber === "") {
      setLastDuplicateVariantDecision("yes");
      setPendingDuplicateTrainNumber("");
      setIsDuplicateTrainConfirmOpen(false);
      return;
    }

    setParsedSource((previous) => {
      const previousTrains = previous.trains ?? {};
      const previousTrain = previousTrains[targetTrainNumber];

      if (!previousTrain) {
        return previous;
      }

      const sourceVariantIndex =
        selectedVariantIndexByTrain[targetTrainNumber] ?? 0;
      const sourceVariant = getVariantAtIndex(previousTrain, sourceVariantIndex);

      if (!sourceVariant) {
        return previous;
      }

      const nextVariant: FtSourceTrainVariantData = {
        meta: {
          ...sourceVariant.meta,
          validity: buildDefaultVariantValidity(),
        },
        byRowKey: {
          ...sourceVariant.byRowKey,
        },
      };

      const existingVariants =
        Array.isArray(previousTrain.variants) && previousTrain.variants.length > 0
          ? previousTrain.variants
          : [sourceVariant];

      return {
        ...previous,
        trains: {
          ...previousTrains,
          [targetTrainNumber]: {
            ...previousTrain,
            publishState: "local",
            variants: [...existingVariants, nextVariant],
          },
        },
      };
    });

    setSelectedTrainNumber(targetTrainNumber);
    setSelectedVariantIndexByTrain((previous) => {
      const previousTrain = parsedSource.trains?.[targetTrainNumber];
      const nextIndex = getVariantCount(previousTrain);

      return {
        ...previous,
        [targetTrainNumber]: nextIndex,
      };
    });

    setLastDuplicateVariantDecision("yes");
    setCreateTrainInput("");
    setPendingDuplicateTrainNumber("");
    setIsDuplicateTrainConfirmOpen(false);
    setIsCreateTrainModalOpen(false);
  }, [pendingDuplicateTrainNumber, parsedSource.trains, selectedVariantIndexByTrain]);

  const handleDuplicateVariantNo = useCallback(() => {
    setLastDuplicateVariantDecision("no");
    setPendingDuplicateTrainNumber("");
    setIsDuplicateTrainConfirmOpen(false);
  }, []);

  const handleOpenDeleteTrainConfirm = useCallback(() => {
    if (selectedTrainNumber.trim() === "") {
      return;
    }

    setPendingVariantDeleteIndex(selectedVariantIndex);
    setIsDeleteTrainConfirmOpen(true);
  }, [selectedTrainNumber, selectedVariantIndex]);

  const handleCancelDeleteTrain = useCallback(() => {
    setPendingVariantDeleteIndex(null);
    setIsDeleteTrainConfirmOpen(false);
  }, []);

  const handleConfirmDeleteTrain = useCallback(() => {
    const trainNumberToDelete = selectedTrainNumber.trim();

    if (trainNumberToDelete === "") {
      setPendingVariantDeleteIndex(null);
      setIsDeleteTrainConfirmOpen(false);
      return;
    }

    const currentTrainData = parsedSource.trains?.[trainNumberToDelete];
    const currentVariantCount = getVariantCount(currentTrainData);
    const variantIndexToDelete = pendingVariantDeleteIndex ?? selectedVariantIndex;

    setParsedSource((previous) => {
      const previousTrains = previous.trains ?? {};
      const previousTrain = previousTrains[trainNumberToDelete];

      if (!previousTrain) {
        return previous;
      }

      const previousVariantCount = getVariantCount(previousTrain);

      if (previousVariantCount <= 1) {
        const nextTrains = { ...previousTrains };
        delete nextTrains[trainNumberToDelete];

        return {
          ...previous,
          trains: nextTrains,
        };
      }

      if (
        !Array.isArray(previousTrain.variants) ||
        previousTrain.variants.length === 0
      ) {
        return previous;
      }

      if (
        variantIndexToDelete < 0 ||
        variantIndexToDelete >= previousTrain.variants.length
      ) {
        return previous;
      }

      const nextVariants = previousTrain.variants.filter(
        (_, index) => index !== variantIndexToDelete
      );

      return {
        ...previous,
        trains: {
          ...previousTrains,
          [trainNumberToDelete]: {
            ...previousTrain,
            publishState: "local",
            variants: nextVariants,
          },
        },
      };
    });

    if (currentVariantCount <= 1) {
      setHoraireSelectionsByTrain((previous) => {
        if (!(trainNumberToDelete in previous)) {
          return previous;
        }

        const nextSelections = { ...previous };
        delete nextSelections[trainNumberToDelete];
        return nextSelections;
      });

      setSelectedVariantIndexByTrain((previous) => {
        if (!(trainNumberToDelete in previous)) {
          return previous;
        }

        const nextIndexes = { ...previous };
        delete nextIndexes[trainNumberToDelete];
        return nextIndexes;
      });
    } else {
      setSelectedVariantIndexByTrain((previous) => {
        const previousSelectedIndex = previous[trainNumberToDelete] ?? 0;
        let nextSelectedIndex = previousSelectedIndex;

        if (previousSelectedIndex > variantIndexToDelete) {
          nextSelectedIndex = previousSelectedIndex - 1;
        } else if (previousSelectedIndex === variantIndexToDelete) {
          nextSelectedIndex = Math.min(
            variantIndexToDelete,
            currentVariantCount - 2
          );
        }

        return {
          ...previous,
          [trainNumberToDelete]: nextSelectedIndex,
        };
      });
    }

    setPendingVariantDeleteIndex(null);
    setIsDeleteTrainConfirmOpen(false);
  }, [
    parsedSource.trains,
    pendingVariantDeleteIndex,
    selectedTrainNumber,
    selectedVariantIndex,
  ]);

  const handleAddVariantForSelectedTrain = useCallback(() => {
    const targetTrainNumber = selectedTrainNumber.trim();

    if (targetTrainNumber === "") {
      return;
    }

    setParsedSource((previous) => {
      const previousTrains = previous.trains ?? {};
      const previousTrain = previousTrains[targetTrainNumber];

      if (!previousTrain) {
        return previous;
      }

      const sourceVariantIndex =
        selectedVariantIndexByTrain[targetTrainNumber] ?? 0;
      const sourceVariant = getVariantAtIndex(previousTrain, sourceVariantIndex);

      if (!sourceVariant) {
        return previous;
      }

      const nextVariant: FtSourceTrainVariantData = {
        meta: {
          ...sourceVariant.meta,
          validity: buildDefaultVariantValidity(),
        },
        byRowKey: {
          ...sourceVariant.byRowKey,
        },
      };

      const existingVariants =
        Array.isArray(previousTrain.variants) && previousTrain.variants.length > 0
          ? previousTrain.variants
          : [sourceVariant];

      return {
        ...previous,
        trains: {
          ...previousTrains,
          [targetTrainNumber]: {
            ...previousTrain,
            publishState: "local",
            variants: [...existingVariants, nextVariant],
          },
        },
      };
    });

    setSelectedVariantIndexByTrain((previous) => {
      const currentSelectedTrainData = parsedSource.trains?.[targetTrainNumber];
      const nextIndex = getVariantCount(currentSelectedTrainData);

      return {
        ...previous,
        [targetTrainNumber]: nextIndex,
      };
    });
  }, [parsedSource.trains, selectedTrainNumber, selectedVariantIndexByTrain]);

  const handleValidateVariantValidityDraft = useCallback(() => {
    const targetTrainNumber = selectedTrainNumber.trim();

    if (targetTrainNumber === "") {
      return;
    }

    const trimmedStartDate = variantValidityDraft.startDate.trim();
    const trimmedEndDate = variantValidityDraft.endDate.trim();
    const selectedDayCount = getVariantActiveDayCount(variantValidityDraft.days);

    if (selectedDayCount === 0) {
      setVariantValidityError("Au moins un jour doit être sélectionné.");
      return;
    }

    if (
      trimmedStartDate !== "" &&
      trimmedEndDate !== "" &&
      trimmedEndDate < trimmedStartDate
    ) {
      setVariantValidityError(
        "La date de fin ne peut pas être antérieure à la date de début."
      );
      return;
    }

    const currentTrainVariants =
      Array.isArray(selectedTrainData?.variants) && selectedTrainData.variants.length > 0
        ? selectedTrainData.variants
        : selectedVariant != null
          ? [selectedVariant]
          : [];

    const conflictingVariantIndex =
      currentTrainVariants.length > 0
        ? getConflictingVariantIndex(currentTrainVariants, selectedVariantIndex, {
            startDate: trimmedStartDate,
            endDate: trimmedEndDate,
            days: {
              monday: variantValidityDraft.days.monday,
              tuesday: variantValidityDraft.days.tuesday,
              wednesday: variantValidityDraft.days.wednesday,
              thursday: variantValidityDraft.days.thursday,
              friday: variantValidityDraft.days.friday,
              saturday: variantValidityDraft.days.saturday,
              sunday: variantValidityDraft.days.sunday,
            },
          })
        : null;

    if (conflictingVariantIndex != null) {
      const conflictingVariant = currentTrainVariants[conflictingVariantIndex];
      const conflictingDays = getOverlappingVariantDayLabels(
        {
          monday: variantValidityDraft.days.monday,
          tuesday: variantValidityDraft.days.tuesday,
          wednesday: variantValidityDraft.days.wednesday,
          thursday: variantValidityDraft.days.thursday,
          friday: variantValidityDraft.days.friday,
          saturday: variantValidityDraft.days.saturday,
          sunday: variantValidityDraft.days.sunday,
        },
        conflictingVariant.meta.validity.days
      );

      setVariantValidityError(
        `Conflit interdit avec VARIANTE ${String.fromCharCode(
          65 + conflictingVariantIndex
        )} : chevauchement de périodes et chevauchement de jours ${conflictingDays.join(", ")}.`
      );
      return;
    }

    setVariantValidityError(null);

    setParsedSource((previous) => {
      const previousTrains = previous.trains ?? {};
      const previousTrain = previousTrains[targetTrainNumber];

      if (!previousTrain) {
        return previous;
      }

      const currentVariant = getVariantAtIndex(previousTrain, selectedVariantIndex);

      if (!currentVariant) {
        return previous;
      }

      return {
        ...previous,
        trains: {
          ...previousTrains,
          [targetTrainNumber]: replaceVariantAtIndex(
            previousTrain,
            selectedVariantIndex,
            {
              ...currentVariant,
              meta: {
                ...currentVariant.meta,
                validity: {
                  ...currentVariant.meta.validity,
                  startDate: trimmedStartDate,
                  endDate: trimmedEndDate,
                  days: {
                    monday: variantValidityDraft.days.monday,
                    tuesday: variantValidityDraft.days.tuesday,
                    wednesday: variantValidityDraft.days.wednesday,
                    thursday: variantValidityDraft.days.thursday,
                    friday: variantValidityDraft.days.friday,
                    saturday: variantValidityDraft.days.saturday,
                    sunday: variantValidityDraft.days.sunday,
                  },
                },
              },
            }
          ),
        },
      };
    });

    setOpenVariantValidityEditor({
      trainNumber: "",
      variantIndex: -1,
    });
  }, [
    selectedTrainData,
    selectedTrainNumber,
    selectedVariant,
    selectedVariantIndex,
    variantValidityDraft,
  ]);

  const updateSelectedTrainRowData = useCallback(
    (
      rowId: string,
      updater: (nextRowData: FtSourceTrainRowData) => void
    ) => {
      if (selectedTrainNumber.trim() === "") {
        return;
      }

      setParsedSource((previous) => {
        const previousTrains = previous.trains ?? {};
        const previousTrain = previousTrains[selectedTrainNumber];

        if (!previousTrain) {
          return previous;
        }

        const selectedVariant = getVariantAtIndex(
          previousTrain,
          selectedVariantIndex
        );

        if (!selectedVariant) {
          return previous;
        }

        const previousRowData = selectedVariant.byRowKey[rowId] ?? {};
        const nextRowData: FtSourceTrainRowData = {
          ...(previousRowData as FtSourceTrainRowData),
        };

        updater(nextRowData);

        const nextByRowKey = {
          ...selectedVariant.byRowKey,
        };

        if (Object.keys(nextRowData).length === 0) {
          delete nextByRowKey[rowId];
        } else {
          nextByRowKey[rowId] = nextRowData;
        }

        return {
          ...previous,
          trains: {
            ...previousTrains,
            [selectedTrainNumber]: replaceVariantAtIndex(
              previousTrain,
              selectedVariantIndex,
              {
                ...selectedVariant,
                byRowKey: nextByRowKey,
              }
            ),
          },
        };
      });
    },
    [selectedTrainNumber, selectedVariantIndex]
  );

  const handleApplyComForSelectedTrain = useCallback(
    (rowId: string, nextCom: string) => {
      const trimmedCom = nextCom.trim();
      const normalizedCom =
        trimmedCom !== "" && /^[1-9]\d*$/.test(trimmedCom) ? trimmedCom : "";

      updateSelectedTrainRowData(rowId, (nextRowData) => {
        if (normalizedCom === "") {
          delete nextRowData.com;
        } else {
          nextRowData.com = normalizedCom;
        }
      });
    },
    [updateSelectedTrainRowData]
  );

  const handleApplyHoraForSelectedTrain = useCallback(
    (rowId: string, nextHora: string) => {
      const trimmedHora = nextHora.trim();

      updateSelectedTrainRowData(rowId, (nextRowData) => {
        if (trimmedHora === "") {
          delete nextRowData.hora;
        } else {
          nextRowData.hora = trimmedHora;
        }
      });
    },
    [updateSelectedTrainRowData]
  );

  const handleApplyTecnForSelectedTrain = useCallback(
    (rowId: string, nextTecn: string) => {
      const trimmedTecn = nextTecn.trim();
      const normalizedTecn =
        trimmedTecn !== "" && /^[1-9]\d*$/.test(trimmedTecn) ? trimmedTecn : "";

      updateSelectedTrainRowData(rowId, (nextRowData) => {
        if (normalizedTecn === "") {
          delete nextRowData.tecn;
        } else {
          nextRowData.tecn = normalizedTecn;
        }
      });
    },
    [updateSelectedTrainRowData]
  );

  const handleApplyConcForSelectedTrain = useCallback(
    (rowId: string, nextConc: string) => {
      const trimmedConc = nextConc.trim();
      const normalizedConc =
        trimmedConc !== "" && /^\d+$/.test(trimmedConc)
          ? String(Number(trimmedConc))
          : "";

      updateSelectedTrainRowData(rowId, (nextRowData) => {
        if (normalizedConc === "") {
          delete nextRowData.conc;
        } else {
          nextRowData.conc = normalizedConc;
        }
      });
    },
    [updateSelectedTrainRowData]
  );

  const handleDeleteRows = useCallback((rowIds: string[]) => {
    if (rowIds.length === 0) {
      return;
    }

    const rowIdSet = new Set(rowIds);

    setParsedSource((previous) => {
      const nextNordSudRows = previous.nordSud.rows.filter((rawRow) => {
        if (!isRecord(rawRow)) {
          return true;
        }

        const rawId = typeof rawRow["id"] === "string" ? rawRow["id"] : "";
        return !rowIdSet.has(rawId);
      });

      const nextSudNordRows = previous.sudNord.rows.filter((rawRow) => {
        if (!isRecord(rawRow)) {
          return true;
        }

        const rawId = typeof rawRow["id"] === "string" ? rawRow["id"] : "";
        return !rowIdSet.has(rawId);
      });

      return {
        ...previous,
        nordSud: {
          rows: nextNordSudRows,
        },
        sudNord: {
          rows: nextSudNordRows,
        },
      };
    });

    setSelectedRowId((previousSelectedRowId) => {
      if (previousSelectedRowId == null) {
        return previousSelectedRowId;
      }

      return rowIdSet.has(previousSelectedRowId)
        ? null
        : previousSelectedRowId;
    });
  }, []);

  const handleInsertRowAbove = useCallback((targetRowId: string) => {
    function extractRowNumberFromId(rowId: string): number {
      const match = rowId.match(/-(\d+)$/);
      return match ? Number(match[1]) : 0;
    }

    function buildNextDataId(
      rows: FtSourceDirectionTables["nordSud"]["rows"],
      prefix: string
    ): string {
      let maxNumber = 0;

      for (const rawRow of rows) {
        if (!isRecord(rawRow)) {
          continue;
        }

        const rawId = typeof rawRow["id"] === "string" ? rawRow["id"] : "";

        if (!rawId.startsWith(`${prefix}-`)) {
          continue;
        }

        maxNumber = Math.max(maxNumber, extractRowNumberFromId(rawId));
      }

      const nextNumber = String(maxNumber + 1).padStart(4, "0");
      return `${prefix}-data-${nextNumber}`;
    }

    setParsedSource((previous) => {
      const tableNames: Array<"nordSud" | "sudNord"> = ["nordSud", "sudNord"];

      for (const tableName of tableNames) {
        const currentTable = previous[tableName];
        const targetIndex = currentTable.rows.findIndex((rawRow) => {
          if (!isRecord(rawRow)) {
            return false;
          }

          return rawRow["id"] === targetRowId;
        });

        if (targetIndex === -1) {
          continue;
        }

        const targetRawRow = currentTable.rows[targetIndex];

        if (!isRecord(targetRawRow)) {
          return previous;
        }

        const targetType =
          typeof targetRawRow["type"] === "string" ? targetRawRow["type"] : "data";

        let insertionIndex = targetIndex;

        if (targetType === "data" && targetIndex > 0) {
          const previousRawRow = currentTable.rows[targetIndex - 1];

          if (isRecord(previousRawRow) && previousRawRow["type"] === "note") {
            insertionIndex = targetIndex - 1;
          }
        }

        const targetId =
          typeof targetRawRow["id"] === "string" ? targetRawRow["id"] : "";
        const prefix = targetId.startsWith("sn-") ? "sn" : "ns";
        const nextDataId = buildNextDataId(currentTable.rows, prefix);

        const newDataRow = {
          id: nextDataId,
          rowKey: nextDataId,
          type: "data",
          reseau: "",
          pkInterne: "",
          pkAdif: "",
          pkLfp: "",
          pkRfn: "",
          bloqueo: "",
          vmax: "",
          sitKm: "",
          dependencia: "",
          radio: "",
          rampCaract: "",
          csv: false,
          notes: [],
          etcs: "",
        };

        const nextRows = [
          ...currentTable.rows.slice(0, insertionIndex),
          newDataRow,
          ...currentTable.rows.slice(insertionIndex),
        ];

        return {
          ...previous,
          [tableName]: {
            rows: nextRows,
          },
        };
      }

      return previous;
    });
  }, []);

  const handleUpsertNote = useCallback(
    (targetRowId: string, noteLines: string[]) => {
      if (noteLines.length === 0) {
        return;
      }

      function extractRowNumberFromId(rowId: string): number {
        const match = rowId.match(/-(\d+)$/);
        return match ? Number(match[1]) : 0;
      }

      function buildNextNoteId(
        rows: FtSourceDirectionTables["nordSud"]["rows"],
        prefix: string
      ): string {
        let maxNumber = 0;

        for (const rawRow of rows) {
          if (!isRecord(rawRow)) {
            continue;
          }

          const rawId = typeof rawRow["id"] === "string" ? rawRow["id"] : "";

          if (!rawId.startsWith(`${prefix}-`)) {
            continue;
          }

          maxNumber = Math.max(maxNumber, extractRowNumberFromId(rawId));
        }

        const nextNumber = String(maxNumber + 1).padStart(4, "0");
        return `${prefix}-note-${nextNumber}`;
      }

      setParsedSource((previous) => {
        const tableNames: Array<"nordSud" | "sudNord"> = ["nordSud", "sudNord"];

        for (const tableName of tableNames) {
          const currentTable = previous[tableName];
          const targetIndex = currentTable.rows.findIndex((rawRow) => {
            if (!isRecord(rawRow)) {
              return false;
            }

            return rawRow["id"] === targetRowId;
          });

          if (targetIndex === -1) {
            continue;
          }

          const targetRawRow = currentTable.rows[targetIndex];

          if (!isRecord(targetRawRow)) {
            return previous;
          }

          const targetType =
            typeof targetRawRow["type"] === "string" ? targetRawRow["type"] : "data";

          if (targetType === "note") {
            const nextRows = currentTable.rows.map((rawRow, index) => {
              if (index !== targetIndex || !isRecord(rawRow)) {
                return rawRow;
              }

              return {
                ...rawRow,
                notes: noteLines,
              };
            });

            return {
              ...previous,
              [tableName]: {
                rows: nextRows,
              },
            };
          }

          const previousRawRow =
            targetIndex > 0 ? currentTable.rows[targetIndex - 1] : null;

          if (
            previousRawRow != null &&
            isRecord(previousRawRow) &&
            previousRawRow["type"] === "note"
          ) {
            const nextRows = currentTable.rows.map((rawRow, index) => {
              if (index !== targetIndex - 1 || !isRecord(rawRow)) {
                return rawRow;
              }

              return {
                ...rawRow,
                notes: noteLines,
              };
            });

            return {
              ...previous,
              [tableName]: {
                rows: nextRows,
              },
            };
          }

          const targetId =
            typeof targetRawRow["id"] === "string" ? targetRawRow["id"] : "";
          const prefix = targetId.startsWith("sn-") ? "sn" : "ns";
          const nextNoteId = buildNextNoteId(currentTable.rows, prefix);

          const newNoteRow = {
            id: nextNoteId,
            rowKey: nextNoteId,
            type: "note",
            reseau: "",
            pkInterne: "",
            pkAdif: "",
            pkLfp: "",
            pkRfn: "",
            bloqueo:
              typeof targetRawRow["bloqueo"] === "string" ? targetRawRow["bloqueo"] : "",
            vmax: "",
            sitKm: "",
            dependencia: "",
            radio:
              typeof targetRawRow["radio"] === "string" ? targetRawRow["radio"] : "",
            rampCaract:
              typeof targetRawRow["rampCaract"] === "string"
                ? targetRawRow["rampCaract"]
                : "",
            csv: false,
            notes: noteLines,
            etcs: typeof targetRawRow["etcs"] === "string" ? targetRawRow["etcs"] : "",
          };

          const nextRows = [
            ...currentTable.rows.slice(0, targetIndex),
            newNoteRow,
            ...currentTable.rows.slice(targetIndex),
          ];

          return {
            ...previous,
            [tableName]: {
              rows: nextRows,
            },
          };
        }

        return previous;
      });
    },
    []
  );

  const handleDownloadNormalizedFile = useCallback(() => {
    const validation = validateNormalizedFtSource(parsedSource);

    setExportDiagnostics(validation.diagnostics);

    if (!validation.isValid) {
      setExportStatus("error");
      setExportMessage(
        "Export annulé : le fichier en mémoire contient des incohérences structurelles."
      );
      return;
    }

    try {
      const content = buildNormalizedFtSourceFileContent(parsedSource);

      downloadTextFile(
        "ligneFT.normalized.ts",
        content,
        "text/typescript;charset=utf-8"
      );

      setExportStatus("success");
      setExportMessage(
        `Export réussi : ${validation.rowCountNordSud} lignes nordSud, ${validation.rowCountSudNord} lignes sudNord.`
      );
    } catch (error) {
      setExportStatus("error");
      setExportMessage(
        error instanceof Error
          ? `Export échoué : ${error.message}`
          : "Export échoué : erreur inconnue."
      );
    }
  }, [parsedSource]);

  return (
    <>
      <PublishConfirmDialog
        open={isPublishDialogOpen}
        isBusy={isPublishing}
        errorMessage={exportStatus === "error" ? exportMessage : null}
        successMessage={publishSuccessMessage}
        onCancel={handleCancelPublish}
        onConfirm={handleConfirmPublish}
      />

      <ArchiveListModal
        open={isRestoreModalOpen}
        isBusy={isRestoreListLoading}
        archives={restoreArchives}
        errorMessage={restoreErrorMessage}
        onClose={handleCloseRestoreModal}
        onSelectArchive={handleSelectArchive}
      />

      {isCreateTrainModalOpen ? (
        <div
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              handleCancelCreateTrain();
            }
          }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(17, 24, 39, 0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1100,
            padding: 24,
          }}
        >
          <div
            onMouseDown={(event) => {
              event.stopPropagation();
            }}
            style={{
              width: "100%",
              maxWidth: 420,
              background: "#ffffff",
              borderRadius: 16,
              boxShadow: "0 20px 60px rgba(0, 0, 0, 0.25)",
              padding: 20,
            }}
          >
            <div
              style={{
                fontSize: 20,
                fontWeight: 700,
                marginBottom: 16,
                color: "#111827",
              }}
            >
              Créer un train
            </div>

            <div
              style={{
                fontWeight: 600,
                marginBottom: 8,
                color: "#111827",
              }}
            >
              Numéro de train
            </div>

            <input
              ref={createTrainInputRef}
              type="text"
              value={createTrainInput}
              onChange={(event) => setCreateTrainInput(event.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  isTrainNumberInputValid(createTrainInput)
                ) {
                  event.preventDefault();
                  handleConfirmCreateTrain();
                }
              }}
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "10px 12px",
                borderRadius: 10,
                border: isTrainNumberInputValid(createTrainInput)
                  ? "1px solid #d1d5db"
                  : createTrainInput.trim() === ""
                    ? "1px solid #d1d5db"
                    : "1px solid #dc2626",
                background: "#ffffff",
                marginBottom: 8,
              }}
            />

            {createTrainInput.trim() !== "" &&
            !isTrainNumberInputValid(createTrainInput) ? (
              <div
                style={{
                  marginBottom: 16,
                  color: "#991b1b",
                  fontSize: 14,
                  fontWeight: 500,
                }}
              >
                Le numéro doit contenir uniquement des chiffres, avec une
                longueur de 1 à 6.
              </div>
            ) : (
              <div style={{ marginBottom: 16 }} />
            )}

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 12,
              }}
            >
              <button
                type="button"
                onClick={handleCancelCreateTrain}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px solid #d1d5db",
                  background: "#ffffff",
                  color: "#111827",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Annuler
              </button>

              <button
                type="button"
                onClick={handleConfirmCreateTrain}
                disabled={!isTrainNumberInputValid(createTrainInput)}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px solid #2563eb",
                  background: isTrainNumberInputValid(createTrainInput)
                    ? "#2563eb"
                    : "#93c5fd",
                  color: "#ffffff",
                  fontWeight: 600,
                  cursor: isTrainNumberInputValid(createTrainInput)
                    ? "pointer"
                    : "not-allowed",
                }}
              >
                Valider
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isLeadingZeroConfirmOpen ? (
        <div
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              handleCancelLeadingZeroConfirm();
            }
          }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(17, 24, 39, 0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1200,
            padding: 24,
          }}
        >
          <div
            onMouseDown={(event) => {
              event.stopPropagation();
            }}
            style={{
              width: "100%",
              maxWidth: 460,
              background: "#ffffff",
              borderRadius: 16,
              boxShadow: "0 20px 60px rgba(0, 0, 0, 0.25)",
              padding: 20,
            }}
          >
            <div
              style={{
                fontSize: 18,
                fontWeight: 700,
                marginBottom: 16,
                color: "#111827",
              }}
            >
              Confirmation du numéro
            </div>

            <div
              style={{
                color: "#111827",
                lineHeight: 1.5,
                marginBottom: 20,
              }}
            >
              Vous avez saisi <strong>{pendingLeadingZeroTrainNumber}</strong>.
              <br />
              Souhaitez-vous conserver ce numéro ou le convertir en{" "}
              <strong>
                {removeLeadingZeros(pendingLeadingZeroTrainNumber)}
              </strong>{" "}
              ?
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <button
                type="button"
                onClick={handleCancelLeadingZeroConfirm}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px solid #d1d5db",
                  background: "#ffffff",
                  color: "#111827",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Retour
              </button>

              <button
                type="button"
                onClick={handleKeepLeadingZeroTrainNumber}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px solid #2563eb",
                  background: "#2563eb",
                  color: "#ffffff",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Conserver
              </button>

              <button
                type="button"
                onClick={handleRemoveLeadingZerosFromTrainNumber}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px solid #1d4ed8",
                  background: "#1d4ed8",
                  color: "#ffffff",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Supprimer les zéros
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isDuplicateTrainConfirmOpen ? (
        <div
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              handleDuplicateVariantNo();
            }
          }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(17, 24, 39, 0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1300,
            padding: 24,
          }}
        >
          <div
            onMouseDown={(event) => {
              event.stopPropagation();
            }}
            style={{
              width: "100%",
              maxWidth: 460,
              background: "#ffffff",
              borderRadius: 16,
              boxShadow: "0 20px 60px rgba(0, 0, 0, 0.25)",
              padding: 20,
            }}
          >
            <div
              style={{
                fontSize: 18,
                fontWeight: 700,
                marginBottom: 16,
                color: "#111827",
              }}
            >
              Train déjà existant
            </div>

            <div
              style={{
                color: "#111827",
                lineHeight: 1.5,
                marginBottom: 20,
              }}
            >
              Ce train existe déjà. Voulez-vous créer une variante ?
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <button
                type="button"
                onClick={handleDuplicateVariantNo}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px solid #d1d5db",
                  background: "#ffffff",
                  color: "#111827",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Non
              </button>

              <button
                type="button"
                onClick={handleDuplicateVariantYes}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px solid #2563eb",
                  background: "#2563eb",
                  color: "#ffffff",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Oui
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isDeleteTrainConfirmOpen ? (
        <div
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              handleCancelDeleteTrain();
            }
          }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(17, 24, 39, 0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1400,
            padding: 24,
          }}
        >
          <div
            onMouseDown={(event) => {
              event.stopPropagation();
            }}
            style={{
              width: "100%",
              maxWidth: 460,
              background: "#ffffff",
              borderRadius: 16,
              boxShadow: "0 20px 60px rgba(0, 0, 0, 0.25)",
              padding: 20,
            }}
          >
            <div
              style={{
                fontSize: 18,
                fontWeight: 700,
                marginBottom: 16,
                color: "#111827",
              }}
            >
              {selectedVariantCount <= 1
                ? "Supprimer la dernière variante"
                : "Supprimer une variante"}
            </div>

            <div
              style={{
                color: "#111827",
                lineHeight: 1.5,
                marginBottom: 20,
              }}
            >
              {selectedVariantCount <= 1 ? (
                <>
                  Voulez-vous supprimer la dernière variante du train{" "}
                  <strong>{selectedTrainNumber || "?"}</strong> ?
                  <br />
                  Cela supprimera aussi le train entier.
                </>
              ) : (
                <>
                  Voulez-vous supprimer{" "}
                  <strong>
                    VARIANTE{" "}
                    {String.fromCharCode(
                      65 + (pendingVariantDeleteIndex ?? selectedVariantIndex)
                    )}
                  </strong>{" "}
                  du train <strong>{selectedTrainNumber || "?"}</strong> ?
                </>
              )}
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <button
                type="button"
                onClick={handleCancelDeleteTrain}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px solid #d1d5db",
                  background: "#ffffff",
                  color: "#111827",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Annuler
              </button>

              <button
                type="button"
                onClick={handleConfirmDeleteTrain}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px solid #dc2626",
                  background: "#dc2626",
                  color: "#ffffff",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <EditorShell
        toolbar={
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <DirectionSelector value={direction} onChange={setDirection} />

            <button
              type="button"
              onClick={handleDownloadNormalizedFile}
              disabled={sourceRows.length === 0}
              style={{
                padding: "10px 14px",
                cursor: sourceRows.length === 0 ? "not-allowed" : "pointer",
              }}
              title="Télécharger le fichier ligneFT.normalized.ts généré depuis l’état actuel de l’éditeur"
            >
              Télécharger le normalisé
            </button>

            <PublishVersionButton
              disabled={!hasUnpublishedChanges}
              isBusy={isPublishing}
              onClick={handlePublishClick}
            />

            <RestoreArchiveButton
              disabled={false}
              isBusy={isRestoreListLoading}
              onClick={handleOpenRestoreModal}
            />
          </div>
        }
        tableArea={
          <>
            <div
              style={{
                display: "flex",
                gap: 8,
                marginBottom: 16,
                flexWrap: "wrap",
              }}
            >
              {[
                { id: "FT" as const, label: "Tableau FT" },
                { id: "HORAIRE" as const, label: "Tableau horaire" },
                { id: "LTV" as const, label: "LTV" },
              ].map((tab) => {
                const isActive = activeTab === tab.id;

                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    style={{
                      padding: "10px 14px",
                      borderRadius: 10,
                      border: isActive
                        ? "1px solid #2563eb"
                        : "1px solid #d1d5db",
                      background: isActive ? "#dbeafe" : "#ffffff",
                      color: "#111827",
                      fontWeight: isActive ? 700 : 500,
                      cursor: "pointer",
                    }}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {activeTab === "FT" ? (
              <>
                <FTTable
                  directionLabel={directionLabel}
                  sourceStatus={sourceStatus}
                  remoteInfo={remoteInfo}
                  inspectionLines={inspectionLines}
                  sourceArrayName={sourceTableLabel}
                  rowCount={sourceRows.length}
                  firstRowPreview={firstRowPreview}
                  lastRowPreview={lastRowPreview}
                  rows={sourceRows}
                  selectedRowId={selectedRowId}
                  onRowSelect={(row) => {
                    setSelectedRowId(row.id);
                    setRequestedEditorField(null);
                  }}
                  onCellEditRequest={(row, field) => {
                    setSelectedRowId(row.id);
                    setRequestedEditorField(field);
                  }}
                  onDeleteRows={handleDeleteRows}
                  onUpsertNote={handleUpsertNote}
                  onInsertRowAbove={handleInsertRowAbove}
                />

                <EditorStatusBanner
                  title="Diagnostic export local"
                  message={
                    hasUnpublishedChanges
                      ? `${exportMessage} Modifications locales non publiées détectées.`
                      : `${exportMessage} Aucune modification locale non publiée.`
                  }
                  tone={
                    exportStatus === "success"
                      ? "success"
                      : exportStatus === "error"
                        ? "error"
                        : hasUnpublishedChanges
                          ? "warning"
                          : "neutral"
                  }
                  details={
                    exportDiagnostics.length > 0
                      ? exportDiagnostics
                      : ["Aucun diagnostic d’export disponible pour l’instant."]
                  }
                />
              </>
            ) : activeTab === "HORAIRE" ? (
              <>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    flexWrap: "wrap",
                    marginBottom: 12,
                  }}
                >
                  <div style={{ fontWeight: 600 }}>Train sélectionné :</div>

                  <select
                    value={selectedTrainNumber}
                    onChange={(event) =>
                      setSelectedTrainNumber(event.target.value)
                    }
                    disabled={availableTrainNumbers.length === 0}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: isSelectedTrainUnpublished
                        ? "1px solid #2563eb"
                        : "1px solid #d1d5db",
                      background: "#ffffff",
                      color: isSelectedTrainUnpublished ? "#2563eb" : "#111827",
                      fontWeight: isSelectedTrainUnpublished ? 700 : 500,
                      minWidth: 120,
                      cursor:
                        availableTrainNumbers.length === 0
                          ? "not-allowed"
                          : "pointer",
                    }}
                  >
                    {availableTrainNumbers.length === 0 ? (
                      <option value="">Aucun train</option>
                    ) : (
                      availableTrainNumbers.map((trainNumber) => {
                        const isUnpublished =
                          unpublishedTrainNumbers.has(trainNumber);

                        return (
                          <option
                            key={trainNumber}
                            value={trainNumber}
                            style={{
                              color: isUnpublished ? "#2563eb" : "#111827",
                              fontWeight: isUnpublished ? 700 : 400,
                            }}
                          >
                            {trainNumber}
                          </option>
                        );
                      })
                    )}
                  </select>

                  <div style={{ fontWeight: 600 }}>Origine :</div>

                  <select
                    value={selectedOrigin}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      setSelectedOrigin(nextValue);

                      if (selectedTrainNumber.trim() !== "") {
                        setHoraireSelectionsByTrain((previous) => {
                          const previousSelection = previous[selectedTrainNumber];
                          const selectedVariant = getVariantAtIndex(
                            parsedSource.trains?.[selectedTrainNumber],
                            selectedVariantIndex
                          );
                          const trainMeta = selectedVariant?.meta;

                          return {
                            ...previous,
                            [selectedTrainNumber]: {
                              selectedOrigin: nextValue,
                              selectedDestination:
                                previousSelection?.selectedDestination ??
                                trainMeta?.destination ??
                                selectedDestination,
                              validatedOrigin:
                                previousSelection?.validatedOrigin ??
                                trainMeta?.origine ??
                                "",
                              validatedDestination:
                                previousSelection?.validatedDestination ??
                                trainMeta?.destination ??
                                "",
                            },
                          };
                        });
                      }
                    }}
                    disabled={horaireLocationOptions.length === 0}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: "1px solid #d1d5db",
                      background: "#ffffff",
                      minWidth: 180,
                      cursor:
                        horaireLocationOptions.length === 0
                          ? "not-allowed"
                          : "pointer",
                    }}
                  >
                    <option value="">Choisir</option>
                    {horaireLocationOptions.map((location) => (
                      <option key={`origin-${location}`} value={location}>
                        {location}
                      </option>
                    ))}
                  </select>

                  <div style={{ fontWeight: 600 }}>Destination :</div>

                  <select
                    value={selectedDestination}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      setSelectedDestination(nextValue);

                      if (selectedTrainNumber.trim() !== "") {
                        setHoraireSelectionsByTrain((previous) => {
                          const previousSelection = previous[selectedTrainNumber];
                          const selectedVariant = getVariantAtIndex(
                            parsedSource.trains?.[selectedTrainNumber],
                            selectedVariantIndex
                          );
                          const trainMeta = selectedVariant?.meta;

                          return {
                            ...previous,
                            [selectedTrainNumber]: {
                              selectedOrigin:
                                previousSelection?.selectedOrigin ??
                                trainMeta?.origine ??
                                selectedOrigin,
                              selectedDestination: nextValue,
                              validatedOrigin:
                                previousSelection?.validatedOrigin ??
                                trainMeta?.origine ??
                                "",
                              validatedDestination:
                                previousSelection?.validatedDestination ??
                                trainMeta?.destination ??
                                "",
                            },
                          };
                        });
                      }
                    }}
                    disabled={horaireLocationOptions.length === 0}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: "1px solid #d1d5db",
                      background: "#ffffff",
                      minWidth: 180,
                      cursor:
                        horaireLocationOptions.length === 0
                          ? "not-allowed"
                          : "pointer",
                    }}
                  >
                    <option value="">Choisir</option>
                    {horaireLocationOptions.map((location) => (
                      <option key={`destination-${location}`} value={location}>
                        {location}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={handleValidateHoraireSelection}
                    style={{
                      padding: "10px 14px",
                      borderRadius: 10,
                      border: "1px solid #d1d5db",
                      background: "#ffffff",
                      color: "#111827",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Valider
                  </button>

                  <div
                    style={{
                      width: 1,
                      height: 28,
                      background: "#d1d5db",
                      marginLeft: 4,
                      marginRight: 4,
                    }}
                  />

                  <button
                    type="button"
                    onClick={handleCreateTrain}
                    style={{
                      padding: "10px 14px",
                      borderRadius: 10,
                      border: "1px solid #2563eb",
                      background: "#2563eb",
                      color: "#ffffff",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Créer
                  </button>

                  <button
                    type="button"
                    onClick={handleOpenDeleteTrainConfirm}
                    disabled={selectedTrainNumber.trim() === ""}
                    style={{
                      padding: "10px 14px",
                      borderRadius: 10,
                      border: "1px solid #dc2626",
                      background:
                        selectedTrainNumber.trim() === ""
                          ? "#fca5a5"
                          : "#dc2626",
                      color: "#ffffff",
                      fontWeight: 600,
                      cursor:
                        selectedTrainNumber.trim() === ""
                          ? "not-allowed"
                          : "pointer",
                    }}
                  >
                    Supprimer
                  </button>
                </div>

                {horaireValidationError ? (
                  <div
                    style={{
                      marginBottom: 12,
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: "1px solid #fecaca",
                      background: "#fef2f2",
                      color: "#991b1b",
                      fontWeight: 500,
                    }}
                  >
                    {horaireValidationError}
                  </div>
                ) : null}

                <div
                  style={{
                    border: isSelectedTrainUnpublished
                      ? "2px solid #93c5fd"
                      : "2px solid transparent",
                    borderRadius: 16,
                    padding: isSelectedTrainUnpublished ? 8 : 0,
                    background: "#ffffff",
                    transition: "border-color 0.15s ease",
                  }}
                >
                  <FTTable
                    title="Tableau horaire"
                    titleBadge={
                      isSelectedTrainUnpublished ? (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            padding: "4px 10px",
                            borderRadius: 999,
                            border: "1px solid #93c5fd",
                            background: "#dbeafe",
                            color: "#1d4ed8",
                            fontWeight: 700,
                            fontSize: 14,
                            lineHeight: 1.2,
                          }}
                        >
                          En cours d’édition
                        </span>
                      ) : null
                    }
                    directionLabel={directionLabel}
                    sourceStatus={sourceStatus}
                    remoteInfo={remoteInfo}
                    inspectionLines={inspectionLines}
                    sourceArrayName={sourceTableLabel}
                    rowCount={displayedHoraireRows.length}
                    firstRowPreview={getRowPreview(displayedHoraireRows[0])}
                    lastRowPreview={getRowPreview(
                      displayedHoraireRows[displayedHoraireRows.length - 1]
                    )}
                    rows={displayedHoraireRows}
                    columns={HORAIRE_COLUMNS}
                    dimHoraireColumns={false}
                    selectedRowId={selectedRowId}
                    onRowSelect={(row) => {
                      setSelectedRowId(row.id);
                      setRequestedEditorField(null);
                    }}
                    onCellEditRequest={(row, field) => {
                      setSelectedRowId(row.id);
                      setRequestedEditorField(field);
                    }}
                    onInlineComCommit={handleApplyComForSelectedTrain}
                    onInlineHoraCommit={handleApplyHoraForSelectedTrain}
                    onInlineTecnCommit={handleApplyTecnForSelectedTrain}
                    onInlineConcCommit={handleApplyConcForSelectedTrain}
                  />
                </div>
              </>
            ) : (
              <div
                style={{
                  padding: 24,
                  border: "1px dashed #9ca3af",
                  borderRadius: 16,
                  background: "#ffffff",
                  color: "#4b5563",
                }}
              >
                <div
                  style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}
                >
                  LTV
                </div>
                <div>Onglet créé. Contenu à venir.</div>
              </div>
            )}
          </>
        }
        detailsPanel={
          activeTab === "FT" ? (
            <RowDetailsPanel
              directionLabel={directionLabel}
              sourceStatus={sourceStatus}
              rowCount={sourceRows.length}
              selectedRow={selectedRow}
              requestedEditorField={requestedEditorField}
              onRequestedEditorHandled={() => setRequestedEditorField(null)}
              bloqueoOptions={bloqueoOptions}
              onApplyBloqueo={handleApplyBloqueo}
              vmaxOptions={vmaxOptions}
              onApplyVmax={handleApplyVmax}
              rcOptions={rcOptions}
              onApplyRc={handleApplyRc}
              radioOptions={radioOptions}
              onApplyRadio={handleApplyRadio}
              onApplyDependencia={handleApplyDependencia}
              onApplyPkInternal={handleApplyPkInternal}
              onApplyPkDisplay={handleApplyPkDisplay}
              networkOptions={networkOptions}
              onApplyNetwork={handleApplyNetwork}
              onApplyCsv={handleApplyCsv}
              etcsOptions={etcsOptions}
              onApplyEtcs={handleApplyEtcs}
            />
          ) : activeTab === "HORAIRE" ? (
            <div
              style={{
                padding: 20,
                border: "1px solid #d1d5db",
                borderRadius: 16,
                background: "#ffffff",
                color: "#111827",
              }}
            >
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>
                Variantes
              </div>

              {selectedTrainNumber.trim() === "" ? (
                <div style={{ color: "#4b5563" }}>
                  Aucun train sélectionné.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {Array.from({ length: selectedVariantCount }, (_, index) => {
                    const variant = getVariantAtIndex(selectedTrainData, index);
                    const validity = variant?.meta.validity;
                    const startDate = validity?.startDate?.trim() ?? "";
                    const endDate = validity?.endDate?.trim() ?? "";
                    const days = validity?.days;

                    const dayLabels = [
                      { key: "monday", label: "L" },
                      { key: "tuesday", label: "M" },
                      { key: "wednesday", label: "M" },
                      { key: "thursday", label: "J" },
                      { key: "friday", label: "V" },
                      { key: "saturday", label: "S" },
                      { key: "sunday", label: "D" },
                    ] as const;

                    return (
                      <div
                        key={`variant-${index}`}
                        onClick={() => {
                          if (selectedTrainNumber.trim() === "") {
                            return;
                          }

                          setSelectedVariantIndexByTrain((previous) => ({
                            ...previous,
                            [selectedTrainNumber]: index,
                          }));
                        }}
                        style={{
                          display: "block",
                          padding: 12,
                          border:
                            selectedVariantIndex === index
                              ? "2px solid #2563eb"
                              : "1px solid #d1d5db",
                          borderRadius: 12,
                          background:
                            selectedVariantIndex === index ? "#eff6ff" : "#ffffff",
                          cursor: "pointer",
                          position: "relative",
                        }}
                      >
                        <button
                          type="button"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            setPendingVariantDeleteIndex(index);
                            setIsDeleteTrainConfirmOpen(true);
                          }}
                          title={`Supprimer VARIANTE ${String.fromCharCode(65 + index)}`}
                          style={{
                            position: "absolute",
                            top: 8,
                            right: 8,
                            width: 24,
                            height: 24,
                            borderRadius: 999,
                            border: "1px solid #fecaca",
                            background: "#fef2f2",
                            color: "#dc2626",
                            fontSize: 14,
                            fontWeight: 700,
                            lineHeight: 1,
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            cursor: "pointer",
                            padding: 0,
                          }}
                        >
                          ×
                        </button>

                        <div
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            gap: 10,
                          }}
                        >
                          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            <div style={{ fontWeight: 700 }}>
                              VARIANTE {String.fromCharCode(65 + index)}
                            </div>

                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();

                                if (selectedVariantIndex !== index) {
                                  setSelectedVariantIndexByTrain((previous) => ({
                                    ...previous,
                                    [selectedTrainNumber]: index,
                                  }));
                                  return;
                                }

                                setOpenVariantValidityEditor({
                                  trainNumber: selectedTrainNumber,
                                  variantIndex: index,
                                });
                              }}
                              style={{
                                padding: 0,
                                border: "none",
                                background: "transparent",
                                color: "#374151",
                                fontSize: 14,
                                textAlign: "left",
                                cursor: "pointer",
                              }}
                            >
                              Début : {formatVariantDateForDisplay(startDate)}
                            </button>

                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();

                                if (selectedVariantIndex !== index) {
                                  setSelectedVariantIndexByTrain((previous) => ({
                                    ...previous,
                                    [selectedTrainNumber]: index,
                                  }));
                                  return;
                                }

                                setOpenVariantValidityEditor({
                                  trainNumber: selectedTrainNumber,
                                  variantIndex: index,
                                });
                              }}
                              style={{
                                padding: 0,
                                border: "none",
                                background: "transparent",
                                color: "#374151",
                                fontSize: 14,
                                textAlign: "left",
                                cursor: "pointer",
                              }}
                            >
                              Fin : {formatVariantDateForDisplay(endDate)}
                            </button>

                            <div
                              style={{
                                display: "flex",
                                gap: 4,
                                flexWrap: "wrap",
                              }}
                            >
                              {dayLabels.map((day) => {
                                const isActive = days?.[day.key] ?? true;

                                return (
                                  <button
                                    key={day.key}
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();

                                      if (selectedVariantIndex !== index) {
                                        setSelectedVariantIndexByTrain((previous) => ({
                                          ...previous,
                                          [selectedTrainNumber]: index,
                                        }));
                                        return;
                                      }

                                      setOpenVariantValidityEditor({
                                        trainNumber: selectedTrainNumber,
                                        variantIndex: index,
                                      });
                                    }}
                                    style={{
                                      minWidth: 22,
                                      height: 22,
                                      display: "inline-flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      borderRadius: 999,
                                      border: isActive
                                        ? "1px solid #2563eb"
                                        : "1px solid #d1d5db",
                                      background: isActive ? "#dbeafe" : "#f9fafb",
                                      color: isActive ? "#1d4ed8" : "#9ca3af",
                                      fontSize: 11,
                                      fontWeight: 700,
                                      cursor: "pointer",
                                      padding: 0,
                                    }}
                                  >
                                    {day.label}
                                  </button>
                                );
                              })}
                            </div>

                            {selectedVariantIndex === index &&
                            openVariantValidityEditor.trainNumber ===
                              selectedTrainNumber &&
                            openVariantValidityEditor.variantIndex === index ? (
                              <div
                                onClick={(event) => {
                                  event.stopPropagation();
                                }}
                                style={{
                                  marginTop: 4,
                                  paddingTop: 12,
                                  borderTop: "1px solid #bfdbfe",
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: 10,
                                }}
                              >
                                <div
                                  style={{
                                    fontSize: 14,
                                    fontWeight: 700,
                                    color: "#1e3a8a",
                                  }}
                                >
                                  Validité
                                </div>

                                <label
                                  style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 6,
                                    fontSize: 13,
                                    color: "#374151",
                                  }}
                                >
                                  <span>Début</span>
                                  <input
                                    type="date"
                                    value={
                                      variantValidityDraft.trainNumber ===
                                        selectedTrainNumber &&
                                      variantValidityDraft.variantIndex === index
                                        ? variantValidityDraft.startDate
                                        : ""
                                    }
                                    onChange={(event) =>
                                      setVariantValidityDraft((previous) => ({
                                        ...previous,
                                        startDate: event.target.value,
                                      }))
                                    }
                                    style={{
                                      padding: "8px 10px",
                                      borderRadius: 10,
                                      border: "1px solid #d1d5db",
                                      background: "#ffffff",
                                      color: "#111827",
                                    }}
                                  />
                                </label>

                                <label
                                  style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 6,
                                    fontSize: 13,
                                    color: "#374151",
                                  }}
                                >
                                  <span>Fin</span>
                                  <input
                                    type="date"
                                    value={
                                      variantValidityDraft.trainNumber ===
                                        selectedTrainNumber &&
                                      variantValidityDraft.variantIndex === index
                                        ? variantValidityDraft.endDate
                                        : ""
                                    }
                                    onChange={(event) =>
                                      setVariantValidityDraft((previous) => ({
                                        ...previous,
                                        endDate: event.target.value,
                                      }))
                                    }
                                    style={{
                                      padding: "8px 10px",
                                      borderRadius: 10,
                                      border: "1px solid #d1d5db",
                                      background: "#ffffff",
                                      color: "#111827",
                                    }}
                                  />
                                </label>

                                <div
                                  style={{
                                    display: "flex",
                                    gap: 6,
                                    flexWrap: "wrap",
                                  }}
                                >
                                  {dayLabels.map((day) => {
                                    const isDraftActive =
                                      variantValidityDraft.trainNumber ===
                                        selectedTrainNumber &&
                                      variantValidityDraft.variantIndex === index
                                        ? variantValidityDraft.days[day.key]
                                        : false;

                                    return (
                                      <button
                                        key={`draft-${day.key}`}
                                        type="button"
                                        onClick={() => {
                                          setVariantValidityError(null);
                                          setVariantValidityDraft((previous) => ({
                                            ...previous,
                                            days: {
                                              ...previous.days,
                                              [day.key]: !previous.days[day.key],
                                            },
                                          }));
                                        }}
                                        style={{
                                          minWidth: 28,
                                          height: 28,
                                          display: "inline-flex",
                                          alignItems: "center",
                                          justifyContent: "center",
                                          borderRadius: 999,
                                          border: isDraftActive
                                            ? "1px solid #2563eb"
                                            : "1px solid #d1d5db",
                                          background: isDraftActive
                                            ? "#dbeafe"
                                            : "#f9fafb",
                                          color: isDraftActive
                                            ? "#1d4ed8"
                                            : "#9ca3af",
                                          fontSize: 12,
                                          fontWeight: 700,
                                          cursor: "pointer",
                                          padding: 0,
                                        }}
                                      >
                                        {day.label}
                                      </button>
                                    );
                                  })}
                                </div>

                                {variantValidityError ? (
                                  <div
                                    style={{
                                      padding: "8px 10px",
                                      borderRadius: 10,
                                      border: "1px solid #fecaca",
                                      background: "#fef2f2",
                                      color: "#991b1b",
                                      fontSize: 13,
                                      fontWeight: 500,
                                    }}
                                  >
                                    {variantValidityError}
                                  </div>
                                ) : null}

                                <button
                                  type="button"
                                  onClick={handleValidateVariantValidityDraft}
                                  style={{
                                    alignSelf: "flex-start",
                                    padding: "8px 12px",
                                    borderRadius: 10,
                                    border: "1px solid #2563eb",
                                    background: "#2563eb",
                                    color: "#ffffff",
                                    fontWeight: 700,
                                    cursor: "pointer",
                                  }}
                                >
                                  Valider
                                </button>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  <button
                    type="button"
                    onClick={handleAddVariantForSelectedTrain}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: "1px solid #2563eb",
                      background: "#ffffff",
                      color: "#2563eb",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Ajouter une variante
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div
              style={{
                padding: 20,
                border: "1px dashed #d1d5db",
                borderRadius: 16,
                color: "#4b5563",
              }}
            >
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>
                Panneau latéral
              </div>
              <div>Aucun panneau spécifique pour cet onglet pour le moment.</div>
            </div>
          )
        }
      />
    </>
  );
}
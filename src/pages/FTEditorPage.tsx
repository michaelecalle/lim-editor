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
  FtSourceTrainRowData,
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
import {
  HORAIRE_COLUMNS,
} from "../modules/ft-editor/constants/ftColumns";
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

function buildEmptyLocalTrainData(): FtSourceTrainData {
  return {
    meta: {
      origine: "",
      destination: "",
    },
    byRowKey: {},
    publishState: "local",
  };
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

    const orderedRows = getDirectionRows(source, direction);
    let previousHoraMinutes: number | null = null;
    let trainChanged = false;
    const nextByRowKey: Record<string, FtSourceTrainRowData> = {
      ...trainData.byRowKey,
    };

    for (const row of orderedRows) {
      const existingRowData = trainData.byRowKey[row.id] as
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
      ? {
          ...trainData,
          byRowKey: nextByRowKey,
        }
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

function clearLocalPublishState(
  source: FtSourceDirectionTables
): FtSourceDirectionTables {
  if (!source.trains) {
    return source;
  }

  const nextTrains: NonNullable<FtSourceDirectionTables["trains"]> = {};

  for (const [trainNumber, trainData] of Object.entries(source.trains)) {
    const { publishState: _publishState, ...restTrainData } = trainData;
    nextTrains[trainNumber] = restTrainData;
  }

  return {
    ...source,
    trains: nextTrains,
  };
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
  const [horaireValidationError, setHoraireValidationError] = useState<string | null>(null);
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
  const [exportStatus, setExportStatus] = useState<"idle" | "success" | "error">(
    "idle"
  );
  const [exportMessage, setExportMessage] = useState<string>(
    "Aucun export local effectué."
  );
  const [exportDiagnostics, setExportDiagnostics] = useState<string[]>([]);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isPublishDialogOpen, setIsPublishDialogOpen] = useState(false);
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

  const horaireRows = useMemo(() => {
    const selectedTrain = parsedSource.trains?.[selectedTrainNumber];

    if (!selectedTrain) {
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
      const rowTrainData = selectedTrain.byRowKey[row.id] as
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

      if (
        currentHoraMinutes != null &&
        previousHoraMinutes != null
      ) {
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
  }, [parsedSource, selectedTrainNumber, sourceRows]);

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

      return {
        ...previous,
        trains: {
          ...previousTrains,
          [selectedTrainNumber]: {
            ...previousTrain,
            meta: {
              ...previousTrain.meta,
              origine: trimmedOrigin,
              destination: trimmedDestination,
            },
          },
        },
      };
    });
  }
}, [horaireRows, selectedDestination, selectedOrigin, selectedTrainNumber]);

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

  const trainMeta = parsedSource.trains?.[selectedTrainNumber]?.meta;
  const metaOrigin = trainMeta?.origine?.trim() ?? "";
  const metaDestination = trainMeta?.destination?.trim() ?? "";

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
}, [horaireSelectionsByTrain, parsedSource, selectedTrainNumber]);

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
    setIsPublishDialogOpen(true);
  }, [hasUnpublishedChanges, isPublishing]);

  const handleCancelPublish = useCallback(() => {
    if (isPublishing) {
      return;
    }

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

  const handleSelectArchive = useCallback(
    async (archiveName: string) => {
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
    },
    []
  );

const handleConfirmPublish = useCallback(async () => {
  if (isPublishing) {
    return;
  }

  setIsPublishing(true);

  try {
    const materializedSource = materializeComputedConcForPublish(parsedSource);
    const publishedSource = clearLocalPublishState(materializedSource);
    const response = await publishLigneFtData(publishedSource);

    setParsedSource(publishedSource);
    setReferenceData(publishedSource);
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
    setIsPublishDialogOpen(false);
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
  setLastDuplicateVariantDecision("yes");
  setPendingDuplicateTrainNumber("");
  setIsDuplicateTrainConfirmOpen(false);
}, []);

const handleDuplicateVariantNo = useCallback(() => {
  setLastDuplicateVariantDecision("no");
  setPendingDuplicateTrainNumber("");
  setIsDuplicateTrainConfirmOpen(false);
}, []);

const handleOpenDeleteTrainConfirm = useCallback(() => {
  if (selectedTrainNumber.trim() === "") {
    return;
  }

  setIsDeleteTrainConfirmOpen(true);
}, [selectedTrainNumber]);

const handleCancelDeleteTrain = useCallback(() => {
  setIsDeleteTrainConfirmOpen(false);
}, []);

const handleConfirmDeleteTrain = useCallback(() => {
  const trainNumberToDelete = selectedTrainNumber.trim();

  if (trainNumberToDelete === "") {
    setIsDeleteTrainConfirmOpen(false);
    return;
  }

  setParsedSource((previous) => {
    const previousTrains = previous.trains ?? {};

    if (!(trainNumberToDelete in previousTrains)) {
      return previous;
    }

    const nextTrains = { ...previousTrains };
    delete nextTrains[trainNumberToDelete];

    return {
      ...previous,
      trains: nextTrains,
    };
  });

  setHoraireSelectionsByTrain((previous) => {
    if (!(trainNumberToDelete in previous)) {
      return previous;
    }

    const nextSelections = { ...previous };
    delete nextSelections[trainNumberToDelete];
    return nextSelections;
  });

  setIsDeleteTrainConfirmOpen(false);
}, [selectedTrainNumber]);

const handleApplyComForSelectedTrain = useCallback(
  (rowId: string, nextCom: string) => {
    if (selectedTrainNumber.trim() === "") {
      return;
    }

    const trimmedCom = nextCom.trim();
    const normalizedCom =
      trimmedCom !== "" && /^[1-9]\d*$/.test(trimmedCom) ? trimmedCom : "";

    setParsedSource((previous) => {
      const previousTrains = previous.trains ?? {};
      const previousTrain = previousTrains[selectedTrainNumber];

      if (!previousTrain) {
        return previous;
      }

      const previousRowData = previousTrain.byRowKey[rowId] ?? {};
      const nextRowData: FtSourceTrainRowData = {
        ...(previousRowData as FtSourceTrainRowData),
      };

      if (normalizedCom === "") {
        delete nextRowData.com;
      } else {
        nextRowData.com = normalizedCom;
      }

      const nextByRowKey = {
        ...previousTrain.byRowKey,
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
          [selectedTrainNumber]: {
            ...previousTrain,
            byRowKey: nextByRowKey,
          },
        },
      };
    });
  },
  [selectedTrainNumber]
);

const handleApplyHoraForSelectedTrain = useCallback(
    (rowId: string, nextHora: string) => {
      if (selectedTrainNumber.trim() === "") {
        return;
      }

      const trimmedHora = nextHora.trim();

      setParsedSource((previous) => {
        const previousTrains = previous.trains ?? {};
        const previousTrain = previousTrains[selectedTrainNumber];

        if (!previousTrain) {
          return previous;
        }

        const previousRowData = previousTrain.byRowKey[rowId] ?? {};
        const nextRowData: FtSourceTrainRowData = {
          ...(previousRowData as FtSourceTrainRowData),
        };

        if (trimmedHora === "") {
          delete nextRowData.hora;
        } else {
          nextRowData.hora = trimmedHora;
        }

        const nextByRowKey = {
          ...previousTrain.byRowKey,
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
            [selectedTrainNumber]: {
              ...previousTrain,
              byRowKey: nextByRowKey,
            },
          },
        };
      });
    },
    [selectedTrainNumber]
  );

  const handleApplyTecnForSelectedTrain = useCallback(
    (rowId: string, nextTecn: string) => {
      if (selectedTrainNumber.trim() === "") {
        return;
      }

      const trimmedTecn = nextTecn.trim();
      const normalizedTecn =
        trimmedTecn !== "" && /^[1-9]\d*$/.test(trimmedTecn) ? trimmedTecn : "";

      setParsedSource((previous) => {
        const previousTrains = previous.trains ?? {};
        const previousTrain = previousTrains[selectedTrainNumber];

        if (!previousTrain) {
          return previous;
        }

        const previousRowData = previousTrain.byRowKey[rowId] ?? {};
        const nextRowData: FtSourceTrainRowData = {
          ...(previousRowData as FtSourceTrainRowData),
        };

        if (normalizedTecn === "") {
          delete nextRowData.tecn;
        } else {
          nextRowData.tecn = normalizedTecn;
        }

        const nextByRowKey = {
          ...previousTrain.byRowKey,
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
            [selectedTrainNumber]: {
              ...previousTrain,
              byRowKey: nextByRowKey,
            },
          },
        };
      });
    },
    [selectedTrainNumber]
  );

  const handleApplyConcForSelectedTrain = useCallback(
    (rowId: string, nextConc: string) => {
      if (selectedTrainNumber.trim() === "") {
        return;
      }

      const trimmedConc = nextConc.trim();
      const normalizedConc =
        trimmedConc !== "" && /^\d+$/.test(trimmedConc)
          ? String(Number(trimmedConc))
          : "";

      setParsedSource((previous) => {
        const previousTrains = previous.trains ?? {};
        const previousTrain = previousTrains[selectedTrainNumber];

        if (!previousTrain) {
          return previous;
        }

        const previousRowData = previousTrain.byRowKey[rowId] ?? {};
        const nextRowData: FtSourceTrainRowData = {
          ...(previousRowData as FtSourceTrainRowData),
        };

        if (normalizedConc === "") {
          delete nextRowData.conc;
        } else {
          nextRowData.conc = normalizedConc;
        }

        const nextByRowKey = {
          ...previousTrain.byRowKey,
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
            [selectedTrainNumber]: {
              ...previousTrain,
              byRowKey: nextByRowKey,
            },
          },
        };
      });
    },
    [selectedTrainNumber]
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
      const tableNames: Array<keyof FtSourceDirectionTables> = ["nordSud", "sudNord"];

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

          if (
            isRecord(previousRawRow) &&
            previousRawRow["type"] === "note"
          ) {
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
        const tableNames: Array<keyof FtSourceDirectionTables> = ["nordSud", "sudNord"];

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
                if (event.key === "Enter" && isTrainNumberInputValid(createTrainInput)) {
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

            {createTrainInput.trim() !== "" && !isTrainNumberInputValid(createTrainInput) ? (
              <div
                style={{
                  marginBottom: 16,
                  color: "#991b1b",
                  fontSize: 14,
                  fontWeight: 500,
                }}
              >
                Le numéro doit contenir uniquement des chiffres, avec une longueur de 1 à 6.
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
              <strong>{removeLeadingZeros(pendingLeadingZeroTrainNumber)}</strong> ?
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
              Supprimer un train
            </div>

            <div
              style={{
                color: "#111827",
                lineHeight: 1.5,
                marginBottom: 20,
              }}
            >
              Voulez-vous supprimer le train{" "}
              <strong>{selectedTrainNumber || "?"}</strong> ?
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
                    border: isActive ? "1px solid #2563eb" : "1px solid #d1d5db",
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
                  onChange={(event) => setSelectedTrainNumber(event.target.value)}
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
                      const isUnpublished = unpublishedTrainNumbers.has(trainNumber);

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
                        const trainMeta =
                          parsedSource.trains?.[selectedTrainNumber]?.meta;

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
                        const trainMeta =
                          parsedSource.trains?.[selectedTrainNumber]?.meta;

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
                      selectedTrainNumber.trim() === "" ? "#fca5a5" : "#dc2626",
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
              <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>
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
            <div>
              Aucun panneau spécifique pour cet onglet pour le moment.
            </div>
          </div>
        )
      }
      />
    </>
  );
}
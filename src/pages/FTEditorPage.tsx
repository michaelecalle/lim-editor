import { useCallback, useEffect, useMemo, useState } from "react";
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

  const directionLabel = getDirectionLabel(direction);
  const sourceTableLabel = getSourceTableLabel(direction);

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
      return sourceRows;
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
      let nextConc = "";

      if (rowTrainData?.conc != null) {
        nextConc = rowTrainData.conc;
      } else if (
        currentHoraMinutes != null &&
        previousHoraMinutes != null
      ) {
        const rawDiff = currentHoraMinutes - previousHoraMinutes;
        nextConc = String(rawDiff >= 0 ? rawDiff : rawDiff + 24 * 60);
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
      };
    });
  }, [parsedSource, selectedTrainNumber, sourceRows]);

  const availableTrainNumbers = useMemo(() => {
    return Object.keys(parsedSource.trains ?? {}).sort((a, b) =>
      a.localeCompare(b, "fr", { numeric: true, sensitivity: "base" })
    );
  }, [parsedSource]);

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

    if (!savedSelection) {
      setSelectedOrigin("");
      setSelectedDestination("");
      setValidatedOrigin("");
      setValidatedDestination("");
      setHoraireValidationError(null);
      return;
    }

    setSelectedOrigin(savedSelection.selectedOrigin);
    setSelectedDestination(savedSelection.selectedDestination);
    setValidatedOrigin(savedSelection.validatedOrigin);
    setValidatedDestination(savedSelection.validatedDestination);
    setHoraireValidationError(null);
  }, [horaireSelectionsByTrain, selectedTrainNumber]);

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
      const response = await publishLigneFtData(parsedSource);

      setReferenceData(parsedSource);
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
                    border: "1px solid #d1d5db",
                    background: "#ffffff",
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
                    availableTrainNumbers.map((trainNumber) => (
                      <option key={trainNumber} value={trainNumber}>
                        {trainNumber}
                      </option>
                    ))
                  )}
                </select>

                <div style={{ fontWeight: 600 }}>Origine :</div>

                <select
                  value={selectedOrigin}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    setSelectedOrigin(nextValue);

                    if (selectedTrainNumber.trim() !== "") {
                      setHoraireSelectionsByTrain((previous) => ({
                        ...previous,
                        [selectedTrainNumber]: {
                          selectedOrigin: nextValue,
                          selectedDestination:
                            previous[selectedTrainNumber]?.selectedDestination ??
                            selectedDestination,
                          validatedOrigin:
                            previous[selectedTrainNumber]?.validatedOrigin ?? "",
                          validatedDestination:
                            previous[selectedTrainNumber]?.validatedDestination ?? "",
                        },
                      }));
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
                      setHoraireSelectionsByTrain((previous) => ({
                        ...previous,
                        [selectedTrainNumber]: {
                          selectedOrigin:
                            previous[selectedTrainNumber]?.selectedOrigin ??
                            selectedOrigin,
                          selectedDestination: nextValue,
                          validatedOrigin:
                            previous[selectedTrainNumber]?.validatedOrigin ?? "",
                          validatedDestination:
                            previous[selectedTrainNumber]?.validatedDestination ?? "",
                        },
                      }));
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

              <FTTable
                title="Tableau horaire"
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
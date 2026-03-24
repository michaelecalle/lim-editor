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
import type { FtSourceDirectionTables } from "../modules/ft-editor/types/sourceTypes";
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
import { getDirectionRows } from "../modules/ft-editor/selectors/getDirectionRows";
import { areSourceTablesEqual } from "../modules/ft-editor/utils/areSourceTablesEqual";

type SourceStatus = "idle" | "loading" | "success" | "error";

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

export default function FTEditorPage() {
  const [direction, setDirection] = useState<EditorDirection>("NORD_SUD");
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

  const hasUnpublishedChanges = useMemo(() => {
    return !areSourceTablesEqual(parsedSource, referenceData);
  }, [parsedSource, referenceData]);

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
        `Publication réussie : fichier actif mis à jour, archive créée ${response.diagnostic.archiveCreated.name}.`
      );
      setExportDiagnostics([
        `Fichier TS publié : ${response.diagnostic.publishedPath}`,
        `Fichier JSON publié : ${response.diagnostic.publishedJsonPath}`,
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
      }
      detailsPanel={
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
      }
      />
    </>
  );
}
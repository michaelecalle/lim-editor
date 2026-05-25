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
  fetchRemoteLtvNormalizedJson,
  inspectRemoteFtSourceRaw,
  parseFtSourceArraysFromRaw,
  validateNormalizedFtSource,
} from "../data/ligneFTSource";
import {
  fetchLigneFtArchive,
  fetchLigneFtArchives,
  publishLigneFtData,
} from "../modules/ft-editor/api/ligneftApi";
import { publishLtvNormalizedData } from "../modules/ft-editor/api/ltvApi";
import { HORAIRE_COLUMNS } from "../modules/ft-editor/constants/ftColumns";
import { getDirectionRows } from "../modules/ft-editor/selectors/getDirectionRows";
import { areSourceTablesEqual } from "../modules/ft-editor/utils/areSourceTablesEqual";
import { detectCsvZones } from "../modules/ft-editor/utils/csvZoneDetection";
import { PDFViewer } from "@react-pdf/renderer";
import LimPdf from "../components/pdf/LimPdf";
import type { PdfFtRow, PdfLtvRow } from "../components/pdf/LimPdf";
import PdfExportPanel from "../components/export/PdfExportPanel";
import FTTab from "../components/tabs/FTTab";
import ExportTab from "../components/tabs/ExportTab";
import HoraireTab from "../components/tabs/HoraireTab";
import LTVTab from "../components/tabs/LTVTab";
import {
  type LtvEditorRow,
  type LtvAdifApiResponse,
  type LtvVatardApiResponse,
  type VatardApiEntry,
  type LtvEditorTextField,
  type LtvEditorFlagField,
  LTV_ADIF_ENDPOINT_URL,
  LTV_VATARD_ENDPOINT_URL,
  LTV_ADIF_REFERENCE_LINE,
  LTV_ADIF_REFERENCE_PK,
  isAdifEntryOnReferenceLine,
  isAdifEntryOnReferenceRoute,
  getDirectionLabel,
  getSourceTableLabel,
  getRowPreview,
  isRecord,
  getDirectionFromTrainNumber,
  findVariantForDate,
  parseHoraToMinutesForConc,
  hasLeadingZeros,
  removeLeadingZeros,
  buildDefaultVariantValidity,
  getDefaultLigneValue,
  formatVariantDateForDisplay,
  buildEmptyLocalTrainVariantData,
  buildLegacyTrainMeta,
  buildLegacyTrainByRowKey,
  getVariantCount,
  getVariantAtIndex,
  replaceVariantAtIndex,
  buildEmptyLocalTrainData,
  getVariantActiveDayCount,
  getOverlappingVariantDayLabels,
  doVariantDaysOverlap,
  normalizeVariantDateRange,
  doVariantDateRangesOverlap,
  getConflictingVariantIndex,
  isTrainNumberInputValid,
  getSuggestedNumeroFranceForPublish,
  materializeComputedConcForPublish,
  buildPublishedSourceForPublish,
  buildEmptyLtvEditorRow,
  buildNextLtvManualId,
  moveLtvEditorRow,
  formatLtvDateInput,
  formatLtvTimeInput,
  normalizeLtvKm,
  formatLtvDecimalKmInput,
  normalizeLtvCode,
  normalizeLtvFieldForComparison,
  formatLtvTextInput,
  formatAdifTextValue,
  formatAdifLtvSection,
  formatAdifLtvKm,
  formatAdifLtvDate,
  formatAdifLtvTime,
  isAdifFlagEnabled,
  formatAdifSourceDateForMessage,
  mapAdifEntryToLtvEditorRow,
  isLtvRowCompletelyEmpty,
  getLtvPublicationWarnings,
  buildLtvNormalizedFile,
  readLtvTextField,
  readLtvFlagField,
  readLtvEditedFields,
  readLtvNormalizedRowsFromFile,
  readLtvNormalizedFileInfo,
  formatLtvDateTimeForDisplay,
  enrichLtvRowsFromVatard,
} from "../modules/ft-editor/utils/ftEditorUtils";

type SourceStatus = "idle" | "loading" | "success" | "error";
type EditorTab = "FT" | "HORAIRE" | "LTV" | "EXPORT";

export default function FTEditorPage() {
  const [activeTab, setActiveTab] = useState<EditorTab>("LTV");
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

  const [ltvNormalizedStatus, setLtvNormalizedStatus] =
    useState<SourceStatus>("idle");
  const [ltvNormalizedMessage, setLtvNormalizedMessage] = useState<string>(
    "Aucune tentative de chargement du fichier LTV normalisé."
  );
  const [ltvNormalizedFileInfo, setLtvNormalizedFileInfo] = useState<{
    publishedAt: string;
    source: string;
    fetchedAt: string;
    sourceUpdatedAt: string | null;
    sourceUpdatedFile: string | null;
    warningCount: number;
  } | null>(null);
  const [ltvNormalizedRows, setLtvNormalizedRows] = useState<LtvEditorRow[]>([]);
  const [ltvAdifRows, setLtvAdifRows] = useState<LtvEditorRow[]>([]);
  const [ltvAdifOtherRows, setLtvAdifOtherRows] = useState<LtvEditorRow[]>([]);
  const [ltvAdifStatus, setLtvAdifStatus] = useState<SourceStatus>("idle");
  const [ltvAdifMeta, setLtvAdifMeta] = useState<{
    source: string;
    fetchedAt: string;
    sourceUpdatedAt: string | null;
    sourceUpdatedFile: string | null;
  }>({
    source: "unknown",
    fetchedAt: "",
    sourceUpdatedAt: null,
    sourceUpdatedFile: null,
  });
  const [ltvAdifMessage, setLtvAdifMessage] = useState<string>(
    "Aucune tentative de chargement ADIF."
  );
  const [ltvVatardEntries, setLtvVatardEntries] = useState<VatardApiEntry[]>([]);
  const [ltvVatardStatus, setLtvVatardStatus] = useState<SourceStatus>("idle");
  const [ltvVatardMessage, setLtvVatardMessage] = useState<string>(
    "Aucune tentative de chargement Vatard."
  );
  const [pendingLtvDeleteRowId, setPendingLtvDeleteRowId] = useState<
    string | null
  >(null);
  const [draggedLtvRowId, setDraggedLtvRowId] = useState<string | null>(null);
  const [dragOverLtvRowId, setDragOverLtvRowId] = useState<string | null>(null);
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
  const [isLigneEditing, setIsLigneEditing] = useState(false);
  const [isNumeroFranceEditing, setIsNumeroFranceEditing] = useState(false);
  const [exportTrainNumber, setExportTrainNumber] = useState<string>("");
  const [exportComposition, setExportComposition] = useState<string>("US");
  const [exportDate, setExportDate] = useState<string>(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [exportVariantOverrideIndex, setExportVariantOverrideIndex] = useState<number | null>(null);
  const [isCategorieEspagneEditing, setIsCategorieEspagneEditing] =
    useState(false);
  const [isCategorieFranceEditing, setIsCategorieFranceEditing] =
    useState(false);
  const [isMaterielEditing, setIsMaterielEditing] = useState(false);
  const [isCompositionEditing, setIsCompositionEditing] = useState(false);
  const [numeroFranceWarning, setNumeroFranceWarning] = useState<string | null>(
    null
  );
  const directionLabel = getDirectionLabel(direction);
  const sourceTableLabel = getSourceTableLabel(direction);
  const horaireDirection: EditorDirection =
    getDirectionFromTrainNumber(selectedTrainNumber) ?? "SUD_NORD";

  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const tomorrowIso = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  }, []);

  const exportDateFormatted = useMemo(
    () =>
      new Date(exportDate + "T00:00:00").toLocaleDateString("fr-FR", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }),
    [exportDate]
  );

  const exportTrainData = useMemo(
    () => parsedSource.trains?.[exportTrainNumber] ?? null,
    [parsedSource, exportTrainNumber]
  );

  const exportAutoVariant = useMemo(() => {
    if (!exportTrainData) return null;
    return findVariantForDate(exportTrainData, exportDate);
  }, [exportTrainData, exportDate]);

  const exportAutoVariantIndex = useMemo(() => {
    if (!exportTrainData || !exportAutoVariant) return -1;
    return exportTrainData.variants.indexOf(exportAutoVariant);
  }, [exportTrainData, exportAutoVariant]);

  const exportVariant = useMemo(() => {
    if (!exportTrainData) return null;
    if (exportVariantOverrideIndex !== null) {
      return exportTrainData.variants[exportVariantOverrideIndex] ?? exportAutoVariant;
    }
    return exportAutoVariant;
  }, [exportTrainData, exportVariantOverrideIndex, exportAutoVariant]);

  const exportDirection: EditorDirection =
    getDirectionFromTrainNumber(exportTrainNumber) ?? "SUD_NORD";

  const exportFtRows = useMemo((): PdfFtRow[] => {
    const allDirRows = getDirectionRows(parsedSource, exportDirection);
    const origin = exportVariant?.meta.origine?.trim() ?? "";
    const destination = exportVariant?.meta.destination?.trim() ?? "";

    const norm = (s: string) =>
      s.normalize("NFD").replace(/\p{Mn}/gu, "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const normOrigin = norm(origin);
    const normDest = norm(destination);

    // Trouver les bornes du parcours parmi les lignes "data" (pas les notes)
    const startIdx =
      normOrigin !== ""
        ? allDirRows.findIndex(
            (r) => !r.visual.isNoteOnly && norm(r.visible.dependencia.trim()) === normOrigin
          )
        : -1;

    let endIdx = -1;
    if (normDest !== "") {
      for (let i = allDirRows.length - 1; i >= 0; i--) {
        if (!allDirRows[i].visual.isNoteOnly && norm(allDirRows[i].visible.dependencia.trim()) === normDest) {
          endIdx = i;
          break;
        }
      }
    }

    const dirRows =
      startIdx >= 0 && endIdx >= startIdx
        ? allDirRows.slice(startIdx, endIdx + 1)
        : allDirRows;

    const rawRows = dirRows.map((row) => {
      const rowData = exportVariant?.byRowKey[row.id] as
        | FtSourceTrainRowData
        | undefined;
      return {
        id: row.id,
        type: (row.visual.isNoteOnly ? "note" : "data") as "data" | "note",
        bloqueo: row.visible.bloqueo,
        vmax: row.visible.vmax,
        sitKm: row.visible.pkDisplay,
        dependencia: row.visible.dependencia,
        com: rowData?.com ?? row.visible.com ?? "",
        hora: rowData?.hora ?? row.visible.hora ?? "",
        tecn: rowData?.tecn ?? row.visible.tecn ?? "",
        conc: rowData?.conc ?? row.visible.conc ?? "",
        radio: row.visible.radio,
        rampCaract: row.visible.rc,
        etcs: row.visible.etcs,
        csv: row.technical.csv ?? false,
        notes: row.visible.noteDisplay ? [row.visible.noteDisplay] : [],
        ltvNote: "",
        pkInterne: row.visible.pkInternalDisplay,
      };
    });

    const dataRowsOnly = rawRows.filter((r) => r.type === "data");
    const dataRowCount = dataRowsOnly.length;

    // Identifier les groupes bloqueo et la ligne qui affiche le texte
    const bloqueoGroups: { start: number; len: number }[] = [];
    {
      let gs = 0;
      for (let i = 1; i <= dataRowsOnly.length; i++) {
        if (i === dataRowsOnly.length || dataRowsOnly[i].bloqueo !== dataRowsOnly[i - 1].bloqueo) {
          bloqueoGroups.push({ start: gs, len: i - gs });
          gs = i;
        }
      }
    }
    const bloqueoMiddleIds = new Set<string>();
    // Groupes d'1 ligne avec barre : le texte va dans la ligne intermédiaire suivante
    const bloqueoTextBelowMap = new Map<string, string>(); // rowId → texte bloqueo
    for (const { start, len } of bloqueoGroups) {
      // Cohérent avec showBloqueoBar : barre si la 1ère ligne du groupe n'est ni la 1ère ni la dernière ligne de données
      const hasBar = start > 0 && start < dataRowCount - 1;
      if (hasBar && len === 1) {
        // La ligne principale a une barre ET est seule → texte dans la ligne intermédiaire
        bloqueoTextBelowMap.set(dataRowsOnly[start].id, dataRowsOnly[start].bloqueo);
      } else {
        // Centrer le texte parmi les lignes disponibles (après la barre si elle existe)
        const midInGroup = hasBar && len > 1
          ? 1 + Math.floor((len - 2) / 2)
          : Math.floor((len - 1) / 2);
        bloqueoMiddleIds.add(dataRowsOnly[start + midInGroup].id);
      }
    }
    // Groupes radio — même logique que bloqueo
    const radioGroups: { start: number; len: number }[] = [];
    {
      let gs = 0;
      for (let i = 1; i <= dataRowsOnly.length; i++) {
        if (i === dataRowsOnly.length || dataRowsOnly[i].radio !== dataRowsOnly[i - 1].radio) {
          radioGroups.push({ start: gs, len: i - gs });
          gs = i;
        }
      }
    }
    const radioMiddleIds = new Set<string>();
    const radioTextBelowMap = new Map<string, string>();
    for (const { start, len } of radioGroups) {
      const hasBar = start > 0 && start < dataRowCount - 1;
      if (hasBar && len === 1) {
        radioTextBelowMap.set(dataRowsOnly[start].id, dataRowsOnly[start].radio);
      } else {
        const midInGroup = hasBar && len > 1
          ? 1 + Math.floor((len - 2) / 2)
          : Math.floor((len - 1) / 2);
        radioMiddleIds.add(dataRowsOnly[start + midInGroup].id);
      }
    }

    // Groupes rampCaract — même logique que bloqueo
    const rampCaractGroups: { start: number; len: number }[] = [];
    {
      let gs = 0;
      for (let i = 1; i <= dataRowsOnly.length; i++) {
        if (i === dataRowsOnly.length || dataRowsOnly[i].rampCaract !== dataRowsOnly[i - 1].rampCaract) {
          rampCaractGroups.push({ start: gs, len: i - gs });
          gs = i;
        }
      }
    }
    const rcMiddleIds = new Set<string>();
    const rcTextBelowMap = new Map<string, string>();
    for (const { start, len } of rampCaractGroups) {
      const hasBar = start > 0 && start < dataRowCount - 1;
      if (hasBar && len === 1) {
        rcTextBelowMap.set(dataRowsOnly[start].id, dataRowsOnly[start].rampCaract);
      } else {
        const midInGroup = hasBar && len > 1
          ? 1 + Math.floor((len - 2) / 2)
          : Math.floor((len - 1) / 2);
        rcMiddleIds.add(dataRowsOnly[start + midInGroup].id);
      }
    }

    // Groupes vmax — barre sur la 1ère ligne de chaque groupe sauf le 1er (pas de borne haute)
    const vmaxGroups: { start: number; len: number }[] = [];
    {
      let gs = 0;
      let lastV = "";
      for (let i = 0; i < dataRowsOnly.length; i++) {
        const v = dataRowsOnly[i].vmax;
        if (i > 0 && v !== "" && v !== lastV) {
          vmaxGroups.push({ start: gs, len: i - gs });
          gs = i;
        }
        if (i === dataRowsOnly.length - 1) {
          vmaxGroups.push({ start: gs, len: dataRowsOnly.length - gs });
        }
        if (v !== "") lastV = v; // ne pas écraser lastV avec "" (héritage de vitesse)
      }
    }
    const vmaxBarIds = new Set<string>();
    const vmaxMiddleIds = new Set<string>();
    const vmaxTextBelowMap = new Map<string, string>();
    const vmaxDisplayValueMap = new Map<string, string>();
    for (const { start, len } of vmaxGroups) {
      const hasBar = start > 0;
      const value = dataRowsOnly[start].vmax;
      if (hasBar) {
        vmaxBarIds.add(dataRowsOnly[start].id);
      }
      if (hasBar && len === 1) {
        vmaxTextBelowMap.set(dataRowsOnly[start].id, value);
      } else {
        const midInGroup = hasBar && len > 1
          ? 1 + Math.floor((len - 2) / 2)
          : Math.floor((len - 1) / 2);
        const midRow = dataRowsOnly[start + midInGroup];
        vmaxMiddleIds.add(midRow.id);
        vmaxDisplayValueMap.set(midRow.id, value);
      }
    }

    // Gares voyageurs : correspondance exacte sur le champ dependencia
    const PASSENGER_STATIONS = new Set([
      "PERPIGNAN",
      "FIGUERES-VILAFANT",
      "GIRONA",
      "BARCELONA SANTS",
      "CAN TUNIS AV",
    ]);

    // Détection des zones CSV et construction du map id → highlight
    const csvZones = detectCsvZones(rawRows, exportDirection === "SUD_NORD" ? "sudNord" : "nordSud");

    const csvHighlightMap = new Map<string, "lower" | "full" | "upper">();
    const csvTrueIdSet = new Set<string>();
    const csvEndIdSet = new Set<string>();
    for (const zone of csvZones.filter(z => !z.startsAtFirstLine)) {
      zone.csvTrueIds.forEach((id, idx) => {
        csvTrueIdSet.add(id);
        csvHighlightMap.set(id, idx === 0 ? "lower" : "full");
      });
      if (zone.endId) {
        csvEndIdSet.add(zone.endId);
        csvHighlightMap.set(zone.endId, "upper");
      }
    }

    // Propager l'état de zone aux notes en parcourant dans l'ordre du fichier
    let inZone = false;
    for (const row of rawRows) {
      if (row.type === "data") {
        if (csvTrueIdSet.has(row.id)) {
          inZone = true;
        } else if (csvEndIdSet.has(row.id)) {
          inZone = false;
        } else {
          inZone = false;
        }
      } else {
        if (inZone) csvHighlightMap.set(row.id, "full");
      }
    }

    let dataRowIndex = 0;

    let lastBloqueo = "";
    let lastRadio = "";
    let lastRampCaract = "";
    let isFirstDataRow = true;

    return rawRows.map((row) => {
      const showBloqueo = row.bloqueo !== lastBloqueo;
      const showRadio = row.radio !== lastRadio;
      lastBloqueo = row.bloqueo;
      lastRadio = row.radio;

      let showVBar = false;
      let showRcBar = false;
      let showBloqueoBar = false;
      let showRadioBar = false;
      let isFirstRow = false;
      let isLastRow = false;

      if (row.type === "data") {
        const isFirst = dataRowIndex === 0;
        const isLast = dataRowIndex === dataRowCount - 1;
        isFirstRow = isFirst;
        isLastRow = isLast;
        showBloqueoBar = showBloqueo && !isFirst && !isLast;
        showRadioBar = showRadio && !isFirst && !isLast;
        showRcBar = row.rampCaract !== lastRampCaract && !isFirst && !isLast;

        showVBar = vmaxBarIds.has(row.id);
        lastRampCaract = row.rampCaract;
        isFirstDataRow = false;
        dataRowIndex++;
      }

      const dep = row.dependencia.trim();
      /* eslint-disable no-misleading-character-class */
      const stripAccents = (s: string) => s.normalize("NFD").replace(/\p{Mn}/gu, "").toLowerCase().replace(/[^a-z0-9]/g, "");
      /* eslint-enable no-misleading-character-class */
      const normDep = stripAccents(dep);
      const normOrigin = stripAccents(origin);
      const normDest = stripAccents(destination);
      const isPassengerStation = PASSENGER_STATIONS.has(dep);
      const highlight =
        row.type === "data" &&
        ((isFirstRow || isLastRow)
          ? isPassengerStation
          : ((row.hora !== "" && (row.com !== "" || row.tecn !== "")) ||
             (dep !== "" && normOrigin !== "" && normDep === normOrigin) ||
             (dep !== "" && normDest !== "" && normDep === normDest)));

      const showBloqueoText = bloqueoMiddleIds.has(row.id);
      const bloqueoTextBelow = bloqueoTextBelowMap.get(row.id) ?? "";
      const showRadioText = radioMiddleIds.has(row.id);
      const radioTextBelow = radioTextBelowMap.get(row.id) ?? "";
      const showRcText = rcMiddleIds.has(row.id);
      const rampCaractTextBelow = rcTextBelowMap.get(row.id) ?? "";
      const showVmaxText = vmaxMiddleIds.has(row.id);
      const vmaxDisplayValue = vmaxDisplayValueMap.get(row.id) ?? "";
      const vmaxTextBelow = vmaxTextBelowMap.get(row.id) ?? "";
      const csvHighlight = csvHighlightMap.get(row.id) ?? "none";

      return { ...row, showBloqueo, showBloqueoBar, showBloqueoText, bloqueoTextBelow, showRadio, showRadioBar, showRadioText, radioTextBelow, showVBar, showVmaxText, vmaxDisplayValue, vmaxTextBelow, showRcBar, showRcText, rampCaractTextBelow, highlight, csvHighlight };
    });
  }, [parsedSource, exportDirection, exportVariant]);

  const exportLtvRows = useMemo((): PdfLtvRow[] => {
    return ltvNormalizedRows.map((r) => ({
      code: r.code,
      section: r.section,
      via: r.via,
      kmIni: r.kmIni,
      kmFin: r.kmFin,
      speed: r.speed,
      motivo: r.motivo,
      fecha1: r.fecha1,
      hora1: r.hora1,
      fecha2: r.fecha2,
      hora2: r.hora2,
      viaCheck: r.viaCheck,
      sistema: r.sistema,
      soloCabeza: r.soloCabeza,
      csv: r.csv,
      observaciones: r.observaciones,
    }));
  }, [ltvNormalizedRows]);

  // LTV filtrées sur le parcours effectif du train (overlap avec [minPk, maxPk] des lignes FT)
  const exportLtvRowsFiltered = useMemo((): PdfLtvRow[] => {
    const parsePk = (s: string): number | null => {
      const n = parseFloat(s.replace(",", ".").trim());
      return isNaN(n) ? null : n;
    };

    const pkValues = exportFtRows
      .filter((r) => r.type === "data")
      .map((r) => parsePk(r.pkInterne))
      .filter((pk): pk is number => pk !== null);

    if (pkValues.length === 0) return exportLtvRows;

    const routeMinPk = Math.min(...pkValues);
    const routeMaxPk = Math.max(...pkValues);

    return exportLtvRows.filter((ltv) => {
      const pkIni = parsePk(ltv.kmIni);
      const pkFin = parsePk(ltv.kmFin);
      // Sécurité : si PK illisible, on affiche plutôt que de masquer par erreur
      if (pkIni === null || pkFin === null) return true;
      const minPk = Math.min(pkIni, pkFin);
      const maxPk = Math.max(pkIni, pkFin);
      return maxPk >= routeMinPk && minPk <= routeMaxPk;
    });
  }, [exportFtRows, exportLtvRows]);

  const exportFtRowsFinal = useMemo((): PdfFtRow[] => {
    const parsePk = (s: string): number | null => {
      const n = parseFloat(s.replace(",", ".").trim());
      return isNaN(n) ? null : n;
    };

    const isIncreasing = exportDirection === "SUD_NORD";

    // Lignes de données uniquement, avec leur PK parsé
    // On utilise pkInterne (PK interne monotone : croissant SUD_NORD, décroissant NORD_SUD
    // après inversion) plutôt que sitKm (effectivePk) qui prend le min de tous les réseaux
    // et donne des valeurs incohérentes pour les stations trans-réseaux (ex. LIMITE ADIF).
    const dataRowPks = exportFtRows
      .filter((r) => r.type === "data")
      .map((r) => ({ id: r.id, pk: parsePk(r.pkInterne) }))
      .filter((r): r is { id: string; pk: number } => r.pk !== null);

    // Association LTV → ligne FT par proximité de PK
    const ltvNoteMap = new Map<string, string[]>();
    for (const ltv of exportLtvRowsFiltered) {
      const pkIni = parsePk(ltv.kmIni);
      const pkFin = parsePk(ltv.kmFin);
      if (pkIni === null || pkFin === null) continue;

      const entryPk = isIncreasing ? Math.min(pkIni, pkFin) : Math.max(pkIni, pkFin);

      let targetId: string | null = null;
      for (const { id, pk } of dataRowPks) {
        if (isIncreasing ? pk <= entryPk : pk >= entryPk) targetId = id;
        else break;
      }
      if (!targetId) continue;

      const speed = ltv.speed.trim();
      // Ordre des PK : croissant pour SUD_NORD, décroissant pour NORD_SUD
      const [firstPkStr, secondPkStr] =
        isIncreasing
          ? pkIni <= pkFin ? [ltv.kmIni, ltv.kmFin] : [ltv.kmFin, ltv.kmIni]
          : pkIni >= pkFin ? [ltv.kmIni, ltv.kmFin] : [ltv.kmFin, ltv.kmIni];
      const note = `LTV ${speed} - PK ${firstPkStr} → ${secondPkStr}${ltv.observaciones.trim() ? ` — ${ltv.observaciones.trim()}` : ""}`;
      if (!ltvNoteMap.has(targetId)) ltvNoteMap.set(targetId, []);
      ltvNoteMap.get(targetId)!.push(note);
    }

    let finalRows = exportFtRows.map((row) => ({
      ...row,
      ltvNote: ltvNoteMap.get(row.id)?.join("\n") ?? "",
    }));

    // Pour NORD_SUD, les lignes de remarque rouge (type "note") apparaissent
    // après la ligne de données qui les précède dans la séquence inversée,
    // alors qu'elles doivent être AVANT cette ligne (au-dessus dans le PDF).
    // On remonte chaque note juste avant la dernière ligne de données vue.
    if (exportDirection === "NORD_SUD") {
      const reordered: PdfFtRow[] = [];
      for (const row of finalRows) {
        if (row.type === "note") {
          // Trouver l'index de la dernière ligne "data" dans reordered
          let insertIdx = reordered.length;
          for (let j = reordered.length - 1; j >= 0; j--) {
            if (reordered[j].type === "data") {
              insertIdx = j;
              break;
            }
          }
          reordered.splice(insertIdx, 0, row);
        } else {
          reordered.push(row);
        }
      }
      finalRows = reordered;
    }

    return finalRows;
  }, [exportFtRows, exportLtvRowsFiltered, exportDirection]);

  const exportVariantIndex = useMemo(() => {
    if (!exportTrainData || !exportVariant) return -1;
    return exportTrainData.variants.indexOf(exportVariant);
  }, [exportTrainData, exportVariant]);

  const exportAllVariantInfos = useMemo(() => {
    if (!exportTrainData) return [];
    const formatDate = (d: string) => {
      if (!d) return "∞";
      const [y, m, day] = d.split("-");
      return `${day}/${m}/${y}`;
    };
    const dayLabels = [
      { key: "monday" as const, label: "L" },
      { key: "tuesday" as const, label: "M" },
      { key: "wednesday" as const, label: "M" },
      { key: "thursday" as const, label: "J" },
      { key: "friday" as const, label: "V" },
      { key: "saturday" as const, label: "S" },
      { key: "sunday" as const, label: "D" },
    ];
    return exportTrainData.variants.map((v, i) => {
      const { startDate, endDate, days } = v.meta.validity;
      return {
        index: i,
        label: `Variante ${String.fromCharCode(65 + i)}`,
        dates: `${formatDate(startDate)} → ${formatDate(endDate)}`,
        days: dayLabels.map((d) => (days[d.key] ? d.label : "·")).join(" "),
      };
    });
  }, [exportTrainData]);

  const exportLongueur =
    exportComposition === "US" ? 200 : exportComposition === "UM" ? 400 : undefined;
  const exportMasse =
    exportComposition === "US" ? 433 : exportComposition === "UM" ? 866 : undefined;

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

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLtvAdifStatus("loading");
      setLtvAdifMessage("Chargement des LTV ADIF en cours...");
      setLtvAdifRows([]);
      setLtvAdifOtherRows([]);
      setLtvAdifMeta({
        source: "unknown",
        fetchedAt: "",
        sourceUpdatedAt: null,
        sourceUpdatedFile: null,
      });

      try {
        const response = await fetch(LTV_ADIF_ENDPOINT_URL);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const payload = (await response.json()) as LtvAdifApiResponse;

        if (!payload.ok) {
          throw new Error(payload.error ?? "Réponse ADIF invalide.");
        }

        const adifEntries = Array.isArray(payload.ltv) ? payload.ltv : [];
        const lineEntries = adifEntries.filter(isAdifEntryOnReferenceLine);
        const mainEntries = lineEntries.filter(isAdifEntryOnReferenceRoute);
        const otherEntries = lineEntries.filter(
          (entry) => !isAdifEntryOnReferenceRoute(entry)
        );

        const nextRows = mainEntries.map(mapAdifEntryToLtvEditorRow);
        const nextOtherRows = otherEntries.map(mapAdifEntryToLtvEditorRow);

        if (cancelled) {
          return;
        }

        const sourceDate = formatAdifSourceDateForMessage(
          payload.sourceUpdatedAt
        );
        const sourceDateText =
          sourceDate !== "" ? ` Données source du ${sourceDate}.` : "";
        const warningText = payload.warning ? ` ${payload.warning}.` : "";

        setLtvAdifRows(nextRows);
        setLtvAdifOtherRows(nextOtherRows);
        setLtvAdifMeta({
          source: payload.source,
          fetchedAt: payload.fetchedAt,
          sourceUpdatedAt: payload.sourceUpdatedAt,
          sourceUpdatedFile: payload.sourceUpdatedFile,
        });
        setLtvAdifStatus("success");
        setLtvAdifMessage(
          `${lineEntries.length} LTV ADIF ligne ${LTV_ADIF_REFERENCE_LINE} chargée${
            lineEntries.length > 1 ? "s" : ""
          } depuis ${payload.source} : ${nextRows.length} Barcelona/Figueras, ${nextOtherRows.length} autres.${sourceDateText}${warningText}`
        );
      } catch (error) {
        if (cancelled) {
          return;
        }

        setLtvAdifRows([]);
        setLtvAdifOtherRows([]);
        setLtvAdifMeta({
          source: "unknown",
          fetchedAt: "",
          sourceUpdatedAt: null,
          sourceUpdatedFile: null,
        });
        setLtvAdifStatus("error");
        setLtvAdifMessage(
          error instanceof Error
            ? `Chargement ADIF échoué : ${error.message}`
            : "Chargement ADIF échoué : erreur inconnue."
        );
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLtvVatardStatus("loading");
      setLtvVatardMessage("Chargement des données Vatard en cours...");
      setLtvVatardEntries([]);

      try {
        const response = await fetch(LTV_VATARD_ENDPOINT_URL);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const payload = (await response.json()) as LtvVatardApiResponse;

        if (!payload.ok) {
          throw new Error(payload.error ?? "Réponse Vatard invalide.");
        }

        const entries = Array.isArray(payload.raw) ? payload.raw : [];

        if (cancelled) return;

        setLtvVatardEntries(entries);
        setLtvVatardStatus("success");
        setLtvVatardMessage(
          `${entries.length} entrées Vatard chargées depuis ${payload.source}.`
        );
      } catch (error) {
        if (cancelled) return;

        setLtvVatardEntries([]);
        setLtvVatardStatus("error");
        setLtvVatardMessage(
          error instanceof Error
            ? `Chargement Vatard échoué : ${error.message}`
            : "Chargement Vatard échoué : erreur inconnue."
        );
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLtvNormalizedStatus("loading");
      setLtvNormalizedMessage("Chargement du fichier LTV normalisé en cours...");

      const result = await fetchRemoteLtvNormalizedJson();

      if (cancelled) {
        return;
      }

      if (!result.ok) {
        setLtvNormalizedStatus("error");
        setLtvNormalizedFileInfo(null);
        setLtvNormalizedMessage(
          `Chargement du fichier LTV normalisé échoué : ${result.errorMessage}`
        );
        return;
      }

      const nextRows = readLtvNormalizedRowsFromFile(result.data);
      const nextFileInfo = readLtvNormalizedFileInfo(result.data);

      setLtvNormalizedRows(nextRows);
      setLtvNormalizedFileInfo(nextFileInfo);
      setLtvNormalizedStatus("success");
      setLtvNormalizedMessage(
        `${nextRows.length} LTV normalisée${
          nextRows.length > 1 ? "s" : ""
        } chargée${nextRows.length > 1 ? "s" : ""} depuis le fichier actif.`
      );
    }

    run();

    return () => {
      cancelled = true;
    };
  }, []);

  const sourceRows = useMemo(() => {
    return getDirectionRows(parsedSource, direction);
  }, [parsedSource, direction]);

  const horaireSourceRows = useMemo(() => {
    return getDirectionRows(parsedSource, horaireDirection);
  }, [parsedSource, horaireDirection]);

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
      return horaireSourceRows.map((row) => ({
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

    return horaireSourceRows.map((row) => {
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
        const diffMinutes = rawDiff >= 0 ? rawDiff : rawDiff + 24 * 60;

        const comMinutes =
          nextCom?.trim() && /^[1-9]\d*$/.test(nextCom.trim())
            ? Number(nextCom.trim())
            : 0;
        const tecnMinutes =
          nextTecn?.trim() && /^[1-9]\d*$/.test(nextTecn.trim())
            ? Number(nextTecn.trim())
            : 0;

        const netDiff = diffMinutes - comMinutes - tecnMinutes;
        if (netDiff >= 0) {
          computedConc = String(netDiff);
        }
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
  }, [selectedVariant, horaireSourceRows]);

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

  const horaireTrainOptions = useMemo(() => {
    return availableTrainNumbers.map((trainNumber) => {
      const isUnpublished = unpublishedTrainNumbers.has(trainNumber);
      const trainData = parsedSource.trains?.[trainNumber];
      const primaryVariant = getVariantAtIndex(trainData, 0);
      const displayedNumeroFrance =
        primaryVariant != null
          ? getSuggestedNumeroFranceForPublish(parsedSource, trainNumber, primaryVariant)
          : "";
      const label =
        displayedNumeroFrance !== ""
          ? `${trainNumber} / ${displayedNumeroFrance}`
          : trainNumber;
      return { trainNumber, label, isUnpublished };
    });
  }, [availableTrainNumbers, parsedSource, unpublishedTrainNumbers]);

  const horaireLocationOptions = useMemo(() => {
    const values = horaireSourceRows
      .map((row) => row.visible.dependencia.trim())
      .filter((value) => value !== "");

    return Array.from(new Set(values));
  }, [horaireSourceRows]);

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
  const selectedNumeroEspagneDisplay =
    selectedTrainNumber.trim() !== "" ? selectedTrainNumber.trim() : "—";

  const isSelectedTrainTransfrontalier = displayedHoraireRows.some(
    (row) => row.visible.dependencia.trim() === "LIMITE ADIF - LFPSA"
  );

  const selectedLigneStored = selectedVariant?.meta.ligne?.trim() ?? "";
  const selectedLigneDisplay =
    selectedLigneStored !== ""
      ? selectedLigneStored
      : getDefaultLigneValue(
          selectedVariant?.meta.origine ?? "",
          selectedVariant?.meta.destination ?? ""
        );

  const selectedNumeroFranceStored =
    selectedVariant?.meta.numeroFrance?.trim() ?? "";

  let selectedNumeroFranceSuggested = "";

  if (
    selectedTrainNumber.trim() !== "" &&
    isSelectedTrainTransfrontalier
  ) {
    const digits = selectedTrainNumber.replace(/\D/g, "").trim();

    if (/^\d+$/.test(digits)) {
      const parsed = Number(digits);

      if (Number.isFinite(parsed)) {
        selectedNumeroFranceSuggested = String(
          parsed % 2 === 0 ? parsed + 1 : parsed - 1
        );
      }
    }
  }

  const selectedNumeroFranceDisplay =
    selectedNumeroFranceStored !== ""
      ? selectedNumeroFranceStored
      : selectedNumeroFranceSuggested !== ""
        ? selectedNumeroFranceSuggested
        : "—";

  const selectedCategorieEspagneStored =
    selectedVariant?.meta.categorieEspagne?.trim() ?? "";
  const selectedCategorieFranceStored =
    selectedVariant?.meta.categorieFrance?.trim() ?? "";
  const selectedMaterielStored =
    typeof selectedVariant?.meta.materiel === "string"
      ? selectedVariant.meta.materiel
      : "";

  const selectedCategorieEspagneDisplay =
    selectedCategorieEspagneStored !== "" ? selectedCategorieEspagneStored : "—";
  const selectedCategorieFranceDisplay =
    selectedCategorieFranceStored !== "" ? selectedCategorieFranceStored : "—";
  const selectedMaterielDisplay =
    selectedMaterielStored.trim() !== "" ? selectedMaterielStored.trim() : "—";

  const pendingLtvDeleteRow = useMemo(() => {
    if (pendingLtvDeleteRowId == null) {
      return null;
    }

    return (
      ltvNormalizedRows.find((row) => row.id === pendingLtvDeleteRowId) ?? null
    );
  }, [ltvNormalizedRows, pendingLtvDeleteRowId]);

  const importedLtvCodeSet = useMemo(() => {
    return new Set(
      ltvNormalizedRows.map((row) => normalizeLtvCode(row.code))
    );
  }, [ltvNormalizedRows]);

  const ltvFusedRows = useMemo(
    () => enrichLtvRowsFromVatard(ltvAdifRows, ltvVatardEntries),
    [ltvAdifRows, ltvVatardEntries]
  );

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
                  ligne: getDefaultLigneValue(
                    trimmedOrigin,
                    trimmedDestination
                  ),
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

  const handleHoraireOriginChange = useCallback((nextValue: string) => {
    setSelectedOrigin(nextValue);
    if (selectedTrainNumber.trim() !== "") {
      setHoraireSelectionsByTrain((previous) => {
        const previousSelection = previous[selectedTrainNumber];
        const variant = getVariantAtIndex(
          parsedSource.trains?.[selectedTrainNumber],
          selectedVariantIndex
        );
        const trainMeta = variant?.meta;
        return {
          ...previous,
          [selectedTrainNumber]: {
            selectedOrigin: nextValue,
            selectedDestination:
              previousSelection?.selectedDestination ??
              trainMeta?.destination ??
              selectedDestination,
            validatedOrigin:
              previousSelection?.validatedOrigin ?? trainMeta?.origine ?? "",
            validatedDestination:
              previousSelection?.validatedDestination ??
              trainMeta?.destination ??
              "",
          },
        };
      });
    }
  }, [selectedTrainNumber, selectedVariantIndex, parsedSource, selectedDestination]);

  const handleHoraireDestinationChange = useCallback((nextValue: string) => {
    setSelectedDestination(nextValue);
    if (selectedTrainNumber.trim() !== "") {
      setHoraireSelectionsByTrain((previous) => {
        const previousSelection = previous[selectedTrainNumber];
        const variant = getVariantAtIndex(
          parsedSource.trains?.[selectedTrainNumber],
          selectedVariantIndex
        );
        const trainMeta = variant?.meta;
        return {
          ...previous,
          [selectedTrainNumber]: {
            selectedOrigin:
              previousSelection?.selectedOrigin ??
              trainMeta?.origine ??
              selectedOrigin,
            selectedDestination: nextValue,
            validatedOrigin:
              previousSelection?.validatedOrigin ?? trainMeta?.origine ?? "",
            validatedDestination:
              previousSelection?.validatedDestination ??
              trainMeta?.destination ??
              "",
          },
        };
      });
    }
  }, [selectedTrainNumber, selectedVariantIndex, parsedSource, selectedOrigin]);

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
    if (availableTrainNumbers.length > 0 && exportTrainNumber === "") {
      setExportTrainNumber(availableTrainNumbers[0]);
    }
  }, [availableTrainNumbers, exportTrainNumber]);

  // Quand on bascule sur l'onglet Export, synchroniser automatiquement
  // le train sélectionné dans l'onglet Horaire
  useEffect(() => {
    if (
      activeTab === "EXPORT" &&
      selectedTrainNumber !== "" &&
      availableTrainNumbers.includes(selectedTrainNumber)
    ) {
      setExportTrainNumber(selectedTrainNumber);
    }
  }, [activeTab, selectedTrainNumber, availableTrainNumbers]);

  useEffect(() => {
    setExportVariantOverrideIndex(null);
  }, [exportDate, exportTrainNumber]);

  useEffect(() => {
    const comp = exportVariant?.meta.composition?.trim();
    if (comp) setExportComposition(comp);
  }, [exportVariant]);

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
    setIsLigneEditing(false);
    setIsNumeroFranceEditing(false);
    setIsCategorieEspagneEditing(false);
    setIsCategorieFranceEditing(false);
    setIsMaterielEditing(false);
    setIsCompositionEditing(false);
    setNumeroFranceWarning(null);
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

  const handleExportCompositionToggle = useCallback(() => {
    setExportComposition((prev) => (prev === "US" ? "UM" : "US"));
  }, []);

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
  const updateSelectedTrainMeta = useCallback(
    (
      updater: (
        currentMeta: FtSourceTrainVariantData["meta"]
      ) => FtSourceTrainVariantData["meta"]
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

        const currentVariant = getVariantAtIndex(
          previousTrain,
          selectedVariantIndex
        );

        if (!currentVariant) {
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
                ...currentVariant,
                meta: updater(currentVariant.meta),
              }
            ),
          },
        };
      });
    },
    [selectedTrainNumber, selectedVariantIndex]
  );

  const updateSelectedTrainMetaForAllVariants = useCallback(
    (
      updater: (
        currentMeta: FtSourceTrainVariantData["meta"]
      ) => FtSourceTrainVariantData["meta"]
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

        const variantCount = getVariantCount(previousTrain);
        const nextVariants: FtSourceTrainVariantData[] = [];

        for (let index = 0; index < variantCount; index += 1) {
          const currentVariant = getVariantAtIndex(previousTrain, index);

          if (!currentVariant) {
            return previous;
          }

          nextVariants.push({
            ...currentVariant,
            meta: updater(currentVariant.meta),
          });
        }

        return {
          ...previous,
          trains: {
            ...previousTrains,
            [selectedTrainNumber]: {
              ...previousTrain,
              variants: nextVariants,
            },
          },
        };
      });
    },
    [selectedTrainNumber]
  );

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
  const handleApplyNumeroEspagne = useCallback(
    (nextValue: string) => {
      const trimmedValue = nextValue.trim();

      updateSelectedTrainMeta((currentMeta) => ({
        ...currentMeta,
        numeroEspagne: trimmedValue,
      }));
    },
    [updateSelectedTrainMeta]
  );
  const handleApplyLigne = useCallback(
    (nextValue: string) => {
      updateSelectedTrainMeta((currentMeta) => ({
        ...currentMeta,
        ligne: nextValue,
      }));
    },
    [updateSelectedTrainMeta]
  );

  const handleCommitLigneEdit = useCallback(() => {
    const committedValue = selectedVariant?.meta.ligne?.trim() ?? "";

    updateSelectedTrainMeta((currentMeta) => ({
      ...currentMeta,
      ligne: committedValue,
    }));

    setIsLigneEditing(false);
  }, [selectedVariant, updateSelectedTrainMeta]);

  const handleApplyNumeroFrance = useCallback(
    (nextValue: string) => {
      const trimmedValue = nextValue.trim();

      updateSelectedTrainMeta((currentMeta) => ({
        ...currentMeta,
        numeroFrance: trimmedValue,
      }));
    },
    [updateSelectedTrainMeta]
  );
  const handleApplyCategorieEspagne = useCallback(
    (nextValue: string) => {
      const normalizedValue = nextValue.toUpperCase();

      updateSelectedTrainMeta((currentMeta) => ({
        ...currentMeta,
        categorieEspagne: normalizedValue,
      }));
    },
    [updateSelectedTrainMeta]
  );

  const handleCommitCategorieEspagneEdit = useCallback(() => {
    const committedValue =
      selectedVariant?.meta.categorieEspagne?.trim().toUpperCase() ?? "";

    updateSelectedTrainMeta((currentMeta) => ({
      ...currentMeta,
      categorieEspagne: committedValue,
    }));

    setIsCategorieEspagneEditing(false);
  }, [selectedVariant, updateSelectedTrainMeta]);

  const handleApplyCategorieFrance = useCallback(
    (nextValue: string) => {
      const normalizedValue = nextValue.toUpperCase();

      updateSelectedTrainMeta((currentMeta) => ({
        ...currentMeta,
        categorieFrance: normalizedValue,
      }));
    },
    [updateSelectedTrainMeta]
  );

  const handleCommitCategorieFranceEdit = useCallback(() => {
    const committedValue =
      selectedVariant?.meta.categorieFrance?.trim().toUpperCase() ?? "";

    updateSelectedTrainMeta((currentMeta) => ({
      ...currentMeta,
      categorieFrance: committedValue,
    }));

    setIsCategorieFranceEditing(false);
  }, [selectedVariant, updateSelectedTrainMeta]);

  const handleApplyMateriel = useCallback(
    (nextValue: string) => {
      const normalizedValue = nextValue.toUpperCase();

      updateSelectedTrainMetaForAllVariants((currentMeta) => ({
        ...currentMeta,
        materiel: normalizedValue,
      }));
    },
    [updateSelectedTrainMetaForAllVariants]
  );

  const handleCommitMaterielEdit = useCallback(() => {
    const committedValue =
      selectedVariant?.meta.materiel?.trim().toUpperCase() ?? "";

    updateSelectedTrainMetaForAllVariants((currentMeta) => ({
      ...currentMeta,
      materiel: committedValue,
    }));

    setIsMaterielEditing(false);
  }, [selectedVariant, updateSelectedTrainMetaForAllVariants]);

  const handleApplyComposition = useCallback(
    (nextValue: string) => {
      const trimmedValue = nextValue.trim();

      updateSelectedTrainMeta((currentMeta) => ({
        ...currentMeta,
        composition: trimmedValue,
      }));
    },
    [updateSelectedTrainMeta]
  );

  const handleCommitNumeroFranceEdit = useCallback(() => {
    const committedValue = selectedVariant?.meta.numeroFrance?.trim() ?? "";

    if (committedValue === "") {
      setNumeroFranceWarning(null);
      setIsNumeroFranceEditing(false);
      return;
    }

    for (const [otherTrainNumber, otherTrainData] of Object.entries(
      parsedSource.trains ?? {}
    )) {
      if (otherTrainNumber === selectedTrainNumber) {
        continue;
      }

      if (otherTrainNumber.trim() === committedValue) {
        setNumeroFranceWarning(
          `Attention : ce numéro correspond déjà au numéro Espagne du train ${otherTrainNumber}.`
        );
        setIsNumeroFranceEditing(false);
        return;
      }

      const variantCount = getVariantCount(otherTrainData);

      for (let variantIndex = 0; variantIndex < variantCount; variantIndex += 1) {
        const otherVariant = getVariantAtIndex(otherTrainData, variantIndex);
        const otherNumeroFrance = otherVariant?.meta.numeroFrance?.trim() ?? "";

        if (otherNumeroFrance !== "" && otherNumeroFrance === committedValue) {
          setNumeroFranceWarning(
            `Attention : ce numéro correspond déjà au numéro France du train ${otherTrainNumber}.`
          );
          setIsNumeroFranceEditing(false);
          return;
        }
      }
    }

    setNumeroFranceWarning(null);
    setIsNumeroFranceEditing(false);
  }, [parsedSource.trains, selectedTrainNumber, selectedVariant]);
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

  const handleUpdateLtvTextField = useCallback(
    (rowId: string, field: LtvEditorTextField, nextValue: string) => {
      const formattedValue = formatLtvTextInput(field, nextValue);

      // Index fusionné pour comparaison (construit une seule fois par appel)
      const fusedByCode = new Map(
        ltvFusedRows.map((r) => [normalizeLtvCode(r.code), r])
      );

      setLtvNormalizedRows((previous) =>
        previous.map((row) => {
          if (row.id !== rowId) return row;

          const base = {
            ...row,
            [field]: formattedValue,
            status: row.status === "added" ? "added" : "modified",
          } as typeof row;

          if (row.origin !== "adif") return base;

          // Comparer avec la valeur du fusionné — retire editedFields si identique
          const fusedRow = fusedByCode.get(normalizeLtvCode(row.code));
          const fusedValue = fusedRow ? ((fusedRow[field] as string) ?? "") : "";
          const valuesMatch =
            normalizeLtvFieldForComparison(formattedValue, field) ===
            normalizeLtvFieldForComparison(fusedValue, field);

          const nextEditedFields = { ...(row.editedFields ?? {}) };
          if (valuesMatch) {
            delete nextEditedFields[field];
          } else {
            nextEditedFields[field] = true;
          }

          return {
            ...base,
            editedFields:
              Object.keys(nextEditedFields).length > 0
                ? nextEditedFields
                : undefined,
          };
        })
      );
    },
    [ltvFusedRows]
  );

  const handleNormalizeLtvCodeField = useCallback((rowId: string) => {
    setLtvNormalizedRows((previous) =>
      previous.map((row) => {
        if (row.id !== rowId) {
          return row;
        }

        const normalizedCode = normalizeLtvCode(row.code);

        if (normalizedCode === row.code) {
          return row;
        }

        return {
          ...row,
          code: normalizedCode,
          status: row.status === "added" ? "added" : "modified",
          editedFields:
            row.origin === "adif"
              ? {
                  ...row.editedFields,
                  code: true,
                }
              : row.editedFields,
        };
      })
    );
  }, []);

  const handleNormalizeLtvKmField = useCallback(
    (rowId: string, field: "kmIni" | "kmFin") => {
      setLtvNormalizedRows((previous) =>
        previous.map((row) => {
          if (row.id !== rowId) return row;

          const normalized = normalizeLtvKm(row[field]);

          if (normalized === row[field]) return row;

          return {
            ...row,
            [field]: normalized,
            status: row.status === "added" ? "added" : "modified",
            editedFields:
              row.origin === "adif"
                ? { ...row.editedFields, [field]: true }
                : row.editedFields,
          };
        })
      );
    },
    []
  );

  const handleToggleLtvFlagField = useCallback(
    (rowId: string, field: LtvEditorFlagField) => {
      setLtvNormalizedRows((previous) =>
        previous.map((row) =>
          row.id === rowId
            ? {
                ...row,
                [field]: !row[field],
                status: row.status === "added" ? "added" : "modified",
                editedFields:
                  row.origin === "adif"
                    ? {
                        ...row.editedFields,
                        [field]: true,
                      }
                    : row.editedFields,
              }
            : row
        )
      );
    },
    []
  );

  const handleAddLtvNormalizedRow = useCallback(() => {
    setLtvNormalizedRows((previous) => {
      const nextId = buildNextLtvManualId(previous);
      return [...previous, buildEmptyLtvEditorRow(nextId)];
    });
  }, []);

  const handleRequestDeleteLtvNormalizedRow = useCallback((rowId: string) => {
    setPendingLtvDeleteRowId(rowId);
  }, []);

  const handleCancelDeleteLtvNormalizedRow = useCallback(() => {
    setPendingLtvDeleteRowId(null);
  }, []);

  const handleConfirmDeleteLtvNormalizedRow = useCallback(() => {
    if (pendingLtvDeleteRowId == null) {
      return;
    }

    setLtvNormalizedRows((previous) =>
      previous.filter((row) => row.id !== pendingLtvDeleteRowId)
    );
    setPendingLtvDeleteRowId(null);
  }, [pendingLtvDeleteRowId]);

  const handleStartLtvRowDrag = useCallback((rowId: string) => {
    setDraggedLtvRowId(rowId);
    setDragOverLtvRowId(null);
  }, []);

  const handleEnterLtvRowDrag = useCallback(
    (rowId: string) => {
      if (draggedLtvRowId == null || draggedLtvRowId === rowId) {
        return;
      }

      setDragOverLtvRowId(rowId);
    },
    [draggedLtvRowId]
  );

  const handleDropLtvRow = useCallback(
    (targetRowId: string) => {
      if (draggedLtvRowId == null) {
        return;
      }

      setLtvNormalizedRows((previous) =>
        moveLtvEditorRow(previous, draggedLtvRowId, targetRowId)
      );
      setDraggedLtvRowId(null);
      setDragOverLtvRowId(null);
    },
    [draggedLtvRowId]
  );

  const handleCancelLtvRowDrag = useCallback(() => {
    setDraggedLtvRowId(null);
    setDragOverLtvRowId(null);
  }, []);

  const handleImportLtvAdifRow = useCallback((row: LtvEditorRow) => {
    setLtvNormalizedRows((previous) => {
      if (previous.some((existingRow) => existingRow.id === row.id)) {
        return previous;
      }

      return [
        ...previous,
        {
          ...row,
          code: normalizeLtvCode(row.code),
          origin: "adif",
          status: "added",
        },
      ];
    });
  }, []);

  const buildCurrentLtvNormalizedPayload = useCallback(() => {
    const payload = buildLtvNormalizedFile(ltvNormalizedRows, ltvAdifMeta);

    if (ltvAdifRows.length > 0 && payload.rows.length < ltvAdifRows.length) {
      return {
        ...payload,
        warnings: [
          ...payload.warnings,
          `Le tableau normalisé contient ${payload.rows.length} LTV, alors que le tableau ADIF Barcelona/Figueras en contient ${ltvAdifRows.length}.`,
        ],
      };
    }

    return payload;
  }, [ltvAdifMeta, ltvAdifRows.length, ltvNormalizedRows]);

  const handlePublishLtvNormalizedJson = useCallback(async () => {
    if (isPublishing) {
      return;
    }

    const payload = buildCurrentLtvNormalizedPayload();
    const warningText =
      payload.warnings.length > 0
        ? `\n\nAlertes non bloquantes :\n- ${payload.warnings.join("\n- ")}`
        : "";

    const confirmed = window.confirm(
      `Publier le fichier LTV normalisé ?\n\n${payload.rows.length} LTV seront publiées dans LIM Editor et dans LIM2.${warningText}\n\nLa mise à jour peut nécessiter quelques minutes avant d’être visible sur les versions en ligne.`
    );

    if (!confirmed) {
      return;
    }

    setIsPublishing(true);
    setExportStatus("idle");
    setExportMessage("Publication LTV en cours...");
    setExportDiagnostics([]);

    try {
      const response = await publishLtvNormalizedData(payload);

      setLtvNormalizedRows(payload.rows);
      setExportStatus("success");
      setExportMessage(
        `Publication LTV réussie : ${response.diagnostic.rowCount} LTV publiée${
          response.diagnostic.rowCount > 1 ? "s" : ""
        } dans LIM Editor et LIM2.`
      );
      setExportDiagnostics([
        `Fichier JSON LTV publié dans LIM Editor : ${response.diagnostic.publishedJsonPath}`,
        `Fichier JSON LTV publié dans LIM2 : ${response.diagnostic.publishedLim2JsonPath}`,
        `Date de publication : ${response.diagnostic.publishedAt}`,
        response.diagnostic.warnings.length > 0
          ? `Alertes non bloquantes : ${response.diagnostic.warnings.join(" | ")}`
          : "Aucune alerte non bloquante.",
      ]);
    } catch (error) {
      setExportStatus("error");
      setExportMessage(
        error instanceof Error
          ? `Publication LTV échouée : ${error.message}`
          : "Publication LTV échouée : erreur inconnue."
      );
      setExportDiagnostics([
        "Le fichier LTV normalisé en service n’a pas été remplacé tant que la publication n’a pas abouti.",
      ]);
    } finally {
      setIsPublishing(false);
    }
  }, [buildCurrentLtvNormalizedPayload, isPublishing]);

  const handleDownloadLtvNormalizedJson = useCallback(() => {
    const payload = buildCurrentLtvNormalizedPayload();

    downloadTextFile(
      "ltv.normalized.json",
      JSON.stringify(payload, null, 2),
      "application/json;charset=utf-8"
    );
  }, [buildCurrentLtvNormalizedPayload]);

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
              Entrez ici le numéro du train en Espagne
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

      {pendingLtvDeleteRow ? (
        <div
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              handleCancelDeleteLtvNormalizedRow();
            }
          }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(17, 24, 39, 0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1500,
            padding: 24,
          }}
        >
          <div
            onMouseDown={(event) => {
              event.stopPropagation();
            }}
            style={{
              width: "100%",
              maxWidth: 520,
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
              Supprimer une LTV
            </div>

            <div
              style={{
                color: "#111827",
                lineHeight: 1.5,
                marginBottom: 16,
              }}
            >
              Voulez-vous supprimer cette LTV normalisée ?
            </div>

            <div
              style={{
                padding: 12,
                borderRadius: 12,
                border: "1px solid #e5e7eb",
                background: "#f9fafb",
                color: "#374151",
                marginBottom: 20,
                lineHeight: 1.5,
              }}
            >
              <div>
                <strong>CÓDIGO LTV :</strong>{" "}
                {pendingLtvDeleteRow.code.trim() !== ""
                  ? pendingLtvDeleteRow.code
                  : "—"}
              </div>
              <div>
                <strong>Trayecto / Estación :</strong>{" "}
                {pendingLtvDeleteRow.section.trim() !== ""
                  ? pendingLtvDeleteRow.section
                  : "—"}
              </div>
              <div>
                <strong>Km :</strong>{" "}
                {pendingLtvDeleteRow.kmIni.trim() !== ""
                  ? pendingLtvDeleteRow.kmIni
                  : "—"}{" "}
                →{" "}
                {pendingLtvDeleteRow.kmFin.trim() !== ""
                  ? pendingLtvDeleteRow.kmFin
                  : "—"}
              </div>
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
                onClick={handleCancelDeleteLtvNormalizedRow}
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
                onClick={handleConfirmDeleteLtvNormalizedRow}
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
              fontSize: 20,
              fontWeight: 800,
              color: "#111827",
              letterSpacing: "-0.01em",
            }}
          >
            LIM Editor
          </div>
        }
        tableArea={
          <>
            <div
              style={{
                display: "flex",
                gap: 4,
                alignItems: "flex-end",
                borderBottom: "1px solid #d1d5db",
                marginBottom: 16,
                background: "#ffffff",
                padding: "8px 8px 0",
                borderRadius: "12px 12px 0 0",
              }}
            >
              {[
                { id: "FT" as const, label: "Données ligne" },
                { id: "HORAIRE" as const, label: "Données horaires" },
                { id: "LTV" as const, label: "LTV" },
                { id: "EXPORT" as const, label: "Export LIM PDF" },
              ].map((tab) => {
                const isActive = activeTab === tab.id;

                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    style={{
                      padding: "8px 16px",
                      borderRadius: "8px 8px 0 0",
                      border: "1px solid #d1d5db",
                      borderBottom: isActive
                        ? "1px solid #ffffff"
                        : "1px solid #d1d5db",
                      background: isActive ? "#ffffff" : "#f3f4f6",
                      color: isActive ? "#111827" : "#6b7280",
                      fontWeight: isActive ? 700 : 500,
                      cursor: "pointer",
                      position: "relative",
                      zIndex: isActive ? 1 : 0,
                      marginBottom: isActive ? "-1px" : 0,
                      fontSize: 14,
                    }}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {activeTab === "FT" ? (
              <FTTab
                direction={direction}
                onDirectionChange={setDirection}
                directionLabel={directionLabel}
                sourceStatus={sourceStatus}
                remoteInfo={remoteInfo}
                inspectionLines={inspectionLines}
                sourceTableLabel={sourceTableLabel}
                sourceRows={sourceRows}
                firstRowPreview={firstRowPreview}
                lastRowPreview={lastRowPreview}
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
                hasUnpublishedChanges={hasUnpublishedChanges}
                exportMessage={exportMessage}
                exportStatus={exportStatus}
                exportDiagnostics={exportDiagnostics}
              />
            ) : activeTab === "HORAIRE" ? (
              <HoraireTab
                selectedTrainNumber={selectedTrainNumber}
                onSelectedTrainNumberChange={setSelectedTrainNumber}
                trainOptions={horaireTrainOptions}
                isSelectedTrainUnpublished={isSelectedTrainUnpublished}
                selectedOrigin={selectedOrigin}
                onOriginChange={handleHoraireOriginChange}
                selectedDestination={selectedDestination}
                onDestinationChange={handleHoraireDestinationChange}
                horaireLocationOptions={horaireLocationOptions}
                onValidate={handleValidateHoraireSelection}
                onCreateTrain={handleCreateTrain}
                onOpenDeleteTrainConfirm={handleOpenDeleteTrainConfirm}
                horaireValidationError={horaireValidationError}
                horaireDirection={horaireDirection}
                sourceStatus={sourceStatus}
                remoteInfo={remoteInfo}
                inspectionLines={inspectionLines}
                sourceTableLabel={sourceTableLabel}
                displayedHoraireRows={displayedHoraireRows}
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
            ) : activeTab === "EXPORT" ? (
              <ExportTab
                exportTrainNumber={exportTrainNumber}
                onExportTrainNumberChange={setExportTrainNumber}
                availableTrainNumbers={availableTrainNumbers}
                exportComposition={exportComposition}
                onExportCompositionToggle={handleExportCompositionToggle}
                exportDate={exportDate}
                onExportDateChange={setExportDate}
                todayIso={todayIso}
                tomorrowIso={tomorrowIso}
                exportAllVariantInfos={exportAllVariantInfos}
                exportAutoVariantIndex={exportAutoVariantIndex}
                exportVariantIndex={exportVariantIndex}
                onExportVariantOverrideIndexChange={setExportVariantOverrideIndex}
                exportVariant={exportVariant}
                exportDateFormatted={exportDateFormatted}
                exportLongueur={exportLongueur}
                exportMasse={exportMasse}
                exportLtvRowsFiltered={exportLtvRowsFiltered}
                exportFtRowsFinal={exportFtRowsFinal}
              />
            ) : (
              <LTVTab
                ltvNormalizedStatus={ltvNormalizedStatus}
                ltvNormalizedMessage={ltvNormalizedMessage}
                ltvNormalizedFileInfo={ltvNormalizedFileInfo}
                ltvNormalizedRows={ltvNormalizedRows}
                draggedLtvRowId={draggedLtvRowId}
                dragOverLtvRowId={dragOverLtvRowId}
                importedLtvCodeSet={importedLtvCodeSet}
                ltvAdifRows={ltvAdifRows}
                ltvAdifStatus={ltvAdifStatus}
                ltvAdifMessage={ltvAdifMessage}
                ltvAdifOtherRows={ltvAdifOtherRows}
                ltvFusedRows={ltvFusedRows}
                ltvVatardStatus={ltvVatardStatus}
                ltvVatardMessage={ltvVatardMessage}
                onAddLtvNormalizedRow={handleAddLtvNormalizedRow}
                onRequestDeleteLtvNormalizedRow={handleRequestDeleteLtvNormalizedRow}
                onStartLtvRowDrag={handleStartLtvRowDrag}
                onEnterLtvRowDrag={handleEnterLtvRowDrag}
                onDropLtvRow={handleDropLtvRow}
                onCancelLtvRowDrag={handleCancelLtvRowDrag}
                onUpdateLtvTextField={handleUpdateLtvTextField}
                onNormalizeLtvCodeField={handleNormalizeLtvCodeField}
                onNormalizeLtvKmField={handleNormalizeLtvKmField}
                onToggleLtvFlagField={handleToggleLtvFlagField}
                onImportLtvAdifRow={handleImportLtvAdifRow}
              />
            )}
          </>
        }
        detailsPanel={
          activeTab === "FT" ? (
            <>
              <div
                style={{
                  padding: 20,
                  border: "1px solid #d1d5db",
                  borderRadius: 16,
                  background: "#ffffff",
                  marginBottom: 12,
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                <PublishVersionButton
                  disabled={!hasUnpublishedChanges}
                  isBusy={isPublishing}
                  onClick={handlePublishClick}
                />
                <button
                  type="button"
                  onClick={handleDownloadNormalizedFile}
                  disabled={sourceRows.length === 0}
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    borderRadius: 10,
                    border: "1px solid #d1d5db",
                    background: "#ffffff",
                    color: "#111827",
                    fontWeight: 700,
                    cursor: sourceRows.length === 0 ? "not-allowed" : "pointer",
                    opacity: sourceRows.length === 0 ? 0.5 : 1,
                  }}
                  title="Télécharger le fichier ligneFT.normalized.ts généré depuis l'état actuel de l'éditeur"
                >
                  Télécharger le normalisé
                </button>
              </div>
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
            </>
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
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  marginBottom: 20,
                }}
              >
                <PublishVersionButton
                  disabled={!hasUnpublishedChanges}
                  isBusy={isPublishing}
                  onClick={handlePublishClick}
                />
                <button
                  type="button"
                  onClick={handleDownloadNormalizedFile}
                  disabled={sourceRows.length === 0}
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    borderRadius: 10,
                    border: "1px solid #d1d5db",
                    background: "#ffffff",
                    color: "#111827",
                    fontWeight: 700,
                    cursor: sourceRows.length === 0 ? "not-allowed" : "pointer",
                    opacity: sourceRows.length === 0 ? 0.5 : 1,
                  }}
                  title="Télécharger le fichier ligneFT.normalized.ts généré depuis l'état actuel de l'éditeur"
                >
                  Télécharger le normalisé
                </button>
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  marginBottom: 20,
                }}
              >
                <div style={{ fontSize: 18, fontWeight: 700 }}>
                  Métadonnées train
                </div>

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                    color: "#111827",
                  }}
                >
                  <div>
                    <span style={{ fontWeight: 700 }}>Numéro Espagne :</span>{" "}
                    <span>{selectedNumeroEspagneDisplay}</span>
                  </div>

                  <div>
                    <span style={{ fontWeight: 700 }}>Ligne :</span>{" "}
                    {isLigneEditing ? (
                      <input
                        type="text"
                        autoFocus
                        value={selectedLigneStored}
                        onChange={(event) =>
                          handleApplyLigne(event.target.value)
                        }
                        onBlur={handleCommitLigneEdit}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            handleCommitLigneEdit();
                          }
                        }}
                        style={{
                          padding: "2px 6px",
                          borderRadius: 6,
                          border: "1px solid #d1d5db",
                          background: "#ffffff",
                          color: "#111827",
                          font: "inherit",
                          minWidth: 80,
                        }}
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setIsLigneEditing(true)}
                        style={{
                          padding: 0,
                          border: "none",
                          background: "transparent",
                          color: "#111827",
                          font: "inherit",
                          cursor: "pointer",
                          textDecoration: "underline",
                          textUnderlineOffset: "2px",
                        }}
                      >
                        {selectedLigneDisplay}
                      </button>
                    )}
                  </div>

                  <div>
                    <span style={{ fontWeight: 700 }}>Numéro France :</span>{" "}
                    {isNumeroFranceEditing ? (
                      <input
                        type="text"
                        autoFocus
                        value={
                          selectedNumeroFranceStored !== ""
                            ? selectedNumeroFranceStored
                            : selectedNumeroFranceSuggested
                        }
                        onChange={(event) =>
                          handleApplyNumeroFrance(event.target.value)
                        }
                        onBlur={handleCommitNumeroFranceEdit}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            handleCommitNumeroFranceEdit();
                          }
                        }}
                        style={{
                          padding: "2px 6px",
                          borderRadius: 6,
                          border: "1px solid #d1d5db",
                          background: "#ffffff",
                          color: "#111827",
                          font: "inherit",
                          minWidth: 80,
                        }}
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setIsNumeroFranceEditing(true)}
                        style={{
                          padding: 0,
                          border: "none",
                          background: "transparent",
                          color: "#111827",
                          font: "inherit",
                          cursor: "pointer",
                          textDecoration: "underline",
                          textUnderlineOffset: "2px",
                        }}
                      >
                        {selectedNumeroFranceDisplay}
                      </button>
                    )}
                  </div>

                  <div>
                    <span style={{ fontWeight: 700 }}>Type Espagne :</span>{" "}
                    {isCategorieEspagneEditing ? (
                      <input
                        type="text"
                        autoFocus
                        value={selectedCategorieEspagneStored}
                        onChange={(event) =>
                          handleApplyCategorieEspagne(event.target.value)
                        }
                        onBlur={handleCommitCategorieEspagneEdit}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            handleCommitCategorieEspagneEdit();
                          }
                        }}
                        style={{
                          padding: "2px 6px",
                          borderRadius: 6,
                          border: "1px solid #d1d5db",
                          background: "#ffffff",
                          color: "#111827",
                          font: "inherit",
                          minWidth: 80,
                        }}
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setIsCategorieEspagneEditing(true)}
                        style={{
                          padding: 0,
                          border: "none",
                          background: "transparent",
                          color: "#111827",
                          font: "inherit",
                          cursor: "pointer",
                          textDecoration: "underline",
                          textUnderlineOffset: "2px",
                        }}
                      >
                        {selectedCategorieEspagneDisplay}
                      </button>
                    )}
                  </div>

                  <div>
                    <span style={{ fontWeight: 700 }}>Type France :</span>{" "}
                    {isCategorieFranceEditing ? (
                      <input
                        type="text"
                        value={selectedCategorieFranceStored}
                        onChange={(event) =>
                          handleApplyCategorieFrance(event.target.value)
                        }
                        onBlur={handleCommitCategorieFranceEdit}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            handleCommitCategorieFranceEdit();
                          }
                        }}
                        style={{
                          padding: "2px 6px",
                          borderRadius: 6,
                          border: "1px solid #d1d5db",
                          background: "#ffffff",
                          color: "#111827",
                          font: "inherit",
                          minWidth: 80,
                        }}
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setIsCategorieFranceEditing(true)}
                        style={{
                          padding: 0,
                          border: "none",
                          background: "transparent",
                          color: "#111827",
                          font: "inherit",
                          cursor: "pointer",
                          textDecoration: "underline",
                          textUnderlineOffset: "2px",
                        }}
                      >
                        {selectedCategorieFranceDisplay}
                      </button>
                    )}
                  </div>

                  <div>
                    <span style={{ fontWeight: 700 }}>Matériel :</span>{" "}
                    {isMaterielEditing ? (
                      <input
                        type="text"
                        value={selectedMaterielStored}
                        onChange={(event) =>
                          handleApplyMateriel(event.target.value)
                        }
                        onBlur={handleCommitMaterielEdit}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            handleCommitMaterielEdit();
                          }
                        }}
                        style={{
                          padding: "2px 6px",
                          borderRadius: 6,
                          border: "1px solid #d1d5db",
                          background: "#ffffff",
                          color: "#111827",
                          font: "inherit",
                          minWidth: 80,
                        }}
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setIsMaterielEditing(true)}
                        style={{
                          padding: 0,
                          border: "none",
                          background: "transparent",
                          color: "#111827",
                          font: "inherit",
                          cursor: "pointer",
                          textDecoration: "underline",
                          textUnderlineOffset: "2px",
                        }}
                      >
                        {selectedMaterielDisplay}
                      </button>
                    )}
                  </div>
                </div>

                {numeroFranceWarning ? (
                  <div
                    style={{
                      padding: "8px 10px",
                      borderRadius: 10,
                      border: "1px solid #fed7aa",
                      background: "#fff7ed",
                      color: "#9a3412",
                      fontSize: 13,
                      fontWeight: 500,
                    }}
                  >
                    {numeroFranceWarning}
                  </div>
                ) : null}
              </div>

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
                    const compositionStored = variant?.meta.composition?.trim() ?? "";
                    const compositionDisplay =
                      compositionStored === "" ? "US" : compositionStored;

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

                            {selectedVariantIndex === index ? (
                              <div
                                style={{
                                  display: "flex",
                                  gap: 8,
                                  flexWrap: "wrap",
                                  marginTop: 4,
                                }}
                              >
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handleApplyComposition("US");
                                  }}
                                  style={{
                                    minWidth: 44,
                                    padding: "6px 10px",
                                    borderRadius: 999,
                                    border:
                                      compositionDisplay === "US"
                                        ? "1px solid #2563eb"
                                        : "1px solid #d1d5db",
                                    background:
                                      compositionDisplay === "US"
                                        ? "#dbeafe"
                                        : "#ffffff",
                                    color:
                                      compositionDisplay === "US"
                                        ? "#1d4ed8"
                                        : "#374151",
                                    fontSize: 12,
                                    fontWeight: 700,
                                    cursor: "pointer",
                                  }}
                                >
                                  US
                                </button>

                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handleApplyComposition("UM");
                                  }}
                                  style={{
                                    minWidth: 44,
                                    padding: "6px 10px",
                                    borderRadius: 999,
                                    border:
                                      compositionDisplay === "UM"
                                        ? "1px solid #2563eb"
                                        : "1px solid #d1d5db",
                                    background:
                                      compositionDisplay === "UM"
                                        ? "#dbeafe"
                                        : "#ffffff",
                                    color:
                                      compositionDisplay === "UM"
                                        ? "#1d4ed8"
                                        : "#374151",
                                    fontSize: 12,
                                    fontWeight: 700,
                                    cursor: "pointer",
                                  }}
                                >
                                  UM
                                </button>
                              </div>
                            ) : null}

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
          ) : activeTab === "EXPORT" ? (
            <div
              style={{
                padding: 20,
                border: "1px solid #d1d5db",
                borderRadius: 16,
                background: "#ffffff",
              }}
            >
              <PdfExportPanel
                availableTrainNumbers={availableTrainNumbers}
                parsedSource={parsedSource}
                ltvNormalizedRows={ltvNormalizedRows}
                todayIso={todayIso}
                tomorrowIso={tomorrowIso}
                activeTrainNumber={exportTrainNumber}
              />
            </div>
          ) : (
            <div
              style={{
                padding: 20,
                border: "1px solid #d1d5db",
                borderRadius: 16,
                background: "#ffffff",
                color: "#111827",
              }}
            >
              <button
                type="button"
                onClick={handlePublishLtvNormalizedJson}
                disabled={isPublishing}
                title="Publier le fichier ltv.normalized.json dans LIM Editor et LIM2"
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px solid #2563eb",
                  background: isPublishing ? "#93c5fd" : "#2563eb",
                  color: "#ffffff",
                  fontWeight: 800,
                  cursor: isPublishing ? "not-allowed" : "pointer",
                  opacity: isPublishing ? 0.75 : 1,
                  marginBottom: 20,
                }}
              >
                {isPublishing ? "Publication en cours..." : "Publier / Confirmer les LTV"}
              </button>

              <button
                type="button"
                onClick={handleDownloadLtvNormalizedJson}
                title="Télécharger localement le fichier ltv.normalized.json généré depuis le tableau normalisé"
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px solid #d1d5db",
                  background: "#ffffff",
                  color: "#111827",
                  fontWeight: 700,
                  cursor: "pointer",
                  marginBottom: 20,
                }}
              >
                Télécharger le JSON LTV
              </button>

              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>
                Contrôle LTV
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  marginBottom: 20,
                }}
              >
                <div
                  style={{
                    padding: 12,
                    borderRadius: 12,
                    border: "1px solid #d1d5db",
                    background: "#f9fafb",
                  }}
                >
                  <div
                    style={{
                      fontSize: 13,
                      color: "#6b7280",
                      marginBottom: 4,
                      fontWeight: 700,
                    }}
                  >
                    Tableau normalisé
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 800 }}>
                    {ltvNormalizedRows.length} LTV
                  </div>
                </div>

                <div
                  style={{
                    padding: 12,
                    borderRadius: 12,
                    border: "1px solid #d1d5db",
                    background: "#f9fafb",
                  }}
                >
                  <div
                    style={{
                      fontSize: 13,
                      color: "#6b7280",
                      marginBottom: 4,
                      fontWeight: 700,
                    }}
                  >
                    ADIF Barcelona/Figueras
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 800 }}>
                    {ltvAdifRows.length} LTV
                  </div>
                </div>

                <div
                  style={{
                    padding: 12,
                    borderRadius: 12,
                    border: "1px solid #d1d5db",
                    background: "#f9fafb",
                  }}
                >
                  <div
                    style={{
                      fontSize: 13,
                      color: "#6b7280",
                      marginBottom: 4,
                      fontWeight: 700,
                    }}
                  >
                    Autres LTV ADIF
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 800 }}>
                    {ltvAdifOtherRows.length} LTV
                  </div>
                </div>
              </div>

              <div
                style={{
                  padding: 12,
                  borderRadius: 12,
                  border:
                    ltvNormalizedStatus === "error"
                      ? "1px solid #fecaca"
                      : ltvNormalizedStatus === "success"
                        ? "1px solid #bbf7d0"
                        : "1px solid #d1d5db",
                  background:
                    ltvNormalizedStatus === "error"
                      ? "#fef2f2"
                      : ltvNormalizedStatus === "success"
                        ? "#f0fdf4"
                        : "#f9fafb",
                  color:
                    ltvNormalizedStatus === "error"
                      ? "#991b1b"
                      : ltvNormalizedStatus === "success"
                        ? "#166534"
                        : "#374151",
                  lineHeight: 1.5,
                  fontSize: 14,
                  fontWeight: 600,
                  marginBottom: 12,
                }}
              >
                <div
                  style={{
                    fontWeight: 800,
                    marginBottom: 6,
                  }}
                >
                  Fichier normalisé actif
                </div>

                <div>{ltvNormalizedMessage}</div>

                {ltvNormalizedFileInfo ? (
                  <div style={{ marginTop: 6 }}>
                    Publié le{" "}
                    {formatLtvDateTimeForDisplay(
                      ltvNormalizedFileInfo.publishedAt
                    )}
                  </div>
                ) : null}
              </div>

              <div
                style={{
                  padding: 12,
                  borderRadius: 12,
                  border:
                    ltvAdifStatus === "error"
                      ? "1px solid #fecaca"
                      : ltvAdifStatus === "success"
                        ? "1px solid #bbf7d0"
                        : "1px solid #d1d5db",
                  background:
                    ltvAdifStatus === "error"
                      ? "#fef2f2"
                      : ltvAdifStatus === "success"
                        ? "#f0fdf4"
                        : "#f9fafb",
                  color:
                    ltvAdifStatus === "error"
                      ? "#991b1b"
                      : ltvAdifStatus === "success"
                        ? "#166534"
                        : "#374151",
                  lineHeight: 1.5,
                  fontSize: 14,
                  fontWeight: 600,
                  marginBottom: 12,
                }}
              >
                {ltvAdifMessage}
              </div>

              <div
                style={{
                  padding: 12,
                  borderRadius: 12,
                  border:
                    exportStatus === "error"
                      ? "1px solid #fecaca"
                      : exportStatus === "success"
                        ? "1px solid #bbf7d0"
                        : "1px solid #d1d5db",
                  background:
                    exportStatus === "error"
                      ? "#fef2f2"
                      : exportStatus === "success"
                        ? "#f0fdf4"
                        : "#f9fafb",
                  color:
                    exportStatus === "error"
                      ? "#991b1b"
                      : exportStatus === "success"
                        ? "#166534"
                        : "#374151",
                  lineHeight: 1.5,
                  fontSize: 14,
                }}
              >
                <div
                  style={{
                    fontWeight: 800,
                    marginBottom: 6,
                  }}
                >
                  État publication LTV
                </div>

                <div style={{ fontWeight: 600, marginBottom: 8 }}>
                  {exportMessage}
                </div>

                {exportDiagnostics.length > 0 ? (
                  <ul
                    style={{
                      margin: 0,
                      paddingLeft: 18,
                    }}
                  >
                    {exportDiagnostics.map((diagnostic) => (
                      <li key={diagnostic}>{diagnostic}</li>
                    ))}
                  </ul>
                ) : (
                  <div>Aucun diagnostic de publication LTV disponible.</div>
                )}
              </div>
            </div>
          )
        }
      />
    </>
  );
}
import type {
  FtSourceDirectionTables,
  FtSourceTrainData,
  FtSourceTrainRowData,
  FtSourceTrainVariantData,
} from "../types/sourceTypes";
import type { EditorDirection } from "../types/viewTypes";
import type { LimPdfProps, PdfFtRow, PdfLtvRow } from "../../../components/pdf/LimPdf";
import { getDirectionRows } from "../selectors/getDirectionRows";
import { detectCsvZones } from "./csvZoneDetection";

export type LtvRowForExport = {
  id: string;
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
};

function getDirectionFromTrainNumber(trainNumber: string): EditorDirection {
  const digits = trainNumber.replace(/\D/g, "").trim();
  if (!digits) return "SUD_NORD";
  const parsed = Number(digits);
  return Number.isFinite(parsed) && parsed % 2 === 0 ? "NORD_SUD" : "SUD_NORD";
}

function normalizeVariantDateRange(startDate: string, endDate: string) {
  return {
    normalizedStart: startDate.trim() === "" ? "0000-01-01" : startDate.trim(),
    normalizedEnd: endDate.trim() === "" ? "9999-12-31" : endDate.trim(),
  };
}

function findVariantForDate(
  trainData: FtSourceTrainData,
  dateStr: string
): FtSourceTrainVariantData | null {
  const date = new Date(dateStr + "T00:00:00");
  const dayKeys = [
    "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
  ] as const;
  const dayKey = dayKeys[date.getDay()];
  for (const variant of trainData.variants) {
    const { normalizedStart, normalizedEnd } = normalizeVariantDateRange(
      variant.meta.validity.startDate,
      variant.meta.validity.endDate
    );
    if (dateStr >= normalizedStart && dateStr <= normalizedEnd) {
      if (variant.meta.validity.days[dayKey]) return variant;
    }
  }
  return trainData.variants[0] ?? null;
}

function buildFtRows(
  parsedSource: FtSourceDirectionTables,
  direction: EditorDirection,
  variant: FtSourceTrainVariantData
): PdfFtRow[] {
  const allDirRows = getDirectionRows(parsedSource, direction);
  const origin = variant.meta.origine?.trim() ?? "";
  const destination = variant.meta.destination?.trim() ?? "";

  /* eslint-disable no-misleading-character-class */
  const norm = (s: string) =>
    s.normalize("NFD").replace(/\p{Mn}/gu, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  /* eslint-enable no-misleading-character-class */
  const normOrigin = norm(origin);
  const normDest = norm(destination);

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
    const rowData = variant.byRowKey[row.id] as FtSourceTrainRowData | undefined;
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

  const buildGroups = (getVal: (r: typeof dataRowsOnly[0]) => string) => {
    const groups: { start: number; len: number }[] = [];
    let gs = 0;
    for (let i = 1; i <= dataRowsOnly.length; i++) {
      if (i === dataRowsOnly.length || getVal(dataRowsOnly[i]) !== getVal(dataRowsOnly[i - 1])) {
        groups.push({ start: gs, len: i - gs });
        gs = i;
      }
    }
    return groups;
  };

  const buildGroupSets = (
    groups: { start: number; len: number }[],
    middleIds: Set<string>,
    textBelowMap: Map<string, string>,
    getVal: (r: typeof dataRowsOnly[0]) => string
  ) => {
    for (const { start, len } of groups) {
      const hasBar = start > 0 && start < dataRowCount - 1;
      if (hasBar && len === 1) {
        textBelowMap.set(dataRowsOnly[start].id, getVal(dataRowsOnly[start]));
      } else {
        const mid = hasBar && len > 1 ? 1 + Math.floor((len - 2) / 2) : Math.floor((len - 1) / 2);
        middleIds.add(dataRowsOnly[start + mid].id);
      }
    }
  };

  const bloqueoMiddleIds = new Set<string>();
  const bloqueoTextBelowMap = new Map<string, string>();
  buildGroupSets(buildGroups((r) => r.bloqueo), bloqueoMiddleIds, bloqueoTextBelowMap, (r) => r.bloqueo);

  const radioMiddleIds = new Set<string>();
  const radioTextBelowMap = new Map<string, string>();
  buildGroupSets(buildGroups((r) => r.radio), radioMiddleIds, radioTextBelowMap, (r) => r.radio);

  const rcMiddleIds = new Set<string>();
  const rcTextBelowMap = new Map<string, string>();
  buildGroupSets(buildGroups((r) => r.rampCaract), rcMiddleIds, rcTextBelowMap, (r) => r.rampCaract);

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
      if (i === dataRowsOnly.length - 1) vmaxGroups.push({ start: gs, len: dataRowsOnly.length - gs });
      if (v !== "") lastV = v;
    }
  }
  const vmaxBarIds = new Set<string>();
  const vmaxMiddleIds = new Set<string>();
  const vmaxTextBelowMap = new Map<string, string>();
  const vmaxDisplayValueMap = new Map<string, string>();
  for (const { start, len } of vmaxGroups) {
    const hasBar = start > 0;
    const value = dataRowsOnly[start].vmax;
    if (hasBar) vmaxBarIds.add(dataRowsOnly[start].id);
    if (hasBar && len === 1) {
      vmaxTextBelowMap.set(dataRowsOnly[start].id, value);
    } else {
      const mid = hasBar && len > 1 ? 1 + Math.floor((len - 2) / 2) : Math.floor((len - 1) / 2);
      vmaxMiddleIds.add(dataRowsOnly[start + mid].id);
      vmaxDisplayValueMap.set(dataRowsOnly[start + mid].id, value);
    }
  }

  const PASSENGER_STATIONS = new Set([
    "PERPIGNAN", "FIGUERES-VILAFANT", "GIRONA", "BARCELONA SANTS", "CAN TUNIS AV",
  ]);

  const csvZones = detectCsvZones(rawRows, direction === "SUD_NORD" ? "sudNord" : "nordSud");
  const csvHighlightMap = new Map<string, "lower" | "full" | "upper">();
  const csvTrueIdSet = new Set<string>();
  const csvEndIdSet = new Set<string>();
  for (const zone of csvZones.filter((z) => !z.startsAtFirstLine)) {
    zone.csvTrueIds.forEach((id, idx) => {
      csvTrueIdSet.add(id);
      csvHighlightMap.set(id, idx === 0 ? "lower" : "full");
    });
    if (zone.endId) {
      csvEndIdSet.add(zone.endId);
      csvHighlightMap.set(zone.endId, "upper");
    }
  }
  let inZone = false;
  for (const row of rawRows) {
    if (row.type === "data") {
      inZone = csvTrueIdSet.has(row.id) ? true : false;
    } else {
      if (inZone) csvHighlightMap.set(row.id, "full");
    }
  }

  let dataRowIndex = 0;
  let lastBloqueo = "";
  let lastRadio = "";
  let lastRampCaract = "";

  return rawRows.map((row) => {
    const showBloqueo = row.bloqueo !== lastBloqueo;
    const showRadio = row.radio !== lastRadio;
    lastBloqueo = row.bloqueo;
    lastRadio = row.radio;

    let showVBar = false, showRcBar = false, showBloqueoBar = false, showRadioBar = false;
    let isFirstRow = false, isLastRow = false;

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
      dataRowIndex++;
    }

    /* eslint-disable no-misleading-character-class */
    const dep = row.dependencia.trim();
    const stripAccents = (s: string) =>
      s.normalize("NFD").replace(/\p{Mn}/gu, "").toLowerCase().replace(/[^a-z0-9]/g, "");
    /* eslint-enable no-misleading-character-class */
    const normDep = stripAccents(dep);
    const isPassengerStation = PASSENGER_STATIONS.has(dep);
    const highlight =
      row.type === "data" &&
      ((isFirstRow || isLastRow)
        ? isPassengerStation
        : (row.hora !== "" && (row.com !== "" || row.tecn !== "")) ||
          (dep !== "" && normOrigin !== "" && normDep === normOrigin) ||
          (dep !== "" && normDest !== "" && normDep === normDest));

    return {
      ...row,
      showBloqueo, showBloqueoBar,
      showBloqueoText: bloqueoMiddleIds.has(row.id),
      bloqueoTextBelow: bloqueoTextBelowMap.get(row.id) ?? "",
      showRadio, showRadioBar,
      showRadioText: radioMiddleIds.has(row.id),
      radioTextBelow: radioTextBelowMap.get(row.id) ?? "",
      showVBar,
      showVmaxText: vmaxMiddleIds.has(row.id),
      vmaxDisplayValue: vmaxDisplayValueMap.get(row.id) ?? "",
      vmaxTextBelow: vmaxTextBelowMap.get(row.id) ?? "",
      showRcBar,
      showRcText: rcMiddleIds.has(row.id),
      rampCaractTextBelow: rcTextBelowMap.get(row.id) ?? "",
      highlight,
      csvHighlight: (csvHighlightMap.get(row.id) ?? "none") as "none" | "lower" | "full" | "upper",
    };
  });
}

function buildLtvRows(ltvNormalizedRows: LtvRowForExport[]): PdfLtvRow[] {
  return ltvNormalizedRows.map((r) => ({
    code: r.code, section: r.section, via: r.via,
    kmIni: r.kmIni, kmFin: r.kmFin, speed: r.speed, motivo: r.motivo,
    fecha1: r.fecha1, hora1: r.hora1, fecha2: r.fecha2, hora2: r.hora2,
    viaCheck: r.viaCheck, sistema: r.sistema, soloCabeza: r.soloCabeza,
    csv: r.csv, observaciones: r.observaciones,
  }));
}

function filterAndAssembleFtRows(
  ftRows: PdfFtRow[],
  ltvRows: PdfLtvRow[],
  direction: EditorDirection
): PdfFtRow[] {
  const parsePk = (s: string): number | null => {
    const n = parseFloat(s.replace(",", ".").trim());
    return isNaN(n) ? null : n;
  };

  const pkValues = ftRows
    .filter((r) => r.type === "data")
    .map((r) => parsePk(r.pkInterne))
    .filter((pk): pk is number => pk !== null);

  const filteredLtv =
    pkValues.length === 0
      ? ltvRows
      : ltvRows.filter((ltv) => {
          const pkIni = parsePk(ltv.kmIni);
          const pkFin = parsePk(ltv.kmFin);
          if (pkIni === null || pkFin === null) return true;
          const minPk = Math.min(pkIni, pkFin);
          const maxPk = Math.max(pkIni, pkFin);
          const routeMin = Math.min(...pkValues);
          const routeMax = Math.max(...pkValues);
          return maxPk >= routeMin && minPk <= routeMax;
        });

  const isIncreasing = direction === "SUD_NORD";
  const dataRowPks = ftRows
    .filter((r) => r.type === "data")
    .map((r) => ({ id: r.id, pk: parsePk(r.pkInterne) }))
    .filter((r): r is { id: string; pk: number } => r.pk !== null);

  const ltvNoteMap = new Map<string, string[]>();
  for (const ltv of filteredLtv) {
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
    const [firstPkStr, secondPkStr] =
      isIncreasing
        ? pkIni <= pkFin ? [ltv.kmIni, ltv.kmFin] : [ltv.kmFin, ltv.kmIni]
        : pkIni >= pkFin ? [ltv.kmIni, ltv.kmFin] : [ltv.kmFin, ltv.kmIni];
    const note = `LTV ${speed} - PK ${firstPkStr} → ${secondPkStr}${ltv.observaciones.trim() ? ` — ${ltv.observaciones.trim()}` : ""}`;
    if (!ltvNoteMap.has(targetId)) ltvNoteMap.set(targetId, []);
    ltvNoteMap.get(targetId)!.push(note);
  }

  let finalRows = ftRows.map((row) => ({
    ...row,
    ltvNote: ltvNoteMap.get(row.id)?.join("\n") ?? "",
  }));

  if (direction === "NORD_SUD") {
    const reordered: PdfFtRow[] = [];
    for (const row of finalRows) {
      if (row.type === "note") {
        let insertIdx = reordered.length;
        for (let j = reordered.length - 1; j >= 0; j--) {
          if (reordered[j].type === "data") { insertIdx = j; break; }
        }
        reordered.splice(insertIdx, 0, row);
      } else {
        reordered.push(row);
      }
    }
    finalRows = reordered;
  }

  return finalRows;
}

export function buildPdfPropsForTrain(
  trainNumber: string,
  date: string,
  parsedSource: FtSourceDirectionTables,
  ltvNormalizedRows: LtvRowForExport[]
): LimPdfProps | null {
  const trainData = parsedSource.trains?.[trainNumber];
  if (!trainData) return null;

  const variant = findVariantForDate(trainData, date);
  if (!variant) return null;

  const direction = getDirectionFromTrainNumber(trainNumber);
  const ftRows = buildFtRows(parsedSource, direction, variant);
  const ltvRows = buildLtvRows(ltvNormalizedRows);
  const ftRowsFinal = filterAndAssembleFtRows(ftRows, ltvRows, direction);
  const filteredLtvRows = ltvRows.filter((ltv) => {
    const parsePk = (s: string) => { const n = parseFloat(s.replace(",", ".").trim()); return isNaN(n) ? null : n; };
    const pkValues = ftRows.filter(r => r.type === "data").map(r => parsePk(r.pkInterne)).filter((pk): pk is number => pk !== null);
    if (pkValues.length === 0) return true;
    const pkIni = parsePk(ltv.kmIni);
    const pkFin = parsePk(ltv.kmFin);
    if (pkIni === null || pkFin === null) return true;
    return Math.max(pkIni, pkFin) >= Math.min(...pkValues) && Math.min(pkIni, pkFin) <= Math.max(...pkValues);
  });

  const composition = variant.meta.composition?.trim() || "US";
  const longueur = composition === "US" ? 200 : composition === "UM" ? 400 : undefined;
  const masse = composition === "US" ? 433 : composition === "UM" ? 866 : undefined;

  const dateFormatted = new Date(date + "T00:00:00").toLocaleDateString("fr-FR", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  return {
    trainNumber,
    categorieEspagne: variant.meta.categorieEspagne?.trim() ?? "",
    origine: variant.meta.origine?.trim() ?? "",
    destination: variant.meta.destination?.trim() ?? "",
    dateFormatted,
    composition,
    materiel: variant.meta.materiel?.trim() ?? "",
    ligne: variant.meta.ligne?.trim() ?? "",
    longueur,
    masse,
    ltvRows: filteredLtvRows,
    ftRows: ftRowsFinal,
  };
}

import { View, Text, StyleSheet } from "@react-pdf/renderer";
import type { PdfLtvRow } from "./LimPdf";

type Props = {
  rows: PdfLtvRow[];
};

const COL = {
  section: 118,
  via: 18,
  kmIni: 34,
  kmFin: 34,
  speed: 24,
  motivo: 62,
  fecha1: 31,
  hora1: 20,
  fecha2: 31,
  hora2: 20,
  viaCheck: 15,
  sistema: 15,
  soloCabeza: 18,
  csv: 15,
  observaciones: 83,
} as const;

const HEADER_H = 40;
const ROW1_H = 14;
const BG_HEADER = "#ffffff";
const BORDER_MAIN = "0.8pt solid #374151";
const BORDER_LIGHT = "0.5pt solid #374151";

const s = StyleSheet.create({
  container: {
    marginBottom: 4,
    border: BORDER_MAIN,
  },
  titleBar: {
    backgroundColor: "#e5e7eb",
    padding: "3pt 5pt",
    borderBottom: BORDER_MAIN,
  },
  titleText: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
  },
  dataRow: {
    flexDirection: "row",
    borderBottom: BORDER_LIGHT,
  },
  cell: {
    padding: "2pt 2pt",
    fontSize: 6,
    fontFamily: "Helvetica",
    borderRight: BORDER_LIGHT,
    justifyContent: "center",
  },
  cellLast: {
    padding: "2pt 2pt",
    fontSize: 6,
    fontFamily: "Helvetica",
    justifyContent: "center",
  },
  headerText: {
    fontSize: 6,
    fontFamily: "Helvetica-Bold",
    color: "#374151",
    textAlign: "center",
  },
  checkMark: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    color: "#111827",
  },
});

/** Cellule d'en-tête texte horizontal, couvre toute la hauteur du header */
function SpanCell({
  label,
  width,
  borderRight = true,
  alignCenter = false,
}: {
  label: string;
  width: number;
  borderRight?: boolean;
  alignCenter?: boolean;
}) {
  return (
    <View
      style={{
        width,
        height: HEADER_H,
        backgroundColor: BG_HEADER,
        borderRight: borderRight ? BORDER_LIGHT : undefined,
        padding: "2pt 3pt",
        justifyContent: "center",
        alignItems: alignCenter ? "center" : "flex-start",
      }}
    >
      <Text style={s.headerText}>{label}</Text>
    </View>
  );
}

/** Cellule d'en-tête texte vertical, couvre toute la hauteur du header */
function VertCell({
  label,
  width,
  borderRight = true,
  fontSize = 6,
}: {
  label: string;
  width: number;
  borderRight?: boolean;
  fontSize?: number;
}) {
  return (
    <View
      style={{
        width,
        height: HEADER_H,
        backgroundColor: BG_HEADER,
        borderRight: borderRight ? BORDER_LIGHT : undefined,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      <View
        style={{
          width: HEADER_H - 4,
          transform: "rotate(-90deg)",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={[s.headerText, { fontSize }]}>{label}</Text>
      </View>
    </View>
  );
}

/** Cellule d'en-tête à deux lignes (label groupe + sous-colonnes verticales) */
function GroupCell({
  label,
  subCols,
  borderRight = true,
  fontSize = 6,
}: {
  label: string;
  subCols: { label: string; width: number }[];
  borderRight?: boolean;
  fontSize?: number;
}) {
  const totalWidth = subCols.reduce((s, c) => s + c.width, 0);
  const row2H = HEADER_H - ROW1_H;
  return (
    <View
      style={{
        width: totalWidth,
        height: HEADER_H,
        backgroundColor: BG_HEADER,
        borderRight: borderRight ? BORDER_LIGHT : undefined,
        flexDirection: "column",
      }}
    >
      {/* Label du groupe */}
      <View
        style={{
          height: ROW1_H,
          borderBottom: BORDER_LIGHT,
          alignItems: "center",
          justifyContent: "center",
          padding: "1pt 2pt",
        }}
      >
        <Text style={[s.headerText, { fontSize }]}>{label}</Text>
      </View>

      {/* Sous-colonnes verticales */}
      <View style={{ flex: 1, flexDirection: "row" }}>
        {subCols.map((col, i) => (
          <View
            key={i}
            style={{
              width: col.width,
              height: row2H,
              borderRight: i < subCols.length - 1 ? BORDER_LIGHT : undefined,
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
            }}
          >
            <View
              style={{
                width: row2H - 2,
                transform: "rotate(-90deg)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={s.headerText}>{col.label}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function DataCell({
  value,
  width,
  last = false,
  bold = false,
  center = false,
}: {
  value: string;
  width: number;
  last?: boolean;
  bold?: boolean;
  center?: boolean;
}) {
  return (
    <View style={[last ? s.cellLast : s.cell, { width }]}>
      <Text
        style={{
          fontSize: 5,
          fontFamily: bold ? "Helvetica-Bold" : "Helvetica",
          textAlign: center ? "center" : "left",
        }}
      >
        {value}
      </Text>
    </View>
  );
}

const CHAR_W = 3.6; // largeur approx. d'un caractère à fontSize 5 en Helvetica (conservateur)
const CELL_PAD = 4; // padding horizontal total (2pt chaque côté)

function autoWidth(values: string[], min: number): number {
  if (values.length === 0) return min;
  const maxLen = Math.max(...values.flatMap((v) => v.split("\n").map((l) => l.length)));
  return Math.max(Math.ceil(maxLen * CHAR_W + CELL_PAD), min);
}

export default function PdfBlocLtv({ rows }: Props) {
  const viaW    = autoWidth(rows.map((r) => r.via),          12);
  const kmIniW  = autoWidth(rows.map((r) => r.kmIni),        14);
  const kmFinW  = autoWidth(rows.map((r) => r.kmFin),        14);
  const speedW  = autoWidth(rows.map((r) => r.speed),        14);
  const motivoW = autoWidth(rows.map((r) => r.motivo),       30);
  const obsW    = autoWidth(rows.map((r) => r.observaciones), 64); // min = largeur de "Observaciones" en header

  return (
    <View style={s.container}>
      <View style={s.titleBar}>
        <Text style={s.titleText}>LTV</Text>
      </View>

      {/* En-tête à deux niveaux */}
      <View style={{ flexDirection: "row", borderBottom: BORDER_MAIN }}>
        <SpanCell label={"(CÓD.) Trayecto / Estación"} width={COL.section} />
        <VertCell label="Vía" width={viaW} />
        <VertCell label="Km. Ini" width={kmIniW} />
        <VertCell label="Km. Fin" width={kmFinW} />
        <VertCell label="Veloc." width={speedW} />
        <SpanCell label="Motivo" width={motivoW} alignCenter />
        <GroupCell
          label="Establecido"
          subCols={[{ label: "Fecha", width: COL.fecha1 }, { label: "Hora", width: COL.hora1 }]}
        />
        <GroupCell
          label="Fin prevista"
          subCols={[{ label: "Fecha", width: COL.fecha2 }, { label: "Hora", width: COL.hora2 }]}
        />
        <GroupCell
          label={"No\nseñalizada"}
          subCols={[{ label: "Vía", width: COL.viaCheck }, { label: "Sistema", width: COL.sistema }]}
          fontSize={4}
        />
        <VertCell label="Sólo vehic. Cabeza" width={COL.soloCabeza} fontSize={4.5} />
        <VertCell label="CSV" width={COL.csv} />
        <SpanCell label="Observaciones" width={obsW} borderRight={false} />
      </View>

      {/* Lignes de données */}
      {rows.length === 0 ? (
        <View style={{ backgroundColor: "#e5e7eb", padding: "5pt 8pt" }}>
          <Text style={{ fontSize: 7, fontFamily: "Helvetica", color: "#374151" }}>
            Aucune LTV
          </Text>
        </View>
      ) : (
        rows.map((row) => (
          <View key={row.code} style={s.dataRow}>
            <View style={[s.cell, { width: COL.section }]}>
              <Text style={{ fontSize: 4, fontFamily: "Helvetica-Bold", color: "#6b7280" }}>
                {row.code}
              </Text>
              <Text style={{ fontSize: 5, fontFamily: "Helvetica" }}>{row.section}</Text>
            </View>
            <DataCell value={row.via} width={viaW} center />
            <DataCell value={row.kmIni} width={kmIniW} center bold />
            <DataCell value={row.kmFin} width={kmFinW} center bold />
            <DataCell value={row.speed} width={speedW} bold center />
            <DataCell value={row.motivo} width={motivoW} />
            <DataCell value={row.fecha1} width={COL.fecha1} center />
            <DataCell value={row.hora1} width={COL.hora1} center />
            <DataCell value={row.fecha2} width={COL.fecha2} center />
            <DataCell value={row.hora2} width={COL.hora2} center />
            <View style={[s.cell, { width: COL.viaCheck }]}>
              {row.viaCheck && <Text style={s.checkMark}>X</Text>}
            </View>
            <View style={[s.cell, { width: COL.sistema }]}>
              {row.sistema && <Text style={s.checkMark}>X</Text>}
            </View>
            <View style={[s.cell, { width: COL.soloCabeza }]}>
              {row.soloCabeza && <Text style={s.checkMark}>X</Text>}
            </View>
            <View style={[s.cell, { width: COL.csv }]}>
              {row.csv && <Text style={s.checkMark}>X</Text>}
            </View>
            <DataCell value={row.observaciones} width={obsW} last />
          </View>
        ))
      )}
    </View>
  );
}

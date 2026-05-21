import { View, Text, StyleSheet } from "@react-pdf/renderer";
import type { PdfFtRow } from "./LimPdf";

// numberOfLines est valide à l'exécution dans @react-pdf/renderer mais absent de ses types TS
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TextNL = Text as any;

type Props = {
  rows: PdfFtRow[];
};

const BORDER_MAIN = "0.8pt solid #374151";
const BORDER_LIGHT = "0.5pt solid #374151";
const HIGHLIGHT_BG = "#fffda6";
const CSV_BG = "#ffc000";

const W = {
  bloqueo: 68,
  vmax: 28,
  sitKm: 44,
  com: 22,
  hora: 34,
  tecn: 28,
  conc: 22,
  radio: 50,
  rampCaract: 34,
  etcs: 28,
} as const;

const s = StyleSheet.create({
  container: {
    border: BORDER_MAIN,
  },
  headerRow: {
    flexDirection: "row",
    backgroundColor: "#ffffff",
    borderBottom: BORDER_MAIN,
    minHeight: 28,
  },
  dataRow: {
    flexDirection: "row",
    borderBottom: BORDER_LIGHT,
    minHeight: 16,
  },
  intermediateRow: {
    flexDirection: "row",
    borderBottom: BORDER_LIGHT,
    backgroundColor: "#f3f4f6",
    minHeight: 16,
  },
  cell: {
    padding: "2pt 3pt",
    fontSize: 7,
    fontFamily: "Helvetica",
    borderRight: BORDER_LIGHT,
    justifyContent: "center",
  },
  cellLast: {
    padding: "2pt 3pt",
    fontSize: 7,
    fontFamily: "Helvetica",
    justifyContent: "center",
  },
  headerText: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: "#374151",
    textAlign: "center",
  },
});

function HeaderCell({
  label,
  width,
  flex,
  last = false,
}: {
  label: string;
  width?: number;
  flex?: number;
  last?: boolean;
}) {
  return (
    <View
      style={[
        last ? s.cellLast : s.cell,
        width != null ? { width } : {},
        flex != null ? { flex } : {},
        { alignItems: "center", justifyContent: "center" },
      ]}
    >
      <Text style={s.headerText}>{label}</Text>
    </View>
  );
}

// Largeur texte dispo dans la cellule Dependencia (flex:1) :
// 595 - 40 (marges page) - 1.6 (bordures container) - 358 (colonnes fixes) - 6 (padding 2×3pt) ≈ 189pt
const DEP_INNER_W = 189;
const BOLD7_CHAR_W = 4.5; // largeur moy. d'un caractère Helvetica-Bold à 7pt
const DOT7_W = 2.0;       // largeur d'un point Helvetica à 7pt (valeur AFM réelle)

function dotLeader(name: string): string {
  const free = DEP_INNER_W - name.length * BOLD7_CHAR_W;
  return ".".repeat(Math.max(3, Math.floor(free / DOT7_W)));
}

function SepBar() {
  return (
    <View style={{ height: 1.5, backgroundColor: "#111827", marginBottom: 1 }} />
  );
}

function NoteLine({ text }: { text: string }) {
  const spaceIdx = text.indexOf(" ");
  const first = spaceIdx === -1 ? text : text.slice(0, spaceIdx);
  const rest = spaceIdx === -1 ? "" : text.slice(spaceIdx + 1);
  return (
    <Text
      style={{
        fontSize: 5,
        fontFamily: "Helvetica-Oblique",
        color: "#dc2626",
        marginTop: 1,
      }}
    >
      <Text style={{ fontFamily: "Helvetica-BoldOblique" }}>{first}</Text>
      {rest ? " " + rest : ""}
    </Text>
  );
}

export default function PdfBlocFt({ rows }: Props) {
  return (
    <View style={s.container}>
      {/* En-tête colonnes */}
      <View style={s.headerRow}>
        <HeaderCell label="Bloqueo" width={W.bloqueo} />
        <HeaderCell label={"V\nMax"} width={W.vmax} />
        <HeaderCell label={"Sit\nKm"} width={W.sitKm} />
        <HeaderCell label="Dependencia" flex={1} />
        <HeaderCell label="Com" width={W.com} />
        <HeaderCell label="Hora" width={W.hora} />
        <HeaderCell label="Técn" width={W.tecn} />
        <HeaderCell label="Conc" width={W.conc} />
        <HeaderCell label="Radio" width={W.radio} />
        <HeaderCell label={"Ramp\nCaract"} width={W.rampCaract} />
        <HeaderCell label="" width={W.etcs} last />
      </View>

      {/* Lignes de données */}
      {rows.flatMap((row, i) => {
        if (row.type === "note") return []; // ignoré pour l'instant

        const hasNextDataRow = rows.slice(i + 1).some((r) => r.type === "data");

        const hl = row.highlight;
        const hlBg = hl ? HIGHLIGHT_BG : undefined;
        const vmaxBg = row.csv ? CSV_BG : undefined;
        const hasStation = row.dependencia.trim() !== "";
        const inlineNotes = row.notes.flatMap((n) =>
          n.split("\n").filter((l) => l.trim() !== "")
        );

        return [
          <View key={row.id} style={s.dataRow}>
            {/* Bloqueo : barre centrée sur la 1ère ligne du groupe (sauf 1ère/dernière), texte centré sur la ligne du milieu */}
            <View style={[s.cell, { width: W.bloqueo }]}>
              {row.showBloqueoBar && (
                <View style={{ height: 1.5, backgroundColor: "#111827" }} />
              )}
              {row.showBloqueoText && (
                <Text style={{ fontSize: 7, fontFamily: "DejaVu", textAlign: "center" }}>
                  {row.bloqueo}
                </Text>
              )}
            </View>

            {/* V Max : barre si changement de vitesse, fond orange si CSV */}
            <View
              style={[s.cell, { width: W.vmax, backgroundColor: vmaxBg }]}
            >
              {row.showVBar && <SepBar />}
              {row.showVmaxText && (
                <Text
                  style={{
                    fontSize: 7,
                    fontFamily: row.csv ? "Helvetica-Bold" : "Helvetica",
                    textAlign: "center",
                  }}
                >
                  {row.vmaxDisplayValue}
                </Text>
              )}
            </View>

            {/* Sit Km */}
            <View
              style={[s.cell, { width: W.sitKm, backgroundColor: hlBg }]}
            >
              <Text
                style={{
                  fontSize: 7,
                  fontFamily: hl ? "Helvetica-Bold" : "Helvetica",
                  color: hasStation ? "#111827" : "#6b7280",
                  textAlign: "center",
                }}
              >
                {row.sitKm}
              </Text>
            </View>

            {/* Dependencia + notes inline */}
            <View style={[s.cell, { flex: 1, backgroundColor: hlBg }]}>
              <TextNL
                numberOfLines={1}
                style={{
                  fontSize: 7,
                  fontFamily: hl ? "Helvetica-Bold" : "Helvetica",
                  color: hasStation ? "#111827" : "#6b7280",
                }}
              >
                {hasStation ? row.dependencia + dotLeader(row.dependencia) : row.dependencia}
              </TextNL>
              {inlineNotes.map((line, i) => (
                <NoteLine key={i} text={line} />
              ))}
            </View>

            {/* Com */}
            <View style={[s.cell, { width: W.com, backgroundColor: hlBg }]}>
              <Text
                style={{
                  fontSize: 7,
                  fontFamily: "Helvetica-Bold",
                  textAlign: "center",
                }}
              >
                {row.com}
              </Text>
            </View>

            {/* Hora */}
            <View
              style={[s.cell, { width: W.hora, backgroundColor: hlBg }]}
            >
              <Text
                style={{
                  fontSize: 7,
                  fontFamily: row.hora !== "" ? "Helvetica-Bold" : "Helvetica",
                  textAlign: "center",
                  color: row.hora !== "" ? "#111827" : "#d1d5db",
                }}
              >
                {row.hora !== "" ? row.hora : "—"}
              </Text>
            </View>

            {/* Técn */}
            <View style={[s.cell, { width: W.tecn }]}>
              <Text style={{ fontSize: 7, fontFamily: "Helvetica-Bold" }}>
                {row.tecn}
              </Text>
            </View>

            {/* Conc */}
            <View style={[s.cell, { width: W.conc }]}>
              <Text
                style={{
                  fontSize: 7,
                  fontFamily: "Helvetica",
                  textAlign: "center",
                }}
              >
                {row.conc}
              </Text>
            </View>

            {/* Radio : barre centrée, valeur au milieu du groupe */}
            <View style={[s.cell, { width: W.radio }]}>
              {row.showRadioBar && (
                <View style={{ height: 1.5, backgroundColor: "#111827" }} />
              )}
              {row.showRadioText && (
                <Text style={{ fontSize: 7, fontFamily: "DejaVu", textAlign: "center" }}>
                  {row.radio}
                </Text>
              )}
            </View>

            {/* Rampe Caract. : barre centrée, valeur au milieu du groupe */}
            <View style={[s.cell, { width: W.rampCaract }]}>
              {row.showRcBar && (
                <View style={{ height: 1.5, backgroundColor: "#111827" }} />
              )}
              {row.showRcText && (
                <Text style={{ fontSize: 7, fontFamily: "Helvetica", textAlign: "center" }}>
                  {row.rampCaract}
                </Text>
              )}
            </View>

            {/* ETCS */}
            <View style={[s.cellLast, { width: W.etcs }]}>
              <Text style={{ fontSize: 7, fontFamily: "DejaVu", textAlign: "center" }}>
                {row.etcs}
              </Text>
            </View>
          </View>,
          ...(hasNextDataRow
            ? [
                <View key={`inter-${row.id}`} style={s.intermediateRow}>
                  <View style={[s.cell, { width: W.bloqueo }]}>
                    {row.bloqueoTextBelow !== "" && (
                      <Text style={{ fontSize: 7, fontFamily: "DejaVu", textAlign: "center" }}>
                        {row.bloqueoTextBelow}
                      </Text>
                    )}
                  </View>
                  <View style={[s.cell, { width: W.vmax }]}>
                    {row.vmaxTextBelow !== "" && (
                      <Text style={{ fontSize: 7, fontFamily: "Helvetica", textAlign: "center" }}>
                        {row.vmaxTextBelow}
                      </Text>
                    )}
                  </View>
                  <View style={[s.cell, { width: W.sitKm }]} />
                  <View style={[s.cell, { flex: 1 }]} />
                  <View style={[s.cell, { width: W.com }]} />
                  <View style={[s.cell, { width: W.hora }]} />
                  <View style={[s.cell, { width: W.tecn }]} />
                  <View style={[s.cell, { width: W.conc }]} />
                  <View style={[s.cell, { width: W.radio }]}>
                    {row.radioTextBelow !== "" && (
                      <Text style={{ fontSize: 7, fontFamily: "DejaVu", textAlign: "center" }}>
                        {row.radioTextBelow}
                      </Text>
                    )}
                  </View>
                  <View style={[s.cell, { width: W.rampCaract }]}>
                    {row.rampCaractTextBelow !== "" && (
                      <Text style={{ fontSize: 7, fontFamily: "Helvetica", textAlign: "center" }}>
                        {row.rampCaractTextBelow}
                      </Text>
                    )}
                  </View>
                  <View style={[s.cellLast, { width: W.etcs }]} />
                </View>,
              ]
            : []),
        ];
      })}
    </View>
  );
}

import { View, Text, StyleSheet } from "@react-pdf/renderer";
import type { PdfFtRow } from "./LimPdf";

// numberOfLines est valide à l'exécution dans @react-pdf/renderer mais absent de ses types TS
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TextNL = Text as any;

type Props = {
  rows: PdfFtRow[];
  composition: string;
  longueur: number | undefined;
  masse: number | undefined;
  showTableFooter?: boolean;
};

const BORDER_MAIN = "0.8pt solid #374151";
const BORDER_LIGHT = "0.5pt solid #374151";
const HIGHLIGHT_BG = "#fde047";
const CSV_BG = "#fb923c";

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
    minHeight: 16,
  },
  intermediateRow: {
    flexDirection: "row",
    minHeight: 16,
  },
  cell: {
    padding: "2pt 3pt",
    fontSize: 9,
    fontFamily: "Helvetica",
    borderRight: BORDER_LIGHT,
    justifyContent: "center",
  },
  cellLast: {
    padding: "2pt 3pt",
    fontSize: 9,
    fontFamily: "Helvetica",
    justifyContent: "center",
  },
  headerText: {
    fontSize: 9,
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
const BOLD9_CHAR_W = 5.74; // largeur moy. d'un caractère Helvetica-Bold à 9pt (= 5.1 × 9/8)
const DOT9_W = 2.59;       // largeur d'un point Helvetica à 9pt (= 2.3 × 9/8)

function dotLeader(name: string): string {
  const free = DEP_INNER_W - name.length * BOLD9_CHAR_W;
  return ".".repeat(Math.max(3, Math.floor(free / DOT9_W)));
}

const BAR_STYLE = { height: 1.5, backgroundColor: "#111827", marginLeft: -3, marginRight: -3 } as const;

function SepBar() {
  return (
    <View style={{ ...BAR_STYLE, marginBottom: 1 }} />
  );
}

function OrangeLine({ text }: { text: string }) {
  return (
    <Text
      style={{
        fontSize: 5,
        fontFamily: "DejaVu",
        fontWeight: "bold",
        fontStyle: "italic",
        color: "#f97316",
        marginTop: 1,
      }}
    >
      {text}
    </Text>
  );
}

function subtractMinutes(timeStr: string, minutes: number): string {
  const [h, m] = timeStr.split(":").map(Number);
  const total = ((h * 60 + m - minutes) % 1440 + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function NoteLine({ text }: { text: string }) {
  const segments = text.split(" | ");
  return (
    <Text style={{ fontSize: 6, fontFamily: "Helvetica-Oblique", color: "#dc2626", marginTop: 1 }}>
      {segments.map((seg, idx) => {
        const spaceIdx = seg.indexOf(" ");
        const first = spaceIdx === -1 ? seg : seg.slice(0, spaceIdx);
        const rest = spaceIdx === -1 ? "" : seg.slice(spaceIdx);
        return (
          <Text key={idx}>
            {idx > 0 ? " | " : ""}
            <Text style={{ fontFamily: "Helvetica-BoldOblique" }}>{first}</Text>
            {rest}
          </Text>
        );
      })}
    </Text>
  );
}

export default function PdfBlocFt({ rows, composition, longueur, masse, showTableFooter = true }: Props) {
  const longueurMasse = [
    longueur != null ? `${longueur}m` : null,
    masse != null ? `${masse}t` : null,
  ].filter(Boolean).join(" - ");
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
        if (row.type === "note") {
          const noteLines = row.notes.flatMap((n) =>
            n.split("\n").filter((l) => l.trim() !== "")
          );
          const nextRow = rows[i + 1];
          let noteArrivalHora = "";
          if (nextRow && nextRow.type === "data" && nextRow.hora !== "") {
            const stopStr = nextRow.com !== "" ? nextRow.com : nextRow.tecn;
            const stopMin = stopStr !== "" ? parseInt(stopStr) : 0;
            if (!isNaN(stopMin) && stopMin > 0) {
              noteArrivalHora = subtractMinutes(nextRow.hora, stopMin);
            }
          }
          return [
            <View key={row.id} style={s.intermediateRow}>
              <View style={[s.cell, { width: W.bloqueo }]} />
              <View style={[s.cell, { width: W.vmax, backgroundColor: row.csvHighlight !== "none" ? CSV_BG : undefined }]} />
              <View style={[s.cell, { width: W.sitKm }]} />
              <View style={[s.cell, { flex: 1 }]}>
                {noteLines.map((line, idx) => (
                  <NoteLine key={idx} text={line} />
                ))}
              </View>
              <View style={[s.cell, { width: W.com }]} />
              <View style={[s.cell, { width: W.hora, justifyContent: "flex-end" }]}>
                {noteArrivalHora !== "" && (
                  <Text style={{ fontSize: 9, fontFamily: "Helvetica-Oblique", textAlign: "center" }}>
                    {noteArrivalHora}
                  </Text>
                )}
              </View>
              <View style={[s.cell, { width: W.tecn }]} />
              <View style={[s.cell, { width: W.conc }]} />
              <View style={[s.cell, { width: W.radio }]} />
              <View style={[s.cell, { width: W.rampCaract }]} />
              <View style={[s.cellLast, { width: W.etcs }]} />
            </View>,
          ];
        }

        if (row.type === "context") {
          return [
            <View key={row.id} style={s.dataRow}>
              <View style={[s.cell, { width: W.bloqueo }]}>
                {row.showBloqueoText && (
                  <Text style={{ fontSize: 9, fontFamily: "DejaVu", textAlign: "center" }}>
                    {row.bloqueo}
                  </Text>
                )}
              </View>
              <View style={[s.cell, { width: W.vmax, backgroundColor: row.csvHighlight !== "none" ? CSV_BG : row.highlight ? HIGHLIGHT_BG : undefined }]}>
                {row.showVmaxText && (
                  <Text style={{ fontSize: 9, fontFamily: "Helvetica", textAlign: "center" }}>
                    {row.vmaxDisplayValue}
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
                {row.showRadioText && (
                  <Text style={{ fontSize: 9, fontFamily: "DejaVu", textAlign: "center" }}>
                    {row.radio}
                  </Text>
                )}
              </View>
              <View style={[s.cell, { width: W.rampCaract }]}>
                {row.showRcText && (
                  <Text style={{ fontSize: 9, fontFamily: "Helvetica", textAlign: "center" }}>
                    {row.rampCaract}
                  </Text>
                )}
              </View>
              <View style={[s.cellLast, { width: W.etcs }]} />
            </View>,
          ];
        }

        const hasNextDataRow = rows.slice(i + 1).some((r) => r.type === "data");

        const nextDataRowIdx = rows.findIndex((r, idx) => idx > i && r.type === "data");
        const nextDataRow = nextDataRowIdx !== -1 ? rows[nextDataRowIdx] : undefined;
        const hasNoteJustBeforeNextData = nextDataRowIdx > i + 1 && rows[nextDataRowIdx - 1].type === "note";
        let arrivalHora = "";
        if (nextDataRow && nextDataRow.hora !== "") {
          const stopStr = nextDataRow.com !== "" ? nextDataRow.com : nextDataRow.tecn;
          const stopMin = stopStr !== "" ? parseInt(stopStr) : 0;
          if (!isNaN(stopMin) && stopMin > 0) {
            arrivalHora = subtractMinutes(nextDataRow.hora, stopMin);
          }
        }

        const hl = row.highlight;
        const hlBg = hl ? HIGHLIGHT_BG : undefined;

        const hasStation = row.dependencia.trim() !== "";
        const inlineNotes = row.notes.flatMap((n) =>
          n.split("\n").filter((l) => l.trim() !== "")
        );

        return [
          <View key={row.id} style={s.dataRow}>
            {/* Bloqueo : barre centrée sur la 1ère ligne du groupe (sauf 1ère/dernière), texte centré sur la ligne du milieu */}
            <View style={[s.cell, { width: W.bloqueo }]}>
              {row.showBloqueoBar && (
                <View style={BAR_STYLE} />
              )}
              {row.showBloqueoText && (
                <Text style={{ fontSize: 9, fontFamily: "DejaVu", textAlign: "center" }}>
                  {row.bloqueo}
                </Text>
              )}
            </View>

            {/* V Max : barre si changement de vitesse + fond orange si CSV */}
            <View style={[s.cell, { width: W.vmax, backgroundColor: row.csvHighlight === "full" ? CSV_BG : undefined }]}>
              {row.csvHighlight === "lower" && (
                <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 8, backgroundColor: CSV_BG }} />
              )}
              {row.csvHighlight === "upper" && (
                <View style={{ position: "absolute", top: 0, left: 0, right: 0, height: 8, backgroundColor: CSV_BG }} />
              )}
              {row.showVBar && <SepBar />}
              {row.showVmaxText && (
                <Text
                  style={{
                    fontSize: 9,
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
                  fontSize: 9,
                  fontFamily: hl ? "Helvetica-Bold" : "Helvetica",
                  color: "#111827",
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
                  fontSize: 9,
                  fontFamily: hl ? "Helvetica-Bold" : "Helvetica",
                  color: hasStation ? "#111827" : "#6b7280",
                }}
              >
                {hasStation && row.hora !== "" ? row.dependencia + dotLeader(row.dependencia) : row.dependencia}
              </TextNL>
              {inlineNotes.map((line, i) => (
                <NoteLine key={i} text={line} />
              ))}
            </View>

            {/* Com */}
            <View style={[s.cell, { width: W.com, backgroundColor: hlBg }]}>
              <Text
                style={{
                  fontSize: 9,
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
              {row.hora !== "" && (
                <Text
                  style={{
                    fontSize: 9,
                    fontFamily: "Helvetica-Bold",
                    textAlign: "center",
                  }}
                >
                  {row.hora}
                </Text>
              )}
            </View>

            {/* Técn */}
            <View style={[s.cell, { width: W.tecn }]}>
              <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold" }}>
                {row.tecn}
              </Text>
            </View>

            {/* Conc */}
            <View style={[s.cell, { width: W.conc }]}>
              <Text
                style={{
                  fontSize: 9,
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
                <View style={BAR_STYLE} />
              )}
              {row.showRadioText && (
                <Text style={{ fontSize: 9, fontFamily: "DejaVu", textAlign: "center" }}>
                  {row.radio}
                </Text>
              )}
            </View>

            {/* Rampe Caract. : barre centrée, valeur au milieu du groupe */}
            <View style={[s.cell, { width: W.rampCaract }]}>
              {row.showRcBar && (
                <View style={BAR_STYLE} />
              )}
              {row.showRcText && (
                <Text style={{ fontSize: 9, fontFamily: "Helvetica", textAlign: "center" }}>
                  {row.rampCaract}
                </Text>
              )}
            </View>

            {/* ETCS */}
            <View style={[s.cellLast, { width: W.etcs }]}>
              <Text style={{ fontSize: 9, fontFamily: "DejaVu", textAlign: "center" }}>
                {row.etcs}
              </Text>
            </View>
          </View>,
          ...(hasNextDataRow
            ? [
                <View key={`inter-${row.id}`} style={s.intermediateRow}>
                  <View style={[s.cell, { width: W.bloqueo }]}>
                    {row.bloqueoTextBelow !== "" && (
                      <Text style={{ fontSize: 9, fontFamily: "DejaVu", textAlign: "center" }}>
                        {row.bloqueoTextBelow}
                      </Text>
                    )}
                  </View>
                  <View style={[s.cell, { width: W.vmax, backgroundColor: row.csvHighlight !== "none" && row.csv ? CSV_BG : undefined }]}>
                    {row.vmaxTextBelow !== "" && (
                      <Text style={{ fontSize: 9, fontFamily: "Helvetica", textAlign: "center" }}>
                        {row.vmaxTextBelow}
                      </Text>
                    )}
                  </View>
                  <View style={[s.cell, { width: W.sitKm }]} />
                  <View style={[s.cell, { flex: 1 }]}>
                    {row.ltvNote !== "" &&
                      row.ltvNote.split("\n").map((line, idx) => (
                        <OrangeLine key={idx} text={line} />
                      ))}
                  </View>
                  <View style={[s.cell, { width: W.com }]} />
                  <View style={[s.cell, { width: W.hora, justifyContent: "flex-end" }]}>
                    {arrivalHora !== "" && !hasNoteJustBeforeNextData && (
                      <Text style={{ fontSize: 9, fontFamily: "Helvetica-Oblique", textAlign: "center" }}>
                        {arrivalHora}
                      </Text>
                    )}
                  </View>
                  <View style={[s.cell, { width: W.tecn }]} />
                  <View style={[s.cell, { width: W.conc }]} />
                  <View style={[s.cell, { width: W.radio }]}>
                    {row.radioTextBelow !== "" && (
                      <Text style={{ fontSize: 9, fontFamily: "DejaVu", textAlign: "center" }}>
                        {row.radioTextBelow}
                      </Text>
                    )}
                  </View>
                  <View style={[s.cell, { width: W.rampCaract }]}>
                    {row.rampCaractTextBelow !== "" && (
                      <Text style={{ fontSize: 9, fontFamily: "Helvetica", textAlign: "center" }}>
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

      {/* Ligne footer : composition + longueur/masse (dernière page seulement) */}
      {showTableFooter && (
        <View style={{ flexDirection: "row", borderTop: BORDER_MAIN, minHeight: 20 }}>
          <View style={{ width: W.bloqueo + W.vmax + W.sitKm, backgroundColor: HIGHLIGHT_BG, justifyContent: "center", alignItems: "center", borderRight: BORDER_LIGHT }}>
            <Text style={{ fontSize: 11, fontFamily: "Helvetica-Bold", textAlign: "center" }}>
              {composition}
            </Text>
          </View>
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
            <Text style={{ fontSize: 11, fontFamily: "Helvetica-Bold", textAlign: "center" }}>
              {longueurMasse}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

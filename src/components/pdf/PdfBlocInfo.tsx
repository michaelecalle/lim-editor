import { View, Text, StyleSheet } from "@react-pdf/renderer";

type Props = {
  trainNumber: string;
  categorieEspagne: string;
  origine: string;
  destination: string;
  dateFormatted: string;
  composition: string;
  materiel: string;
  ligne: string;
  longueur: number | undefined;
  masse: number | undefined;
};

const s = StyleSheet.create({
  container: {
    border: "0.5pt solid #374151",
    marginBottom: 4,
  },
  row: {
    flexDirection: "row",
  },
  rowWithBorder: {
    flexDirection: "row",
    borderBottom: "0.5pt solid #374151",
  },
  cellBase: {
    padding: "4pt 5pt",
    justifyContent: "center",
    borderRight: "0.5pt solid #374151",
  },
  cellLast: {
    padding: "4pt 5pt",
    justifyContent: "center",
  },
  yellow: {
    backgroundColor: "#fffda6",
  },
  label: {
    fontSize: 6,
    color: "#6b7280",
    fontFamily: "Helvetica",
    marginBottom: 1,
  },
  valueSm: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
  },
  valueMd: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
  },
  valueLg: {
    fontSize: 20,
    fontFamily: "Helvetica-Bold",
  },
  ouigoCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#e3006a",
    alignItems: "center",
    justifyContent: "center",
  },
  ouigoText: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: "#ffffff",
    letterSpacing: 0.5,
  },
});

export default function PdfBlocInfo({
  trainNumber,
  categorieEspagne,
  origine,
  destination,
  dateFormatted,
  composition,
  materiel,
  ligne,
  longueur,
  masse,
}: Props) {
  const longMass =
    longueur != null && masse != null ? `${longueur}m — ${masse}t` : "—";

  return (
    <View style={s.container}>
      {/* Row 1 : TREN | TYPE | ORIGEN/DESTINO | FECHA */}
      <View style={s.rowWithBorder}>
        <View style={[s.cellBase, s.yellow, { width: 80 }]}>
          <Text style={s.label}>TREN</Text>
          <Text style={s.valueMd}>{trainNumber}</Text>
        </View>
        <View style={[s.cellBase, { width: 36 }]}>
          <Text style={s.label}>TYPE</Text>
          <Text style={s.valueSm}>{categorieEspagne || "—"}</Text>
        </View>
        <View style={[s.cellBase, { flex: 1 }]}>
          <Text style={s.label}>ORIGEN / DESTINO</Text>
          <Text style={s.valueMd}>
            {origine} — {destination}
          </Text>
        </View>
        <View style={[s.cellLast, s.yellow, { width: 155 }]}>
          <Text style={s.label}>FECHA</Text>
          <Text style={s.valueSm}>{dateFormatted}</Text>
        </View>
      </View>

      {/* Row 2 : LOGO | COMPOSICIÓN | MATERIAL + LÍNEA | LONGITUD — MASA */}
      <View style={s.row}>
        {/* Logo Ouigo */}
        <View
          style={[
            s.cellBase,
            { width: 46, alignItems: "center", justifyContent: "center", backgroundColor: "#50DCF5" },
          ]}
        >
          <View style={s.ouigoCircle}>
            <Text style={s.ouigoText}>OUIGO</Text>
          </View>
        </View>

        {/* Composition : bandeau label + valeur */}
        <View style={{ width: 54, borderRight: "0.5pt solid #374151", flexDirection: "column" }}>
          <View style={{ padding: "2pt 3pt", borderBottom: "0.5pt solid #374151" }}>
            <Text style={s.label}>COMPOSICIÓN</Text>
          </View>
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#fffda6" }}>
            <Text style={s.valueLg}>{composition}</Text>
          </View>
        </View>

        {/* Matériel + Ligne */}
        <View style={[s.cellBase, { flex: 1, justifyContent: "center" }]}>
          <Text style={{ fontSize: 9, fontFamily: "Helvetica" }}>
            MATERIAL: {materiel || "—"}
          </Text>
          <Text style={{ fontSize: 9, fontFamily: "Helvetica", marginTop: 2 }}>
            LÍNEA: {ligne || "—"}
          </Text>
        </View>

        {/* Longueur — Masse : bandeau label + valeur */}
        <View style={{ width: 155, flexDirection: "column" }}>
          <View style={{ padding: "2pt 3pt", borderBottom: "0.5pt solid #374151" }}>
            <Text style={s.label}>LONGITUD (m) — MASA (t)</Text>
          </View>
          <View style={{ flex: 1, justifyContent: "center", padding: "3pt 5pt" }}>
            <Text style={{ fontSize: 16, fontFamily: "Helvetica-Bold" }}>
              {longMass}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

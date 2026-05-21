import { Document, Page, StyleSheet, Font } from "@react-pdf/renderer";

Font.register({
  family: "DejaVu",
  fonts: [
    {
      src: "https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.3/ttf/DejaVuSans.ttf",
      fontWeight: "normal",
    },
    {
      src: "https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.3/ttf/DejaVuSans-Bold.ttf",
      fontWeight: "bold",
    },
  ],
});
import PdfBlocInfo from "./PdfBlocInfo";
import PdfBlocLtv from "./PdfBlocLtv";
import PdfBlocFt from "./PdfBlocFt";

export type PdfFtRow = {
  id: string;
  type: "data" | "note";
  bloqueo: string;
  vmax: string;
  sitKm: string;
  dependencia: string;
  com: string;
  hora: string;
  tecn: string;
  conc: string;
  radio: string;
  rampCaract: string;
  etcs: string;
  csv: boolean;
  notes: string[];
  // champs calculés pour le rendu
  showBloqueo: boolean;
  showBloqueoBar: boolean;
  showBloqueoText: boolean;
  bloqueoTextBelow: string; // texte à afficher dans la ligne intermédiaire suivante
  showRadio: boolean;
  showRadioBar: boolean;
  showRadioText: boolean;
  radioTextBelow: string;
  showVBar: boolean;
  showVmaxText: boolean;
  vmaxTextBelow: string;
  showRcBar: boolean;
  showRcText: boolean;
  rampCaractTextBelow: string;
  highlight: boolean;
};

export type PdfLtvRow = {
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

export type LimPdfProps = {
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
  ltvRows: PdfLtvRow[];
  ftRows: PdfFtRow[];
};

const PAGE_MARGIN = 20;
const FT_ROW_H = 16;
const LTV_ROW_H = 15;

function calcPageHeight(ltvCount: number, ftCount: number): number {
  const blocInfoH = 95;
  const ltvH = 58 + Math.max(ltvCount, 1) * LTV_ROW_H;
  const ftH = 40 + Math.max(ftCount, 1) * FT_ROW_H;
  return PAGE_MARGIN * 2 + blocInfoH + 6 + ltvH + 6 + ftH + 10;
}

const styles = StyleSheet.create({
  page: {
    padding: PAGE_MARGIN,
    fontFamily: "Helvetica",
    backgroundColor: "#ffffff",
  },
});

export default function LimPdf({
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
  ltvRows,
  ftRows,
}: LimPdfProps) {
  const pageHeight = calcPageHeight(ltvRows.length, ftRows.length);

  return (
    <Document>
      <Page size={[595, pageHeight]} style={styles.page}>
        <PdfBlocInfo
          trainNumber={trainNumber}
          categorieEspagne={categorieEspagne}
          origine={origine}
          destination={destination}
          dateFormatted={dateFormatted}
          composition={composition}
          materiel={materiel}
          ligne={ligne}
          longueur={longueur}
          masse={masse}
        />
        <PdfBlocLtv rows={ltvRows} />
        <PdfBlocFt rows={ftRows} />
      </Page>
    </Document>
  );
}

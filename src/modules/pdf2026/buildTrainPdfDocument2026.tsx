// src/modules/pdf2026/buildTrainPdfDocument2026.tsx
//
// Assemble le <Document> react-pdf complet (bloc info + LTV + FT paginé) pour UN
// train, format 2026. Extrait de `Normalise2026Tab.tsx::handlePreviewInfoPdf` pour
// être réutilisé aussi par l'export multi-trains (`PdfExportPanel2026.tsx`) — sans
// ça, la construction du document existerait à deux endroits et risquerait de
// diverger (piège déjà rencontré une fois sur ce projet avec les props PDF de
// l'ancien pipeline, cf. mémoire `project_lim_editor.md`).
import { Document, Page, StyleSheet } from "@react-pdf/renderer";
import PdfBlocInfo2026 from "../../components/pdf2026/PdfBlocInfo2026";
import PdfBlocLtv from "../../components/pdf/PdfBlocLtv";
import PdfBlocFt2026 from "../../components/pdf2026/PdfBlocFt2026";
import type { PdfLtvRow } from "../../components/pdf/LimPdf";
import { buildPdfInfoPropsForTrain2026, type Train2026Input, type LigneVersion2026Input } from "./buildPdfInfoPropsForTrain2026";
import { buildFtRows2026, type LignePointLike } from "./buildFtRows2026";
import { paginateFtRows2026 } from "./paginateFt2026";

export type LigneVersionForPdf2026 = LigneVersion2026Input & {
  sudNord: LignePointLike[];
  nordSud: LignePointLike[];
};

const styles = StyleSheet.create({ page: { padding: 20, fontFamily: "Helvetica" } });

export function buildTrainPdfDocument2026(
  train: Train2026Input,
  ligneVersion: LigneVersionForPdf2026,
  horaires: Record<string, { arrivee: string; passage: string; depart: string }>,
  ltvRows: PdfLtvRow[],
  ltvPublishedAt: string | null
): { document: JSX.Element; numeroPage1: string } {
  const { rows: ftRows, filteredLtvRows, numeroPage1 } = buildFtRows2026(
    ligneVersion[train.direction],
    train.direction,
    train.origine,
    train.destination,
    horaires,
    ltvRows,
    train.numeroEspagne,
    train.numeroFrance
  );
  const props = buildPdfInfoPropsForTrain2026(train, ligneVersion, numeroPage1);
  const ftSegments = paginateFtRows2026(ftRows, filteredLtvRows);

  const document = (
    <Document>
      <Page size="A4" style={styles.page}>
        <PdfBlocInfo2026 {...props} />
        <PdfBlocLtv rows={filteredLtvRows} publishedAt={ltvPublishedAt} />
        <PdfBlocFt2026 rows={ftSegments[0] ?? []} />
      </Page>
      {ftSegments.slice(1).map((seg, idx) => (
        <Page key={idx + 1} size="A4" style={styles.page}>
          <PdfBlocFt2026 rows={seg} />
        </Page>
      ))}
    </Document>
  );

  return { document, numeroPage1 };
}

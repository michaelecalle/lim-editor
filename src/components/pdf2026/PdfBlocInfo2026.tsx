// src/components/pdf2026/PdfBlocInfo2026.tsx
//
// Bloc info de l'export PDF au format 2026 — reproduit fidèlement l'en-tête du
// document source (feuilles train du classeur Excel ADIF/LFP/SNCF), PAS l'ancien
// format normalisé (cf. `../pdf/PdfBlocInfo.tsx`, conservé intact pour l'ancien
// export). Relevé cellule par cellule (fond/police/bordure/alignement) sur la
// feuille « 9704-5 » (train 9705) le 08/08 :
//   L1  A1:C1 = n° train seul (pas de label "TREN"), bleu marine #0A3C78, 18pt gras
//       D1:I1 = matériel + 3 catégories réseau (texte multicolore : nom du
//               matériel #067ED3, labels réseau #A2BFE6 pâle, codes #0A3C78)
//   L2  A2:D2 = origine <espaces> destination, bleu marine #0A3C78, 14pt gras,
//               UNE FLÈCHE DROITE (forme vectorielle) entre les deux noms
//       E2    = "Version NN du JJ/MM/AAAA", rose/rouge #E16E7D, aligné à GAUCHE
//   L3-5 col A = logo (badge "TGV inOui" PUIS silhouette du train, même largeur,
//                empilés — images extraites du classeur)
//        col D = triangle d'alerte + "Consulter DHLTV" — fond jaune pâle
//                #FFFF99, texte bordeaux #9B0C36, GRAS, 24pt
//        col E-I = mention(s) libres (ex. "Vitesses limites en rouge...") — fond
//                pêche (même remplissage que le surlignage des notes de
//                l'éditeur : thème 5, tint ~0.8), texte bordeaux #9B0C36, gras,
//                sur 2 lignes (retour à la ligne automatique)
// ⚠️ Contrairement à LIM (qui NE reproduit PAS ce bandeau, cf. mémoire projet),
// l'export PDF reproduit tout, mentions comprises — l'export vise la fidélité au
// document, pas l'ergonomie d'affichage à l'écran.
import { View, Text, Image, Svg, Path, StyleSheet } from "@react-pdf/renderer";
import logoBadge from "../../assets/pdf2026/logo-tgv-badge.png";
import logoTrain from "../../assets/pdf2026/logo-tgv-train.png";
import iconAlerte from "../../assets/pdf2026/icon-alerte.png";

export type PdfBlocInfo2026Props = {
  numero: string;
  materiel: string;
  categorieSNCF: string;
  categorieLFP: string;
  categorieADIF: string;
  origine: string;
  destination: string;
  numeroVersion: string;
  dateVigueur: string; // déjà formatée, ex. "04/08/2026"
  mentions: string[];
};

const BLEU_MARINE = "#0A3C78";
const ROUGE_VERSION = "#E16E7D";
const BORDEAUX = "#9B0C36";
// Même convention de bordures que les blocs LTV/FT (`PdfBlocLtv.tsx`,
// `PdfBlocFt2026.tsx`) : contour + séparateurs de section en 0.8pt, dividers
// de cellule internes en 0.5pt — uniformisé suite au retour utilisateur (09/08),
// ce bloc utilisait 0.5pt partout y compris son contour extérieur.
const BORDER_MAIN = "0.8pt solid #374151";
const BORDER_LIGHT = "0.5pt solid #374151";

// Largeurs/hauteurs des deux images empilées : même largeur, hauteur au ratio
// natif de chaque image (badge 110×54, silhouette 729×156).
const LOGO_WIDTH = 68;
// Largeur partagée par "Version" (ligne 2) et "remarques rouges" (ligne 3) —
// mêmes colonnes E-I dans le document source.
const RIGHT_COL_WIDTH = 160;
const LOGO_BADGE_H = (LOGO_WIDTH * 54) / 110;
const LOGO_TRAIN_H = (LOGO_WIDTH * 156) / 729;

const s = StyleSheet.create({
  container: {
    border: BORDER_MAIN,
    marginBottom: 4,
  },
  row: {
    flexDirection: "row",
    borderBottom: BORDER_MAIN,
  },
  rowLast: {
    flexDirection: "row",
  },
  cell: {
    padding: "4pt 6pt",
    justifyContent: "center",
    borderRight: BORDER_LIGHT,
  },
  cellLast: {
    padding: "4pt 6pt",
    justifyContent: "center",
  },
  numero: {
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
    color: BLEU_MARINE,
  },
  materielLine: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
  },
  origineDestRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  origineDest: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: BLEU_MARINE,
  },
  version: {
    fontSize: 9,
    fontFamily: "Helvetica",
    color: ROUGE_VERSION,
    textAlign: "left",
  },
  logoCol: {
    width: LOGO_WIDTH + 12,
    alignItems: "center",
    justifyContent: "center",
    padding: "4pt 6pt",
  },
  dhltvCell: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 4,
    backgroundColor: "#FFFF99",
  },
  dhltvText: {
    fontSize: 15,
    fontFamily: "Helvetica-Bold",
    color: BORDEAUX,
    textAlign: "center",
    textDecoration: "underline",
  },
  // Même largeur que la case "Version" (ligne 2) : dans le document source, les
  // deux cellules occupent EXACTEMENT les mêmes colonnes (E à I) — vérifié cellule
  // par cellule, corrigé suite au retour utilisateur du 08/08.
  mentionsCell: {
    width: RIGHT_COL_WIDTH,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#FBE2D5",
    padding: "4pt 8pt",
  },
  mentionText: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: BORDEAUX,
    textAlign: "center",
  },
});

// Flèche droite (forme "rightArrow" du document, ratio largeur/hauteur ≈ 2.3,
// queue rectangulaire + pointe triangulaire — vérifié visuellement sur le PDF
// source, plus large/massive qu'un simple chevron fin).
function FlecheDroite() {
  return (
    <Svg width={16} height={7} viewBox="0 0 16 7">
      <Path d="M0 2 H9 V0 L16 3.5 L9 7 V5 H0 Z" fill={BLEU_MARINE} />
    </Svg>
  );
}

export default function PdfBlocInfo2026({
  numero,
  materiel,
  categorieSNCF,
  categorieLFP,
  categorieADIF,
  origine,
  destination,
  numeroVersion,
  dateVigueur,
  mentions,
}: PdfBlocInfo2026Props) {
  return (
    <View style={s.container}>
      {/* Ligne 1 : n° train | matériel + 3 catégories */}
      <View style={s.row}>
        <View style={[s.cell, { width: 90, alignItems: "center" }]}>
          <Text style={s.numero}>{numero}</Text>
        </View>
        <View style={[s.cellLast, { flex: 1, alignItems: "center" }]}>
          <Text style={s.materielLine}>
            <Text style={{ color: "#067ED3" }}>{materiel}</Text>
            <Text style={{ color: "#A2BFE6" }}> {"     "}SNCF : </Text>
            <Text style={{ color: BLEU_MARINE }}>{categorieSNCF} - </Text>
            <Text style={{ color: "#A2BFE6" }}> LFP : </Text>
            <Text style={{ color: BLEU_MARINE }}>{categorieLFP} - </Text>
            <Text style={{ color: "#A2BFE6" }}> ADIF : </Text>
            <Text style={{ color: BLEU_MARINE }}>{categorieADIF}</Text>
          </Text>
        </View>
      </View>

      {/* Ligne 2 : origine → destination | version + date */}
      <View style={s.row}>
        <View style={[s.cell, { flex: 1, alignItems: "center" }]}>
          <View style={s.origineDestRow}>
            <Text style={s.origineDest}>{origine}</Text>
            <FlecheDroite />
            <Text style={s.origineDest}>{destination}</Text>
          </View>
        </View>
        <View style={[s.cellLast, { width: RIGHT_COL_WIDTH }]}>
          <Text style={s.version}>
            Version {numeroVersion} du {dateVigueur}
          </Text>
        </View>
      </View>

      {/* Ligne 3 : logo (badge + silhouette empilés) | alerte + DHLTV | mentions */}
      <View style={s.rowLast}>
        <View style={[s.logoCol, { borderRight: BORDER_LIGHT }]}>
          <Image src={logoBadge} style={{ width: LOGO_WIDTH, height: LOGO_BADGE_H }} />
          <Image src={logoTrain} style={{ width: LOGO_WIDTH, height: LOGO_TRAIN_H, marginTop: 2 }} />
        </View>
        <View style={[s.dhltvCell, { borderRight: BORDER_LIGHT }]}>
          <Image src={iconAlerte} style={{ width: 16, height: 16 }} />
          <Text style={s.dhltvText}>Consulter DHLTV</Text>
        </View>
        <View style={s.mentionsCell}>
          {mentions.map((m, i) => (
            <Text key={i} style={s.mentionText}>
              {m}
            </Text>
          ))}
        </View>
      </View>
    </View>
  );
}

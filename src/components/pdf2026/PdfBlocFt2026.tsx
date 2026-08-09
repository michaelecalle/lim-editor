// src/components/pdf2026/PdfBlocFt2026.tsx
//
// Bloc FT (tableau principal) au format 2026. Duplique fidèlement le rendu de
// `../pdf/PdfBlocFt.tsx` (barres Bloc/Radio/Rampe, système CSV bas/plein/haut) —
// PAS reconstruit, cf. commentaire de `buildFtRows2026.ts`. Changements réels :
// 3 colonnes horaires Arr/Pass/Dép (au lieu de Com/Hora/Técn/Conc calculées), pas de
// calcul d'heure virtuelle. ⚠️ PREMIER JET SANS PAGINATION (demande explicite,
// 08/08 très tard) : pas de ligne "context" de raccord de page, react-pdf gère un
// débordement multi-page basique par défaut.
import { View, Text, Svg, Path, StyleSheet } from "@react-pdf/renderer";
import type { PdfFtRow2026 } from "../../modules/pdf2026/buildFtRows2026";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TextNL = Text as any;

type Props = {
  rows: PdfFtRow2026[];
};

const BORDER_MAIN = "0.8pt solid #374151";
const BORDER_LIGHT = "0.5pt solid #374151";
const HIGHLIGHT_BG = "#fde047";
const CSV_BG = "#fb923c";
const NOTE_BG = "#fbe2d5"; // même pêche que le surlignage des notes dans l'éditeur
// En-tête : fond rose pâle uniforme (mesuré sur le document source : #F8E0E3
// sur TOUTES les colonnes y compris Bloc) + texte bleu marine, pas le gris
// #374151 utilisé par erreur au 1er jet — corrigé suite au retour utilisateur (09/08).
const HEADER_BG = "#F8E0E3";
const BLEU_MARINE = "#0A3C78";

const W = {
  bloc: 44,
  vmax: 28,
  km: 44,
  arr: 30,
  pass: 30,
  dep: 30,
  radio: 44,
  rampe: 34,
  etcs: 28,
} as const;

const s = StyleSheet.create({
  container: { border: BORDER_MAIN },
  headerRow: { flexDirection: "row", backgroundColor: HEADER_BG, borderBottom: BORDER_MAIN, minHeight: 20 },
  dataRow: { flexDirection: "row", minHeight: 16 },
  intermediateRow: { flexDirection: "row", minHeight: 16 },
  cell: {
    padding: "2pt 3pt",
    fontSize: 9,
    fontFamily: "Helvetica",
    borderRight: BORDER_LIGHT,
    justifyContent: "center",
  },
  cellLast: { padding: "2pt 3pt", fontSize: 9, fontFamily: "Helvetica", justifyContent: "center" },
  headerText: { fontSize: 8, fontFamily: "Helvetica-Bold", color: BLEU_MARINE, textAlign: "center" },
});

function HeaderCell({ label, width, flex, last = false }: { label: string; width?: number; flex?: number; last?: boolean }) {
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

// En-tête Rampe : le document source n'a pas de texte, juste une flèche
// diagonale montante — le glyphe Unicode "↗" ne s'affiche pas en Helvetica
// standard (rendu "—" à l'écran), donc dessinée en vectoriel comme la flèche
// origine→destination du bloc info (`PdfBlocInfo2026.tsx::FlecheDroite`).
function FlecheOblique() {
  return (
    <Svg width={9} height={9} viewBox="0 0 16 7" style={{ transform: "rotate(-45deg)" }}>
      <Path d="M0 2 H9 V0 L16 3.5 L9 7 V5 H0 Z" fill={BLEU_MARINE} />
    </Svg>
  );
}

// Largeur texte dispo dans la cellule Établissements (flex:1), même calcul que
// l'ancien bloc — colonnes fixes un peu différentes (3 colonnes horaires au lieu de
// 4), recalculé en conséquence.
const DEP_INNER_W = 199;
const BOLD9_CHAR_W = 5.74;
const DOT9_W = 2.59;

function dotLeader(name: string): string {
  const free = DEP_INNER_W - name.length * BOLD9_CHAR_W;
  return ".".repeat(Math.max(3, Math.floor(free / DOT9_W)));
}

const BAR_STYLE = { height: 1.5, backgroundColor: "#111827", marginLeft: -3, marginRight: -3 } as const;
// Bloc : sur le document source, les séparations de zone sont en tirets bleus
// (pas le barreau noir plein des autres colonnes) et la valeur elle-même est
// bleue — confirmé par inspection du fichier Excel source (connecteurs
// "Connecteur droit" avec prstDash="dash", couleur #067ED3, XML brut de
// xl/drawings). Les petites flèches pointe-en-bas décoratives au milieu de
// chaque zone (repère de continuité) sont un artefact de pagination —
// reportées à la passe pagination, cf. mémoire projet.
const BLOC_BLUE = "#067ED3";
const BLOC_BAR_STYLE = {
  borderTopWidth: 1.2,
  borderTopStyle: "dashed",
  borderTopColor: BLOC_BLUE,
  marginLeft: -3,
  marginRight: -3,
} as const;

function SepBar() {
  return <View style={{ ...BAR_STYLE, marginBottom: 1 }} />;
}

// Radio et ETCS : sur le document source, la valeur est entourée d'un petit
// cercle (Ⓖ, ①) — confirmé visuellement par l'utilisateur sur le PDF source.
function CircledValue({ value }: { value: string }) {
  if (value === "") return null;
  return (
    <View
      style={{
        width: 11,
        height: 11,
        borderRadius: 6,
        border: "0.6pt solid #111827",
        alignItems: "center",
        justifyContent: "center",
        alignSelf: "center",
      }}
    >
      <Text style={{ fontSize: 7, fontFamily: "Helvetica" }}>{value}</Text>
    </View>
  );
}

function NoteLine({ text }: { text: string }) {
  return (
    <Text style={{ fontSize: 6, fontFamily: "Helvetica-Oblique", color: "#dc2626", marginTop: 1 }}>
      {text}
    </Text>
  );
}

// LTV intégrées à la fiche train : même couleur/style que l'ancien pipeline
// (`PdfBlocFt.tsx::OrangeLine`, orange #f97316, italique) — police Helvetica
// standard ici (pas de DejaVu chargée), donc "→" remplacé par "->" dans le
// texte lui-même (cf. `buildFtRows2026.ts`).
function LtvLine({ text }: { text: string }) {
  return (
    <Text style={{ fontSize: 6, fontFamily: "Helvetica-Oblique", color: "#f97316", marginTop: 1 }}>
      {text}
    </Text>
  );
}

export default function PdfBlocFt2026({ rows }: Props) {
  return (
    <View style={s.container}>
      <View style={s.headerRow}>
        <HeaderCell label="Bloc" width={W.bloc} />
        <HeaderCell label="Vmax" width={W.vmax} />
        <HeaderCell label="KM" width={W.km} />
        <HeaderCell label="Établissements" flex={1} />
        <HeaderCell label="Arr" width={W.arr} />
        <HeaderCell label="Pass" width={W.pass} />
        <HeaderCell label="Dép" width={W.dep} />
        <HeaderCell label="Radio" width={W.radio} />
        {/* Rampe (pente) : le document source n'a pas de texte ici, juste une
            flèche oblique montante — corrigé suite au retour utilisateur (09/08),
            "Rampe Caract" n'existe plus dans le nouveau format */}
        <View style={[s.cell, { width: W.rampe, alignItems: "center", justifyContent: "center" }]}>
          <FlecheOblique />
        </View>
        {/* ETCS : colonne SANS en-tête sur le document source (confirmé par
            investigation directe du fichier Excel, cf. mémoire projet — "colonne
            décalée", aucun libellé) */}
        <HeaderCell label="" width={W.etcs} last />
      </View>

      {(() => {
        // Ligne intermédiaire "en attente" : portée par une ligne de donnée qui a
        // encore un texte/barre à afficher au-dessous, mais dont l'insertion est
        // REPORTÉE après toute note "en-dessous" qui suit immédiatement — sinon la
        // note se retrouve poussée vers la ligne SUIVANTE au lieu de rester collée à
        // la ligne PRÉCÉDENTE (bug trouvé le 09/08, signalé par l'utilisateur : les
        // notes à intervalle de KM doivent coller à la ligne d'avant, comme dans
        // l'éditeur — la ligne intermédiaire vide s'intercalait avant la note).
        const elements: React.ReactNode[] = [];
        let pending: PdfFtRow2026 | null = null;

        const flushPending = () => {
          if (!pending) return;
          const row = pending;
          elements.push(
            <View key={`inter-${row.id}`} style={s.intermediateRow}>
              <View style={[s.cell, { width: W.bloc }]}>
                {row.blocTextBelow !== "" && (
                  <Text style={{ fontSize: 9, fontFamily: "Helvetica", textAlign: "center", color: BLOC_BLUE }}>{row.blocTextBelow}</Text>
                )}
              </View>
              <View style={[s.cell, { width: W.vmax, backgroundColor: row.csvHighlight !== "none" && row.csv ? CSV_BG : undefined }]}>
                {row.vmaxTextBelow !== "" && (
                  <Text style={{ fontSize: 9, fontFamily: "Helvetica", textAlign: "center" }}>{row.vmaxTextBelow}</Text>
                )}
              </View>
              <View style={[s.cell, { width: W.km }]} />
              <View style={[s.cell, { flex: 1 }]}>
                {row.ltvNote !== "" &&
                  row.ltvNote.split("\n").map((line, idx) => <LtvLine key={idx} text={line} />)}
              </View>
              <View style={[s.cell, { width: W.arr }]} />
              <View style={[s.cell, { width: W.pass }]} />
              <View style={[s.cell, { width: W.dep }]} />
              <View style={[s.cell, { width: W.radio }]}>
                <CircledValue value={row.radioTextBelow} />
              </View>
              <View style={[s.cell, { width: W.rampe }]}>
                {row.rampeTextBelow !== "" && (
                  <Text style={{ fontSize: 9, fontFamily: "Helvetica", textAlign: "center" }}>{row.rampeTextBelow}</Text>
                )}
              </View>
              <View style={[s.cellLast, { width: W.etcs }]}>
                <CircledValue value={row.etcsTextBelow} />
              </View>
            </View>
          );
          pending = null;
        };

        rows.forEach((row, i) => {
        if (row.type === "note") {
          elements.push(
            <View key={row.id} style={s.intermediateRow}>
              <View style={[s.cell, { width: W.bloc }]} />
              <View
                style={[
                  s.cell,
                  { width: W.vmax, backgroundColor: row.csvHighlight !== "none" ? CSV_BG : row.notesSurlignees ? NOTE_BG : undefined },
                ]}
              />
              <View style={[s.cell, { width: W.km, backgroundColor: row.notesSurlignees ? NOTE_BG : undefined }]} />
              <View style={[s.cell, { flex: 1, backgroundColor: row.notesSurlignees ? NOTE_BG : undefined }]}>
                {row.notes.map((line, idx) => (
                  <NoteLine key={idx} text={line} />
                ))}
              </View>
              <View style={[s.cell, { width: W.arr }]} />
              <View style={[s.cell, { width: W.pass }]} />
              <View style={[s.cell, { width: W.dep }]} />
              <View style={[s.cell, { width: W.radio }]} />
              <View style={[s.cell, { width: W.rampe }]} />
              <View style={[s.cellLast, { width: W.etcs }]} />
            </View>
          );
          return;
        }

        flushPending();

        const hasNextDataRow = rows.slice(i + 1).some((r) => r.type === "data");
        const hl = row.highlight;
        const hlBg = hl ? HIGHLIGHT_BG : undefined;
        const hasStation = row.etablissement.trim() !== "";

        elements.push(
          <View key={row.id} style={s.dataRow}>
            {/* Bloc : barre en tirets bleus au 1er changement (source : ligne
                bleue pointillée, pas le barreau noir plein des autres
                colonnes), texte au milieu du groupe en bleu */}
            <View style={[s.cell, { width: W.bloc }]}>
              {row.showBlocBar && <View style={BLOC_BAR_STYLE} />}
              {row.showBlocText && (
                <Text style={{ fontSize: 9, fontFamily: "Helvetica", textAlign: "center", color: BLOC_BLUE }}>{row.bloc}</Text>
              )}
            </View>

            {/* V Max : barre si changement + fond orange CSV (3 états bas/plein/haut) */}
            <View style={[s.cell, { width: W.vmax, backgroundColor: row.csvHighlight === "full" ? CSV_BG : undefined }]}>
              {row.csvHighlight === "lower" && (
                <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 8, backgroundColor: CSV_BG }} />
              )}
              {row.csvHighlight === "upper" && (
                <View style={{ position: "absolute", top: 0, left: 0, right: 0, height: 8, backgroundColor: CSV_BG }} />
              )}
              {row.showVBar && <SepBar />}
              {row.showVmaxText && (
                <Text style={{ fontSize: 9, fontFamily: row.csv ? "Helvetica-Bold" : "Helvetica", textAlign: "center" }}>
                  {row.vmaxDisplayValue}
                </Text>
              )}
            </View>

            {/* KM (empilé si transition réseau) — pas de surlignage ici (uniquement
                Établissements + Arrivée + Départ, demande utilisateur) */}
            <View style={[s.cell, { width: W.km }]}>
              <Text style={{ fontSize: 9, fontFamily: hl ? "Helvetica-Bold" : "Helvetica", textAlign: "center" }}>
                {row.km}
              </Text>
            </View>

            {/* Établissements */}
            <View style={[s.cell, { flex: 1, backgroundColor: hlBg }]}>
              <TextNL
                numberOfLines={1}
                style={{
                  fontSize: 9,
                  fontFamily: hl ? "Helvetica-Bold" : "Helvetica",
                  color: hasStation ? "#111827" : "#6b7280",
                }}
              >
                {hasStation && hl ? row.etablissement + dotLeader(row.etablissement) : row.etablissement}
              </TextNL>
            </View>

            {/* Arr / Pass / Dép */}
            <View style={[s.cell, { width: W.arr, backgroundColor: hlBg }]}>
              {row.arrivee !== "" && (
                <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold", textAlign: "center" }}>{row.arrivee}</Text>
              )}
            </View>
            <View style={[s.cell, { width: W.pass, backgroundColor: hlBg }]}>
              {row.passage !== "" && (
                <Text style={{ fontSize: 9, fontFamily: "Helvetica", textAlign: "center" }}>{row.passage}</Text>
              )}
            </View>
            <View style={[s.cell, { width: W.dep, backgroundColor: hlBg }]}>
              {row.depart !== "" && (
                <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold", textAlign: "center" }}>{row.depart}</Text>
              )}
            </View>

            {/* Radio : valeur entourée d'un cercle sur le document source (Ⓖ) */}
            <View style={[s.cell, { width: W.radio }]}>
              {row.showRadioBar && <View style={BAR_STYLE} />}
              {row.showRadioText && <CircledValue value={row.radio} />}
            </View>

            {/* Rampe */}
            <View style={[s.cell, { width: W.rampe }]}>
              {row.showRampeBar && <View style={BAR_STYLE} />}
              {row.showRampeText && (
                <Text style={{ fontSize: 9, fontFamily: "Helvetica", textAlign: "center" }}>{row.rampe}</Text>
              )}
            </View>

            {/* ETCS : barre au 1er changement, texte au milieu du groupe — même
                principe que Bloc/Radio/Rampe (demande utilisateur, 09/08) ;
                valeur entourée d'un cercle sur le document source (①) */}
            <View style={[s.cellLast, { width: W.etcs }]}>
              {row.showEtcsBar && <View style={BAR_STYLE} />}
              {row.showEtcsText && <CircledValue value={row.etcs} />}
            </View>
          </View>
        );
        pending = hasNextDataRow ? row : null;
        });
        flushPending();
        return elements;
      })()}
    </View>
  );
}

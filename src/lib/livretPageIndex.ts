// src/lib/livretPageIndex.ts
//
// Construit l'index « numéro de train → 1re page » d'un livret FT complet (PDF
// contenant tous les trains à la suite), pour que LIM puisse en mode secours
// sauter directement à la bonne page au lieu d'afficher tout le classeur
// (demande utilisateur, 12/08). Même moteur pdf.js que ltvPdfParser.ts.
//
// Signal utilisé : chaque page commence par « <numéro> TGV 2N2 ... » (vérifié
// sur le livret réel — un train sur plusieurs pages répète son numéro sur
// CHACUNE, donc on ne garde que la 1re occurrence). Recherché n'importe où
// dans le texte de la page (pas seulement en tête) : l'ordre des items rendus
// par pdf.js ne suit pas toujours l'ordre de lecture visuel.
import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

if (!(pdfjsLib as any).GlobalWorkerOptions.workerSrc) {
  (pdfjsLib as any).GlobalWorkerOptions.workerSrc = workerUrl;
}

const TRAIN_HEADER_RE = /(\d{3,6})\s+TGV\s*2N2/;

export type LivretPageIndex = Record<string, number>; // numéro de train -> 1re page (1-indexée)

export async function buildLivretPageIndex(file: File): Promise<LivretPageIndex> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const doc = await Promise.race([
    loadingTask.promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => {
        loadingTask.destroy();
        reject(new Error("Extraction impossible (moteur PDF non disponible — vérifiez la connexion réseau)."));
      }, 15_000)
    ),
  ]);

  const index: LivretPageIndex = {};
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const text = content.items.map((it) => ("str" in it ? it.str : "")).join(" ");
    const m = text.match(TRAIN_HEADER_RE);
    if (m && !(m[1] in index)) index[m[1]] = p;
  }
  return index;
}

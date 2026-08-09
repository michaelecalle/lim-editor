// Sonde : formes flottantes orange (CSV) de CT→PPN — ancrages + texte.
import JSZip from "jszip";
import { readFileSync } from "node:fs";

const PATH = "C:/Users/micha/Dropbox/LIM/logs/Logs2/Livret/FT_TGV_INOUI_BCW-PPN 04-08-2026_20260807_085437.xlsx";
const zip = await JSZip.loadAsync(readFileSync(PATH));

// 1) nom de feuille -> fichier sheetN.xml (workbook + rels)
const workbook = await zip.file("xl/workbook.xml").async("string");
const wbRels = await zip.file("xl/_rels/workbook.xml.rels").async("string");
const sheets = [...workbook.matchAll(/<sheet name="([^"]+)"[^>]*r:id="(rId\d+)"/g)].map((m) => ({ name: m[1], rid: m[2] }));
const relMap = new Map([...wbRels.matchAll(/Id="(rId\d+)"[^>]*Target="([^"]+)"/g)].map((m) => [m[1], m[2]]));
for (const s of sheets) console.log(s.name, "→", relMap.get(s.rid));

// 2) pour CT→PPN : drawing lié + formes orange
const target = sheets.find((s) => s.name === "CT→PPN");
const sheetFile = "xl/" + relMap.get(target.rid).replace(/^\//, "");
const sheetRelsPath = sheetFile.replace(/worksheets\//, "worksheets/_rels/") + ".rels";
const sheetRels = await zip.file(sheetRelsPath).async("string");
const drawingTarget = [...sheetRels.matchAll(/Type="[^"]*\/drawing"[^>]*Target="([^"]+)"/g)].map((m) => m[1])[0]
  ?? [...sheetRels.matchAll(/Target="([^"]*drawing[^"]*)"/g)].map((m) => m[1])[0];
console.log("\nfeuille:", sheetFile, "→ drawing:", drawingTarget);
const drawingFile = "xl/drawings/" + drawingTarget.split("/").pop();
const xml = await zip.file(drawingFile).async("string");

const anchors = xml.match(/<xdr:twoCellAnchor[\s\S]*?<\/xdr:twoCellAnchor>/g) ?? [];
console.log(anchors.length, "ancres au total ; formes FFC000 :");
for (const a of anchors) {
  if (!a.includes("FFC000")) continue;
  const from = a.match(/<xdr:from><xdr:col>(\d+)<\/xdr:col>.*?<xdr:row>(\d+)<\/xdr:row>/s);
  const to = a.match(/<xdr:to><xdr:col>(\d+)<\/xdr:col>.*?<xdr:row>(\d+)<\/xdr:row>/s);
  const texts = [...a.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]).join("");
  console.log(`  col ${from[1]} lignes ${Number(from[2]) + 1}→${Number(to[2]) + 1} (1-based) | texte: "${texts}"`);
}

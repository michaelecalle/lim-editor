export type CsvZone = {
  pkStart: string;
  pkEnd: string;
  csvTrueIds: string[]; // IDs des lignes csv:true dans la zone
  endId: string;        // ID de la première ligne csv:false après la zone
  startsAtFirstLine: boolean; // Zone commence dès la première ligne affichée → pas de changement antérieur
};

type Direction = "sudNord" | "nordSud";

type CsvRow = {
  id: string;
  csv: boolean;
  pkInterne: string;
  type?: "data" | "note";
};

export function detectCsvZones(
  rows: CsvRow[],
  direction: Direction
): CsvZone[] {
  if (rows.length === 0) return [];

  // Filtrer pour ne garder que les data rows (ignorer les notes)
  const dataRows = rows.filter(row => row.type !== "note");

  // Trier par pkInterne selon la direction
  const sorted = [...dataRows].sort((a, b) => {
    const pkA = parseFloat(a.pkInterne);
    const pkB = parseFloat(b.pkInterne);
    return direction === "sudNord" ? pkA - pkB : pkB - pkA;
  });

  const zones: CsvZone[] = [];
  let currentZoneStart: number | null = null;
  let currentZoneTrueIds: string[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const row = sorted[i];

    if (row.csv) {
      if (currentZoneStart === null) {
        currentZoneStart = i;
      }
      currentZoneTrueIds.push(row.id);
    } else {
      if (currentZoneStart !== null) {
        zones.push({
          pkStart: sorted[currentZoneStart].pkInterne,
          pkEnd: row.pkInterne,
          csvTrueIds: [...currentZoneTrueIds],
          endId: row.id,
          startsAtFirstLine: currentZoneStart === 0,
        });
        currentZoneStart = null;
        currentZoneTrueIds = [];
      }
    }
  }

  // Zone ouverte en fin de tableau (borne de fin hors du slice)
  if (currentZoneStart !== null && currentZoneTrueIds.length > 0) {
    zones.push({
      pkStart: sorted[currentZoneStart].pkInterne,
      pkEnd: "",
      csvTrueIds: [...currentZoneTrueIds],
      endId: "",
      startsAtFirstLine: currentZoneStart === 0,
    });
  }

  return zones;
}

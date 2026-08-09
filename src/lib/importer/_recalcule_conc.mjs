// Recalcule TOUS les `conc` du staging selon la convention de l'ancien fichier :
//   conc = (hora − com si arrêt) − hora du point horodaté précédent (ordre de MARCHE),
//   premier point horodaté du train : pas de conc.
// Les valeurs qui changent sont listées — attendu : uniquement en aval des points
// horodatés qu'on vient d'insérer (PCA, tête sud 9710, Limite LGV-RAC ×4).
import { readFileSync, writeFileSync } from "node:fs";

const STAGING = "S:/Dev/lim-editor/_maj_normalise_2026-08-08";
const doc = JSON.parse(readFileSync(`${STAGING}/ligneFT.normalized.json`, "utf8"));

// sens de marche : sudNord = ordre stocké (PK croissants) ; nordSud = ordre inverse.
const TRAINS = [
  ["9705", "sudNord", false],
  ["9707", "sudNord", false],
  ["9709", "sudNord", false],
  ["39819", "sudNord", false],
  ["9710", "nordSud", true],
  ["9712", "nordSud", true],
  ["9714", "nordSud", true],
  ["38510", "nordSud", true],
];

const toMin = (s) => {
  const m = String(s ?? "").trim().match(/^(\d{1,2}):(\d{2})$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

let changes = 0, unchanged = 0, created = 0;
for (const [train, section, reversed] of TRAINS) {
  const rows = doc[section].rows.filter((r) => r.type === "data");
  const ordered = reversed ? [...rows].reverse() : rows;
  const t = doc.trains[train];
  const variants = Array.isArray(t.variants) ? t.variants : [t];
  for (let vi = 0; vi < variants.length; vi++) {
    const byRowKey = variants[vi].byRowKey ?? {};
    let prev = null;
    for (const row of ordered) {
      const entry = byRowKey[row.rowKey];
      const hora = toMin(entry?.hora);
      if (hora == null) continue;
      const com = entry?.com ? Number(entry.com) : 0;
      const arrivee = hora - com;
      if (prev == null) {
        if (entry.conc != null) {
          console.log(`~ ${train}${vi ? `(v${vi})` : ""} ${row.sitKm} ${row.dependencia || ""} : conc "${entry.conc}" supprimé (premier point horodaté)`);
          delete entry.conc;
          changes++;
        }
      } else {
        let diff = arrivee - prev;
        if (diff < 0) diff += 24 * 60;
        const next = String(diff);
        if (entry.conc == null) {
          entry.conc = next;
          created++;
        } else if (entry.conc !== next) {
          console.log(`~ ${train}${vi ? `(v${vi})` : ""} ${row.sitKm} ${row.dependencia || "(sans nom)"} : conc "${entry.conc}" → "${next}"`);
          entry.conc = next;
          changes++;
        } else {
          unchanged++;
        }
      }
      prev = hora;
    }
  }
}
console.log(`\n${unchanged} conc inchangés (règle confirmée), ${changes} corrigés, ${created} créés (nouveaux points)`);

const buildTs = (d) =>
  `import type { LigneFTNormalized } from "../types/ligneFTNormalized";\n\nexport const LIGNE_FT_NORMALIZED: LigneFTNormalized = ${JSON.stringify(d, null, 2)};\n`;
writeFileSync(`${STAGING}/ligneFT.normalized.json`, JSON.stringify(doc, null, 2));
writeFileSync(`${STAGING}/ligneFT.normalized.ts`, buildTs(doc));
console.log(`Staging mis à jour dans ${STAGING}`);

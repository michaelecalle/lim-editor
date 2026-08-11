// Chemins de publication du format 2026 — DÉLIBÉRÉMENT séparés de l'ancien
// format (`src/lib/ligneft/constants.ts`, jamais touché) pour que les deux
// fichiers cohabitent le temps de la transition (demande utilisateur, 09/08).
// Repo cible principal : le repo lim-editor lui-même ("editor"), même token
// GitHub déjà configuré.
export const ACTIVE_2026_JSON_FILE_PATH = "src/data/ligneFT2026.normalized.json";

// Publication miroir vers le repo LIM2 (cible "lim2", déjà configurée/utilisée
// par l'ancien format — cf. LIM2_ACTIVE_FILE_PATH dans ../ligneft/constants.ts)
// — demande utilisateur 11/08 : LIM garde un fichier EMBARQUÉ (statique, importé
// au build), jamais chargé par le réseau en cabine. JSON brut (pas de wrapper
// .ts) : Vite sait importer un .json statiquement, plus simple à générer.
export const LIM2_ACTIVE_2026_JSON_FILE_PATH = "src/data/normalized/ligneFT2026.normalized.json";

export const ARCHIVES_2026_DIR_PATH = "src/data/archives/ligneft2026";

export const MAX_ARCHIVES_2026 = 10;

import type { GithubTarget } from "./ligneft/github.js";

// Registre des documents PDF gérés par l'éditeur.
// Source de vérité = lim-logs (logsPath). Tant qu'un document n'y est pas encore publié,
// on retombe sur le fichier statique actuel de LIM2 (fallback*), pour ne jamais avoir de trou.
export type ManagedDoc = {
  key: string;
  // Chemin canonique dans lim-logs (le nom NE dépend PAS du fichier uploadé).
  logsPath: string;
  // Repli : fichier statique LIM2 (repo + chemin) pour la date.
  fallbackTarget: GithubTarget;
  fallbackPath: string;
  // Repli : URL publique statique LIM2 (pour l'aperçu via redirection).
  fallbackUrl: string;
  // Index optionnel « numéro de train → page » publié À CÔTÉ du PDF (lim-logs),
  // pour les documents multi-trains où LIM doit sauter à la bonne page en mode
  // secours plutôt que d'afficher tout le classeur (livret FT, 12/08).
  pageIndexPath?: string;
};

export const MANAGED_DOCS: Record<string, ManagedDoc> = {
  manuel: {
    key: "manuel",
    logsPath: "documents/manuel-utilisateur.pdf",
    fallbackTarget: "lim2",
    fallbackPath: "public/manuel-utilisateur-lim.pdf",
    fallbackUrl: "https://lim2.vercel.app/manuel-utilisateur-lim.pdf",
  },
  "guia-bsn": {
    key: "guia-bsn",
    logsPath: "documents/guia-bsn.pdf",
    fallbackTarget: "lim2",
    fallbackPath: "public/guia-bsn.pdf",
    fallbackUrl: "https://lim2.vercel.app/guia-bsn.pdf",
  },
  "livret-ft": {
    key: "livret-ft",
    logsPath: "documents/livret-ft.pdf",
    fallbackTarget: "lim2",
    fallbackPath: "public/livret-ft.pdf",
    fallbackUrl: "https://lim2.vercel.app/livret-ft.pdf",
    pageIndexPath: "documents/livret-ft.pages.json",
  },
};

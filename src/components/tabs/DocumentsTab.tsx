import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type ChangeEvent,
} from "react";
import { buildLivretPageIndex } from "../../lib/livretPageIndex";

// ISO → "28 juin 2026 à 08h00"
function formatFrDateTime(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const date = d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  const time = d
    .toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
    .replace(":", "h");
  return `${date} à ${time}`;
}

// Fichier → base64 (sans le préfixe data:).
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// Document géré : docKey pilote l'aperçu (proxy), la date et la publication.
// Sans docKey = colonne en attente (placeholder).
type DocSlot = {
  key: string;
  title: string;
  docKey?: string;
  // Document multi-trains : à l'upload, calcule aussi l'index « train → page »
  // publié à côté du PDF (livret FT, 12/08 — LIM sautera à la bonne page en
  // mode secours au lieu d'afficher tout le classeur).
  needsPageIndex?: boolean;
};

const DOC_SLOTS: DocSlot[] = [
  { key: "manuel", title: "Manuel utilisateur", docKey: "manuel" },
  { key: "guia-bsn", title: "Guia BSN", docKey: "guia-bsn" },
  { key: "livret-ft", title: "Livret FT", docKey: "livret-ft", needsPageIndex: true },
  { key: "autre", title: "Autre document" },
];

type UploadStatus = "idle" | "uploading" | "success" | "error";

function DocumentColumn({ slot }: { slot: DocSlot }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [autoDate, setAutoDate] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0); // bump → recharge l'aperçu
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [statusMsg, setStatusMsg] = useState("");

  // Récupère la date de dernière mise à jour (re-déclenché après un upload via reloadKey).
  useEffect(() => {
    if (!slot.docKey) return;
    let cancelled = false;
    fetch(`/api/documents/last-update?doc=${encodeURIComponent(slot.docKey)}`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled || !j?.ok || !j.date) return;
        const formatted = formatFrDateTime(j.date as string);
        if (formatted) setAutoDate(formatted);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [slot.docKey, reloadKey]);

  const dateLabel = autoDate ?? "non disponible";
  const previewSrc = slot.docKey
    ? `/api/documents/get?doc=${encodeURIComponent(slot.docKey)}&v=${reloadKey}`
    : null;

  const openPicker = () => inputRef.current?.click();

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    if (f) {
      setFile(f);
      setStatus("idle");
      setStatusMsg("");
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const f = e.dataTransfer.files?.[0] ?? null;
    if (f) {
      setFile(f);
      setStatus("idle");
      setStatusMsg("");
    }
  };

  const handleUpload = async () => {
    if (!file || !slot.docKey) return;
    setStatus("uploading");
    setStatusMsg("");
    try {
      let pageIndex: Record<string, number> | undefined;
      if (slot.needsPageIndex) {
        setStatusMsg("Analyse des pages…");
        pageIndex = await buildLivretPageIndex(file);
        if (Object.keys(pageIndex).length === 0) {
          throw new Error(
            "Aucun numéro de train détecté dans le PDF — vérifie qu'il s'agit bien du livret complet."
          );
        }
      }
      const fileBase64 = await fileToBase64(file);
      const res = await fetch("/api/documents/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doc: slot.docKey, fileBase64, pageIndex }),
      });
      const j = await res.json();
      if (!res.ok || !j?.ok) {
        throw new Error(j?.error?.message ?? "Échec de la publication");
      }
      setStatus("success");
      setStatusMsg(
        pageIndex ? `Document mis à jour (${Object.keys(pageIndex).length} trains détectés).` : "Document mis à jour."
      );
      setFile(null);
      setReloadKey((k) => k + 1); // recharge aperçu + date
    } catch (err) {
      setStatus("error");
      setStatusMsg(err instanceof Error ? err.message : "Erreur lors de l'upload");
    }
  };

  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        padding: 16,
        border: "1px solid #d1d5db",
        borderRadius: 16,
        background: "#ffffff",
      }}
    >
      <div style={{ fontSize: 16, fontWeight: 700, color: "#111827" }}>{slot.title}</div>

      {/* Aperçu du document en cours */}
      {previewSrc ? (
        <iframe
          title={`Aperçu ${slot.title}`}
          src={previewSrc}
          style={{
            width: "100%",
            maxWidth: 340,
            margin: "0 auto",
            aspectRatio: "210 / 297", // A4 portrait
            border: "1px solid #d1d5db",
            borderRadius: 12,
            background: "#ffffff",
          }}
        />
      ) : (
        <div
          style={{
            width: "100%",
            maxWidth: 340,
            margin: "0 auto",
            aspectRatio: "210 / 297",
            border: "1px dashed #d1d5db",
            borderRadius: 12,
            background: "#f9fafb",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#9ca3af",
            fontSize: 13,
            textAlign: "center",
            padding: 8,
          }}
        >
          Aperçu du document — à venir
        </div>
      )}

      {/* Date de dernière mise à jour */}
      {slot.docKey && (
        <div style={{ fontSize: 12, color: "#6b7280" }}>
          Dernière mise à jour : <strong style={{ color: "#374151" }}>{dateLabel}</strong>
        </div>
      )}

      {/* Sélection : zone glisser-déposer (clic = sélecteur) */}
      {slot.docKey && (
        <>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            onClick={openPicker}
            style={{
              border: `2px dashed ${isDragOver ? "#2563eb" : "#d1d5db"}`,
              borderRadius: 12,
              background: isDragOver ? "#eff6ff" : "#f9fafb",
              padding: 16,
              textAlign: "center",
              color: "#6b7280",
              fontSize: 13,
              cursor: "pointer",
              lineHeight: 1.4,
            }}
          >
            Glissez-déposez un PDF ici
            <br />
            ou cliquez pour choisir un fichier
          </div>

          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            style={{ display: "none" }}
            onChange={handleInputChange}
          />

          {file && (
            <div style={{ fontSize: 12, color: "#374151" }}>
              Fichier choisi : <strong>{file.name}</strong>
            </div>
          )}

          <button
            type="button"
            onClick={handleUpload}
            disabled={!file || status === "uploading"}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: "1px solid #2563eb",
              background: !file || status === "uploading" ? "#93c5fd" : "#2563eb",
              color: "#ffffff",
              fontWeight: 600,
              fontSize: 14,
              cursor: !file || status === "uploading" ? "default" : "pointer",
            }}
          >
            {status === "uploading" ? "Envoi en cours…" : "Uploader le document"}
          </button>

          {statusMsg && (
            <div
              style={{
                fontSize: 12,
                color: status === "error" ? "#b91c1c" : "#15803d",
              }}
            >
              {statusMsg}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function DocumentsTab() {
  return (
    <div style={{ display: "flex", gap: 16, alignItems: "stretch" }}>
      {DOC_SLOTS.map((slot) => (
        <DocumentColumn key={slot.key} slot={slot} />
      ))}
    </div>
  );
}

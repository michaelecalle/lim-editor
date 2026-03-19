type ArchiveListItem = {
  name: string;
  timestamp: string | null;
};

type ArchiveListModalProps = {
  open: boolean;
  isBusy?: boolean;
  archives: ArchiveListItem[];
  errorMessage?: string | null;
  onClose: () => void;
  onSelectArchive: (archiveName: string) => void;
};

function formatArchiveTimestamp(timestamp: string | null): string | null {
  if (!timestamp) {
    return null;
  }

  const match = timestamp.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})$/
  );

  if (!match) {
    return timestamp;
  }

  const [, year, month, day, hours, minutes, seconds] = match;

  const monthNames = [
    "janvier",
    "février",
    "mars",
    "avril",
    "mai",
    "juin",
    "juillet",
    "août",
    "septembre",
    "octobre",
    "novembre",
    "décembre",
  ];

  const monthIndex = Number(month) - 1;
  const monthLabel = monthNames[monthIndex] ?? month;

  return `${Number(day)} ${monthLabel} ${year} - ${hours}:${minutes}:${seconds}`;
}

function formatArchiveLabel(archive: ArchiveListItem): string {
  const formattedTimestamp = formatArchiveTimestamp(archive.timestamp);

  if (!formattedTimestamp) {
    return archive.name;
  }

  return `${formattedTimestamp} — ${archive.name}`;
}

export default function ArchiveListModal({
  open,
  isBusy = false,
  archives,
  errorMessage = null,
  onClose,
  onSelectArchive,
}: ArchiveListModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="archive-list-modal-title"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(17, 24, 39, 0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        zIndex: 1000,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 720,
          maxHeight: "80vh",
          overflow: "auto",
          background: "#ffffff",
          borderRadius: 16,
          border: "1px solid #d1d5db",
          boxShadow: "0 20px 50px rgba(0, 0, 0, 0.18)",
          padding: 20,
        }}
      >
        <div
          id="archive-list-modal-title"
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: "#111827",
            marginBottom: 12,
          }}
        >
          Restaurer une ancienne version
        </div>

        <div
          style={{
            color: "#374151",
            lineHeight: 1.5,
            marginBottom: 18,
          }}
        >
          Sélectionnez une archive à charger dans l’éditeur. Cette action ne
          republie rien automatiquement.
        </div>

        {errorMessage ? (
          <div
            style={{
              marginBottom: 16,
              padding: 12,
              border: "1px solid #fca5a5",
              borderRadius: 12,
              background: "#fef2f2",
              color: "#991b1b",
              lineHeight: 1.5,
            }}
          >
            {errorMessage}
          </div>
        ) : null}

        {isBusy ? (
          <div
            style={{
              color: "#374151",
              marginBottom: 16,
            }}
          >
            Chargement de la liste des archives...
          </div>
        ) : archives.length > 0 ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
              marginBottom: 16,
            }}
          >
            {archives.map((archive) => (
              <button
                key={archive.name}
                type="button"
                onClick={() => onSelectArchive(archive.name)}
                style={{
                  textAlign: "left",
                  padding: "12px 14px",
                  border: "1px solid #d1d5db",
                  borderRadius: 12,
                  background: "#ffffff",
                  cursor: "pointer",
                }}
                title={`Charger l’archive ${archive.name} dans l’éditeur`}
              >
                {formatArchiveLabel(archive)}
              </button>
            ))}
          </div>
        ) : (
          <div
            style={{
              color: "#6b7280",
              marginBottom: 16,
            }}
          >
            Aucune archive disponible pour l’instant.
          </div>
        )}

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={isBusy}
            style={{
              padding: "10px 14px",
              cursor: isBusy ? "not-allowed" : "pointer",
              opacity: isBusy ? 0.55 : 1,
            }}
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
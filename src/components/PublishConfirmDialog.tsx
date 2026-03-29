type PublishConfirmDialogProps = {
  open: boolean;
  isBusy?: boolean;
  errorMessage?: string | null;
  successMessage?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
};

export default function PublishConfirmDialog({
  open,
  isBusy = false,
  errorMessage = null,
  successMessage = null,
  onCancel,
  onConfirm,
}: PublishConfirmDialogProps) {
  if (!open) {
    return null;
  }

  const isSuccess = successMessage != null && successMessage.trim() !== "";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="publish-confirm-dialog-title"
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
          maxWidth: 560,
          background: "#ffffff",
          borderRadius: 16,
          border: "1px solid #d1d5db",
          boxShadow: "0 20px 50px rgba(0, 0, 0, 0.18)",
          padding: 20,
        }}
      >
        <div
          id="publish-confirm-dialog-title"
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: "#111827",
            marginBottom: 12,
          }}
        >
          {isSuccess ? "Publication réussie" : "Confirmer la mise en ligne"}
        </div>

        <div
          style={{
            color: "#374151",
            lineHeight: 1.5,
            marginBottom: errorMessage || successMessage ? 12 : 18,
          }}
        >
          {isSuccess ? (
            <>
              La version a bien été publiée.
              <br />
              Les fichiers ont été mis à jour, mais la prise en compte sur les
              versions en ligne peut nécessiter quelques minutes.
              <br />
              Rechargez la page dans quelques instants pour vérifier le résultat.
            </>
          ) : (
            <>
              Attention, vous vous apprêtez à remplacer la version actuellement
              en service. Êtes-vous sûr ?
            </>
          )}
        </div>

        {errorMessage ? (
          <div
            style={{
              marginBottom: 18,
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

        {successMessage ? (
          <div
            style={{
              marginBottom: 18,
              padding: 12,
              border: "1px solid #86efac",
              borderRadius: 12,
              background: "#f0fdf4",
              color: "#166534",
              lineHeight: 1.5,
            }}
          >
            {successMessage}
          </div>
        ) : null}

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          {isSuccess ? (
            <button
              type="button"
              onClick={onCancel}
              style={{
                padding: "10px 14px",
                cursor: "pointer",
              }}
            >
              Fermer
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onCancel}
                disabled={isBusy}
                style={{
                  padding: "10px 14px",
                  cursor: isBusy ? "not-allowed" : "pointer",
                  opacity: isBusy ? 0.55 : 1,
                }}
              >
                Annuler
              </button>

              <button
                type="button"
                onClick={onConfirm}
                disabled={isBusy}
                style={{
                  padding: "10px 14px",
                  cursor: isBusy ? "not-allowed" : "pointer",
                  opacity: isBusy ? 0.55 : 1,
                }}
              >
                {isBusy ? "Publication en cours..." : "Confirmer la mise en ligne"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
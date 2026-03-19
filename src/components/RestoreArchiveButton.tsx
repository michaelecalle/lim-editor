import type { MouseEventHandler } from "react";

type RestoreArchiveButtonProps = {
  disabled?: boolean;
  isBusy?: boolean;
  onClick: MouseEventHandler<HTMLButtonElement>;
};

export default function RestoreArchiveButton({
  disabled = false,
  isBusy = false,
  onClick,
}: RestoreArchiveButtonProps) {
  const isActuallyDisabled = disabled || isBusy;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isActuallyDisabled}
      title={
        isBusy
          ? "Chargement de la liste des archives en cours..."
          : "Charger localement une version archivée sans la republier automatiquement"
      }
      style={{
        padding: "10px 14px",
        cursor: isActuallyDisabled ? "not-allowed" : "pointer",
        opacity: isActuallyDisabled ? 0.55 : 1,
      }}
    >
      {isBusy ? "Chargement des archives..." : "Restaurer une ancienne version"}
    </button>
  );
}
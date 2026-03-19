import type { MouseEventHandler } from "react";

type PublishVersionButtonProps = {
  disabled: boolean;
  isBusy?: boolean;
  onClick: MouseEventHandler<HTMLButtonElement>;
};

export default function PublishVersionButton({
  disabled,
  isBusy = false,
  onClick,
}: PublishVersionButtonProps) {
  const isActuallyDisabled = disabled || isBusy;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isActuallyDisabled}
      title={
        disabled
          ? "Aucune modification non publiée à mettre en ligne"
          : isBusy
            ? "Publication en cours..."
            : "Mettre en ligne la version actuellement chargée dans l’éditeur"
      }
      style={{
        padding: "10px 14px",
        cursor: isActuallyDisabled ? "not-allowed" : "pointer",
        opacity: isActuallyDisabled ? 0.55 : 1,
      }}
    >
      {isBusy ? "Publication en cours..." : "Mettre en ligne cette version"}
    </button>
  );
}
import type { ReactNode } from "react";

type EditorStatusTone = "neutral" | "info" | "success" | "error" | "warning";

type EditorStatusBannerProps = {
  title: string;
  message: string;
  tone?: EditorStatusTone;
  details?: string[];
  actions?: ReactNode;
};

function getToneStyles(tone: EditorStatusTone) {
  switch (tone) {
    case "info":
      return {
        border: "1px solid #93c5fd",
        background: "#eff6ff",
        titleColor: "#1d4ed8",
        messageColor: "#1e3a8a",
      };

    case "success":
      return {
        border: "1px solid #86efac",
        background: "#f0fdf4",
        titleColor: "#166534",
        messageColor: "#166534",
      };

    case "error":
      return {
        border: "1px solid #fca5a5",
        background: "#fef2f2",
        titleColor: "#b91c1c",
        messageColor: "#991b1b",
      };

    case "warning":
      return {
        border: "1px solid #fcd34d",
        background: "#fffbeb",
        titleColor: "#b45309",
        messageColor: "#92400e",
      };

    case "neutral":
    default:
      return {
        border: "1px solid #d1d5db",
        background: "#ffffff",
        titleColor: "#111827",
        messageColor: "#4b5563",
      };
  }
}

export default function EditorStatusBanner({
  title,
  message,
  tone = "neutral",
  details = [],
  actions,
}: EditorStatusBannerProps) {
  const styles = getToneStyles(tone);

  return (
    <div
      style={{
        marginTop: 16,
        padding: 12,
        border: styles.border,
        borderRadius: 12,
        background: styles.background,
      }}
    >
      <div
        style={{
          fontWeight: 700,
          marginBottom: 8,
          color: styles.titleColor,
        }}
      >
        {title}
      </div>

      <div
        style={{
          marginBottom: details.length > 0 || actions ? 8 : 0,
          color: styles.messageColor,
        }}
      >
        {message}
      </div>

      {details.length > 0 ? (
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          {details.map((line, index) => (
            <li key={`${index}-${line}`}>{line}</li>
          ))}
        </ul>
      ) : null}

      {actions ? (
        <div
          style={{
            marginTop: details.length > 0 ? 10 : 0,
          }}
        >
          {actions}
        </div>
      ) : null}
    </div>
  );
}
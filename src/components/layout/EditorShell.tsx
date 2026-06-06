import "./EditorShell.css";
import type { ReactNode } from "react";

type EditorShellProps = {
  toolbar: ReactNode;
  tableArea: ReactNode;
  detailsPanel: ReactNode;
  // Si true, le panneau latéral est masqué et le principal prend toute la largeur.
  hideSidePanel?: boolean;
};

export default function EditorShell({
  toolbar,
  tableArea,
  detailsPanel,
  hideSidePanel = false,
}: EditorShellProps) {
  return (
    <div className="editor-shell">
      <header className="editor-shell__header">{toolbar}</header>

      <main
        className={
          "editor-shell__body" +
          (hideSidePanel ? " editor-shell__body--no-side" : "")
        }
      >
        <section className="editor-shell__main">{tableArea}</section>
        {!hideSidePanel && (
          <aside className="editor-shell__side">{detailsPanel}</aside>
        )}
      </main>
    </div>
  );
}
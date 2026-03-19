import "./EditorShell.css";
import type { ReactNode } from "react";

type EditorShellProps = {
  toolbar: ReactNode;
  tableArea: ReactNode;
  detailsPanel: ReactNode;
};

export default function EditorShell({
  toolbar,
  tableArea,
  detailsPanel,
}: EditorShellProps) {
  return (
    <div className="editor-shell">
      <header className="editor-shell__header">{toolbar}</header>

      <main className="editor-shell__body">
        <section className="editor-shell__main">{tableArea}</section>
        <aside className="editor-shell__side">{detailsPanel}</aside>
      </main>
    </div>
  );
}
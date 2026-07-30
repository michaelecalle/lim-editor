import "./LTVTab.css";
import {
  formatLtvDateTimeForDisplay,
  LTV_TABLE_HEADERS,
  LTV_TEXT_FIELDS_BEFORE_FLAGS,
  LTV_FLAG_FIELDS,
} from "../../modules/ft-editor/utils/ftEditorUtils";
import type {
  LtvEditorRow,
  LtvEditorTextField,
  LtvEditorFlagField,
} from "../../modules/ft-editor/utils/ftEditorUtils";

// Seuil PK séparant la section Barcelone-Figueres (PK >= 616) du reste de la ligne.
const PK_SPLIT = 616;

function parsePk(value: string): number | null {
  const m = (value ?? "").replace(",", ".").match(/\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

// Une LTV appartient à Barcelone-Figueres si l'un de ses PK atteint >= 616.
function isBarcelonaFigueres(row: LtvEditorRow): boolean {
  const a = parsePk(row.kmIni);
  const b = parsePk(row.kmFin);
  const max = Math.max(a ?? Number.NEGATIVE_INFINITY, b ?? Number.NEGATIVE_INFINITY);
  return max >= PK_SPLIT;
}

type LtvNormalizedFileInfo = {
  publishedAt: string;
  source: string;
  fetchedAt: string;
  sourceUpdatedAt: string | null;
  sourceUpdatedFile: string | null;
  warningCount: number;
};

// Onglet LTV = AFFICHAGE SEUL du fichier importé (PDF). Aucune édition :
// pas d'ajout, pas de suppression, pas de réordonnancement, cases non modifiables.
// La seule action est l'import d'un PDF (bouton dans le bandeau), qui écrase le
// fichier canonique unique.
type Props = {
  ltvNormalizedStatus: "idle" | "loading" | "success" | "error";
  ltvNormalizedMessage: string;
  ltvNormalizedFileInfo: LtvNormalizedFileInfo | null;
  ltvNormalizedRows: LtvEditorRow[];
  onImportLtvPdf: (file: File) => void | Promise<void>;
};

export default function LTVTab({
  ltvNormalizedStatus,
  ltvNormalizedMessage,
  ltvNormalizedFileInfo,
  ltvNormalizedRows,
  onImportLtvPdf,
}: Props) {
  const renderTextCell = (row: LtvEditorRow, field: LtvEditorTextField) => (
    <td
      key={`${row.id}-${field}`}
      style={{
        border: "1px solid #d1d5db",
        padding: "8px 6px",
        background: "#ffffff",
        color: "#111827",
        verticalAlign: "top",
        whiteSpace: "pre-line",
        overflowWrap: "anywhere",
      }}
    >
      {row[field]}
    </td>
  );

  const renderFlagCell = (row: LtvEditorRow, field: LtvEditorFlagField) => (
    <td
      key={`${row.id}-${field}`}
      style={{
        border: "1px solid #d1d5db",
        padding: "8px 6px",
        background: "#ffffff",
        color: row[field] ? "#047857" : "#9ca3af",
        fontWeight: 800,
        verticalAlign: "middle",
        textAlign: "center",
      }}
    >
      {row[field] ? "✓" : ""}
    </td>
  );

  const renderTableSection = (
    rows: LtvEditorRow[],
    title: string,
    emptyMessage: string
  ) => (
    <div
      style={{
        padding: 16,
        border: "1px solid #d1d5db",
        borderRadius: 16,
        background: "#ffffff",
        color: "#111827",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 12,
        }}
      >
        <div style={{ fontSize: 20, fontWeight: 700 }}>{title}</div>
        <div
          style={{
            padding: "6px 10px",
            borderRadius: 999,
            border: "1px solid #d1d5db",
            background: "#f9fafb",
            color: "#374151",
            fontWeight: 700,
            fontSize: 13,
          }}
        >
          {rows.length} LTV
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            minWidth: 1280,
            borderCollapse: "collapse",
            tableLayout: "fixed",
            fontSize: 13,
          }}
        >
          <thead>
            <tr>
              {LTV_TABLE_HEADERS.map((header) => (
                <th
                  key={header}
                  style={{
                    border: "1px solid #d1d5db",
                    background: "#f3f4f6",
                    color: "#111827",
                    padding: "8px 6px",
                    textAlign: "left",
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                  }}
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={LTV_TABLE_HEADERS.length}
                  style={{
                    border: "1px solid #d1d5db",
                    padding: 18,
                    textAlign: "center",
                    color: "#6b7280",
                    background: "#ffffff",
                    fontWeight: 500,
                  }}
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id}>
                  {LTV_TEXT_FIELDS_BEFORE_FLAGS.map((field) =>
                    renderTextCell(row, field)
                  )}
                  {LTV_FLAG_FIELDS.map((field) => renderFlagCell(row, field))}
                  {renderTextCell(row, "observaciones")}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  const barcelonaFigueresRows = ltvNormalizedRows.filter(isBarcelonaFigueres);
  const resteRows = ltvNormalizedRows.filter((r) => !isBarcelonaFigueres(r));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Bandeau d'état + import PDF (seule action possible) */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            color:
              ltvNormalizedStatus === "error"
                ? "#991b1b"
                : ltvNormalizedStatus === "success"
                  ? "#166534"
                  : "#4b5563",
            fontSize: 14,
            fontWeight: ltvNormalizedStatus === "error" ? 600 : 400,
            lineHeight: 1.5,
          }}
        >
          {ltvNormalizedMessage}
          {ltvNormalizedFileInfo ? (
            <>
              {" "}
              Publié le {formatLtvDateTimeForDisplay(ltvNormalizedFileInfo.publishedAt)}
            </>
          ) : null}
        </div>

        <label
          title="Importer le PDF LTV (même extraction que l'application LIM). Écrase le fichier unique."
          style={{
            padding: "8px 12px",
            borderRadius: 10,
            border: "1px solid #16a34a",
            background: "#16a34a",
            color: "#ffffff",
            fontWeight: 700,
            cursor: ltvNormalizedStatus === "loading" ? "default" : "pointer",
            opacity: ltvNormalizedStatus === "loading" ? 0.6 : 1,
          }}
        >
          Importer un PDF LTV
          <input
            type="file"
            accept=".pdf,application/pdf"
            style={{ display: "none" }}
            disabled={ltvNormalizedStatus === "loading"}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void onImportLtvPdf(file);
            }}
          />
        </label>
      </div>

      {renderTableSection(
        barcelonaFigueresRows,
        "LTV Barcelone-Figueres (PK ≥ 616)",
        "Aucune LTV Barcelone-Figueres."
      )}

      {renderTableSection(
        resteRows,
        "Reste de la ligne (PK < 616)",
        "Aucune LTV sur le reste de la ligne."
      )}
    </div>
  );
}

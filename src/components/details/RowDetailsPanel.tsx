import { useEffect, useMemo, useState } from "react";
import type { EditorFtRowView } from "../../modules/ft-editor/types/viewTypes";

type RowDetailsPanelProps = {
  directionLabel: string;
  sourceStatus: "idle" | "loading" | "success" | "error";
  rowCount: number;
  selectedRow: EditorFtRowView | null;
  bloqueoOptions: string[];
  onApplyBloqueo: (nextBloqueo: string) => void;
  vmaxOptions: string[];
  onApplyVmax: (nextVmax: string) => void;
  rcOptions: string[];
  onApplyRc: (nextRc: string) => void;
  radioOptions: string[];
  onApplyRadio: (nextRadio: string) => void;
  onApplyDependencia: (nextDependencia: string) => void;
  onApplyPkInternal: (nextPkInternal: string) => void;
  onApplyPkDisplay: (nextPkDisplay: string) => void;
  networkOptions: string[];
  onApplyNetwork: (nextNetwork: string) => void;
  onApplyCsv: (nextCsv: boolean) => void;
};

const CUSTOM_BLOQUEO_VALUE = "__custom_bloqueo__";
const CUSTOM_VMAX_VALUE = "__custom_vmax__";
const CUSTOM_RC_VALUE = "__custom_rc__";
const CUSTOM_RADIO_VALUE = "__custom_radio__";
const CUSTOM_NETWORK_VALUE = "__custom_network__";

function formatTechnicalPk(value: number | null): string {
  return value == null ? "—" : value.toFixed(1);
}

function normalizePkDraft(value: string): string | null {
  const trimmedValue = value.trim();

  if (trimmedValue === "") {
    return "";
  }

  const normalizedDecimal = trimmedValue.replace(",", ".");
  const numericValue = Number(normalizedDecimal);

  if (!Number.isFinite(numericValue)) {
    return null;
  }

  return numericValue.toFixed(1);
}

export default function RowDetailsPanel({
  directionLabel,
  sourceStatus,
  rowCount,
  selectedRow,
  bloqueoOptions,
  onApplyBloqueo,
  vmaxOptions,
  onApplyVmax,
  rcOptions,
  onApplyRc,
  radioOptions,
  onApplyRadio,
  onApplyDependencia,
  onApplyPkInternal,
  onApplyPkDisplay,
  networkOptions,
  onApplyNetwork,
  onApplyCsv,
}: RowDetailsPanelProps) {
  const [bloqueoMode, setBloqueoMode] = useState<string>("");
  const [customBloqueo, setCustomBloqueo] = useState("");
  const [isBloqueoEditorOpen, setIsBloqueoEditorOpen] = useState(false);

  const [vmaxMode, setVmaxMode] = useState<string>("");
  const [customVmax, setCustomVmax] = useState("");
  const [isVmaxEditorOpen, setIsVmaxEditorOpen] = useState(false);

  const [rcMode, setRcMode] = useState<string>("");
  const [customRc, setCustomRc] = useState("");
  const [isRcEditorOpen, setIsRcEditorOpen] = useState(false);

  const [radioMode, setRadioMode] = useState<string>("");
  const [customRadio, setCustomRadio] = useState("");
  const [isRadioEditorOpen, setIsRadioEditorOpen] = useState(false);

  const [dependenciaDraft, setDependenciaDraft] = useState("");
  const [isDependenciaEditorOpen, setIsDependenciaEditorOpen] = useState(false);

  const [pkInternalDraft, setPkInternalDraft] = useState("");
  const [isPkInternalEditorOpen, setIsPkInternalEditorOpen] = useState(false);

  const [pkDisplayDraft, setPkDisplayDraft] = useState("");
  const [isPkDisplayEditorOpen, setIsPkDisplayEditorOpen] = useState(false);

  const [networkMode, setNetworkMode] = useState<string>("");
  const [customNetwork, setCustomNetwork] = useState("");
  const [isNetworkEditorOpen, setIsNetworkEditorOpen] = useState(false);

  const [csvDraft, setCsvDraft] = useState(false);
  const [isCsvEditorOpen, setIsCsvEditorOpen] = useState(false);

  const selectedBloqueo = selectedRow?.visible.bloqueo ?? "";
  const selectedVmax = selectedRow?.visible.vmax ?? "";
  const selectedRc = selectedRow?.visible.rc ?? "";
  const selectedRadio = selectedRow?.visible.radio ?? "";
  const selectedDependencia = selectedRow?.visible.dependencia ?? "";
  const selectedPkInternal = selectedRow?.visible.pkInternalDisplay ?? "";
  const selectedPkDisplay = selectedRow?.visible.pkDisplay ?? "";
  const selectedNetwork = selectedRow?.technical.network ?? "";
  const selectedCsv = selectedRow?.technical.csv ?? false;

  useEffect(() => {
    if (!selectedRow) {
      setBloqueoMode("");
      setCustomBloqueo("");
      setIsBloqueoEditorOpen(false);
      return;
    }

    const trimmedBloqueo = selectedBloqueo.trim();

    if (trimmedBloqueo === "") {
      setBloqueoMode(CUSTOM_BLOQUEO_VALUE);
      setCustomBloqueo("");
    } else if (bloqueoOptions.includes(trimmedBloqueo)) {
      setBloqueoMode(trimmedBloqueo);
      setCustomBloqueo("");
    } else {
      setBloqueoMode(CUSTOM_BLOQUEO_VALUE);
      setCustomBloqueo(trimmedBloqueo);
    }

    setIsBloqueoEditorOpen(false);
  }, [selectedRow, selectedBloqueo, bloqueoOptions]);

  useEffect(() => {
    if (!selectedRow) {
      setVmaxMode("");
      setCustomVmax("");
      setIsVmaxEditorOpen(false);
      return;
    }

    const trimmedVmax = selectedVmax.trim();

    if (trimmedVmax === "") {
      setVmaxMode(CUSTOM_VMAX_VALUE);
      setCustomVmax("");
    } else if (vmaxOptions.includes(trimmedVmax)) {
      setVmaxMode(trimmedVmax);
      setCustomVmax("");
    } else {
      setVmaxMode(CUSTOM_VMAX_VALUE);
      setCustomVmax(trimmedVmax);
    }

    setIsVmaxEditorOpen(false);
  }, [selectedRow, selectedVmax, vmaxOptions]);

  useEffect(() => {
    if (!selectedRow) {
      setRcMode("");
      setCustomRc("");
      setIsRcEditorOpen(false);
      return;
    }

    const trimmedRc = selectedRc.trim();

    if (trimmedRc === "") {
      setRcMode(CUSTOM_RC_VALUE);
      setCustomRc("");
    } else if (rcOptions.includes(trimmedRc)) {
      setRcMode(trimmedRc);
      setCustomRc("");
    } else {
      setRcMode(CUSTOM_RC_VALUE);
      setCustomRc(trimmedRc);
    }

    setIsRcEditorOpen(false);
  }, [selectedRow, selectedRc, rcOptions]);

  useEffect(() => {
    if (!selectedRow) {
      setRadioMode("");
      setCustomRadio("");
      setIsRadioEditorOpen(false);
      return;
    }

    const trimmedRadio = selectedRadio.trim();

    if (trimmedRadio === "") {
      setRadioMode(CUSTOM_RADIO_VALUE);
      setCustomRadio("");
    } else if (radioOptions.includes(trimmedRadio)) {
      setRadioMode(trimmedRadio);
      setCustomRadio("");
    } else {
      setRadioMode(CUSTOM_RADIO_VALUE);
      setCustomRadio(trimmedRadio);
    }

    setIsRadioEditorOpen(false);
  }, [selectedRow, selectedRadio, radioOptions]);

  useEffect(() => {
    if (!selectedRow) {
      setDependenciaDraft("");
      setIsDependenciaEditorOpen(false);
      return;
    }

    setDependenciaDraft(selectedDependencia);
    setIsDependenciaEditorOpen(false);
  }, [selectedRow, selectedDependencia]);

  useEffect(() => {
    if (!selectedRow) {
      setPkInternalDraft("");
      setIsPkInternalEditorOpen(false);
      return;
    }

    setPkInternalDraft(selectedPkInternal);
    setIsPkInternalEditorOpen(false);
  }, [selectedRow, selectedPkInternal]);

  useEffect(() => {
    if (!selectedRow) {
      setPkDisplayDraft("");
      setIsPkDisplayEditorOpen(false);
      return;
    }

    setPkDisplayDraft(selectedPkDisplay);
    setIsPkDisplayEditorOpen(false);
  }, [selectedRow, selectedPkDisplay]);

  useEffect(() => {
    if (!selectedRow) {
      setNetworkMode("");
      setCustomNetwork("");
      setIsNetworkEditorOpen(false);
      return;
    }

    const trimmedNetwork = selectedNetwork.trim();

    if (trimmedNetwork === "") {
      setNetworkMode(CUSTOM_NETWORK_VALUE);
      setCustomNetwork("");
    } else if (networkOptions.includes(trimmedNetwork)) {
      setNetworkMode(trimmedNetwork);
      setCustomNetwork("");
    } else {
      setNetworkMode(CUSTOM_NETWORK_VALUE);
      setCustomNetwork(trimmedNetwork);
    }

    setIsNetworkEditorOpen(false);
  }, [selectedRow, selectedNetwork, networkOptions]);

  useEffect(() => {
    if (!selectedRow) {
      setCsvDraft(false);
      setIsCsvEditorOpen(false);
      return;
    }

    setCsvDraft(selectedCsv);
    setIsCsvEditorOpen(false);
  }, [selectedRow, selectedCsv]);

  const bloqueoValueToApply = useMemo(() => {
    if (bloqueoMode === CUSTOM_BLOQUEO_VALUE) {
      return customBloqueo.trim();
    }

    return bloqueoMode.trim();
  }, [bloqueoMode, customBloqueo]);

  const vmaxValueToApply = useMemo(() => {
    if (vmaxMode === CUSTOM_VMAX_VALUE) {
      return customVmax.trim();
    }

    return vmaxMode.trim();
  }, [vmaxMode, customVmax]);

  const rcValueToApply = useMemo(() => {
    if (rcMode === CUSTOM_RC_VALUE) {
      return customRc.trim();
    }

    return rcMode.trim();
  }, [rcMode, customRc]);

  const radioValueToApply = useMemo(() => {
    if (radioMode === CUSTOM_RADIO_VALUE) {
      return customRadio.trim();
    }

    return radioMode.trim();
  }, [radioMode, customRadio]);

  const networkValueToApply = useMemo(() => {
    if (networkMode === CUSTOM_NETWORK_VALUE) {
      return customNetwork.trim();
    }

    return networkMode.trim();
  }, [networkMode, customNetwork]);

  const dependenciaValueToApply = dependenciaDraft.trim();
  const normalizedPkInternalValue = normalizePkDraft(pkInternalDraft);
  const normalizedPkDisplayValue = normalizePkDraft(pkDisplayDraft);

  const isBloqueoApplyDisabled =
    !selectedRow || bloqueoValueToApply === selectedBloqueo.trim();

  const isVmaxApplyDisabled =
    !selectedRow || vmaxValueToApply === selectedVmax.trim();

  const isRcApplyDisabled = !selectedRow || rcValueToApply === selectedRc.trim();

  const isRadioApplyDisabled =
    !selectedRow || radioValueToApply === selectedRadio.trim();

  const isDependenciaApplyDisabled =
    !selectedRow || dependenciaValueToApply === selectedDependencia.trim();

  const isPkInternalApplyDisabled =
    !selectedRow ||
    normalizedPkInternalValue === null ||
    normalizedPkInternalValue === selectedPkInternal.trim();

  const isPkDisplayApplyDisabled =
    !selectedRow ||
    normalizedPkDisplayValue === null ||
    normalizedPkDisplayValue === selectedPkDisplay.trim();

  const isNetworkApplyDisabled =
    !selectedRow || networkValueToApply === selectedNetwork.trim();

  const isCsvApplyDisabled = !selectedRow || csvDraft === selectedCsv;

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Détails ligne</h2>

      {!selectedRow ? (
        <p>Aucune ligne sélectionnée.</p>
      ) : (
        <>
          <p>
            PK interne :{" "}
            <button
              type="button"
              onClick={() => setIsPkInternalEditorOpen((previous) => !previous)}
              style={{
                padding: 0,
                border: "none",
                background: "transparent",
                font: "inherit",
                cursor: "pointer",
                textAlign: "left",
              }}
              title="Cliquer pour éditer PK interne"
            >
              <strong>{selectedRow.visible.pkInternalDisplay || "—"}</strong>
            </button>
          </p>

          {isPkInternalEditorOpen ? (
            <div
              style={{
                marginTop: 12,
                marginBottom: 12,
                padding: 12,
                border: "1px solid #d1d5db",
                borderRadius: 8,
                background: "#f9fafb",
              }}
            >
              <h3 style={{ marginTop: 0, marginBottom: 12 }}>
                Édition PK interne
              </h3>

              <label
                style={{
                  display: "block",
                  fontSize: 14,
                  marginBottom: 6,
                }}
              >
                Valeur
              </label>

              <input
                type="text"
                value={pkInternalDraft}
                onChange={(event) => setPkInternalDraft(event.target.value)}
                placeholder="Entrer un PK interne"
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "8px 10px",
                  marginBottom: 6,
                }}
              />

              <div
                style={{
                  fontSize: 13,
                  marginBottom: 10,
                  color:
                    normalizedPkInternalValue === null ? "#b91c1c" : "#374151",
                }}
              >
                {normalizedPkInternalValue === null
                  ? "Valeur invalide. Utiliser un nombre, avec virgule ou point."
                  : normalizedPkInternalValue === ""
                    ? "Valeur vide conservée."
                    : `Valeur normalisée : ${normalizedPkInternalValue}`}
              </div>

              <div
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    if (normalizedPkInternalValue === null) {
                      return;
                    }

                    onApplyPkInternal(normalizedPkInternalValue);
                    setIsPkInternalEditorOpen(false);
                  }}
                  disabled={isPkInternalApplyDisabled}
                  style={{
                    padding: "10px 14px",
                    cursor: isPkInternalApplyDisabled
                      ? "not-allowed"
                      : "pointer",
                  }}
                >
                  Valider la modification
                </button>

                <button
                  type="button"
                  onClick={() => setIsPkInternalEditorOpen(false)}
                  style={{
                    padding: "10px 14px",
                    cursor: "pointer",
                  }}
                >
                  Fermer
                </button>
              </div>
            </div>
          ) : null}

          <p>
            Réseau :{" "}
            <button
              type="button"
              onClick={() => setIsNetworkEditorOpen((previous) => !previous)}
              style={{
                padding: 0,
                border: "none",
                background: "transparent",
                font: "inherit",
                cursor: "pointer",
                textAlign: "left",
              }}
              title="Cliquer pour éditer Réseau"
            >
              <strong>{selectedRow.technical.network || "—"}</strong>
            </button>
          </p>

          {isNetworkEditorOpen ? (
            <div
              style={{
                marginTop: 12,
                marginBottom: 12,
                padding: 12,
                border: "1px solid #d1d5db",
                borderRadius: 8,
                background: "#f9fafb",
              }}
            >
              <h3 style={{ marginTop: 0, marginBottom: 12 }}>
                Édition Réseau
              </h3>

              <label
                style={{
                  display: "block",
                  fontSize: 14,
                  marginBottom: 6,
                }}
              >
                Valeur
              </label>

              <select
                value={networkMode}
                onChange={(event) => setNetworkMode(event.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  marginBottom: 10,
                }}
              >
                {networkOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}

                <option value={CUSTOM_NETWORK_VALUE}>
                  Valeur personnalisée…
                </option>
              </select>

              {networkMode === CUSTOM_NETWORK_VALUE ? (
                <>
                  <label
                    style={{
                      display: "block",
                      fontSize: 14,
                      marginBottom: 6,
                    }}
                  >
                    Valeur personnalisée
                  </label>

                  <input
                    type="text"
                    value={customNetwork}
                    onChange={(event) => setCustomNetwork(event.target.value)}
                    placeholder="Entrer une valeur de réseau"
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      padding: "8px 10px",
                      marginBottom: 10,
                    }}
                  />
                </>
              ) : null}

              <div
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    onApplyNetwork(networkValueToApply);
                    setIsNetworkEditorOpen(false);
                  }}
                  disabled={isNetworkApplyDisabled}
                  style={{
                    padding: "10px 14px",
                    cursor: isNetworkApplyDisabled ? "not-allowed" : "pointer",
                  }}
                >
                  Valider la modification
                </button>

                <button
                  type="button"
                  onClick={() => setIsNetworkEditorOpen(false)}
                  style={{
                    padding: "10px 14px",
                    cursor: "pointer",
                  }}
                >
                  Fermer
                </button>
              </div>
            </div>
          ) : null}

          <p>
            Sit Km :{" "}
            <button
              type="button"
              onClick={() => setIsPkDisplayEditorOpen((previous) => !previous)}
              style={{
                padding: 0,
                border: "none",
                background: "transparent",
                font: "inherit",
                cursor: "pointer",
                textAlign: "left",
              }}
              title="Cliquer pour éditer Sit Km"
            >
              <strong>{selectedRow.visible.pkDisplay || "—"}</strong>
            </button>
          </p>

          {isPkDisplayEditorOpen ? (
            <div
              style={{
                marginTop: 12,
                marginBottom: 12,
                padding: 12,
                border: "1px solid #d1d5db",
                borderRadius: 8,
                background: "#f9fafb",
              }}
            >
              <h3 style={{ marginTop: 0, marginBottom: 12 }}>
                Édition Sit Km
              </h3>

              <label
                style={{
                  display: "block",
                  fontSize: 14,
                  marginBottom: 6,
                }}
              >
                Valeur
              </label>

              <input
                type="text"
                value={pkDisplayDraft}
                onChange={(event) => setPkDisplayDraft(event.target.value)}
                placeholder="Entrer un Sit Km"
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "8px 10px",
                  marginBottom: 6,
                }}
              />

              <div
                style={{
                  fontSize: 13,
                  marginBottom: 10,
                  color:
                    normalizedPkDisplayValue === null ? "#b91c1c" : "#374151",
                }}
              >
                {normalizedPkDisplayValue === null
                  ? "Valeur invalide. Utiliser un nombre, avec virgule ou point."
                  : normalizedPkDisplayValue === ""
                    ? "Valeur vide conservée."
                    : `Valeur normalisée : ${normalizedPkDisplayValue}`}
              </div>

              <div
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    if (normalizedPkDisplayValue === null) {
                      return;
                    }

                    onApplyPkDisplay(normalizedPkDisplayValue);
                    setIsPkDisplayEditorOpen(false);
                  }}
                  disabled={isPkDisplayApplyDisabled}
                  style={{
                    padding: "10px 14px",
                    cursor: isPkDisplayApplyDisabled
                      ? "not-allowed"
                      : "pointer",
                  }}
                >
                  Valider la modification
                </button>

                <button
                  type="button"
                  onClick={() => setIsPkDisplayEditorOpen(false)}
                  style={{
                    padding: "10px 14px",
                    cursor: "pointer",
                  }}
                >
                  Fermer
                </button>
              </div>
            </div>
          ) : null}

          <p>
            Dependencia :{" "}
            <button
              type="button"
              onClick={() =>
                setIsDependenciaEditorOpen((previous) => !previous)
              }
              style={{
                padding: 0,
                border: "none",
                background: "transparent",
                font: "inherit",
                cursor: "pointer",
                textAlign: "left",
              }}
              title="Cliquer pour éditer Dependencia"
            >
              <strong>{selectedRow.visible.dependencia || "—"}</strong>
            </button>
          </p>

          {isDependenciaEditorOpen ? (
            <div
              style={{
                marginTop: 12,
                marginBottom: 12,
                padding: 12,
                border: "1px solid #d1d5db",
                borderRadius: 8,
                background: "#f9fafb",
              }}
            >
              <h3 style={{ marginTop: 0, marginBottom: 12 }}>
                Édition Dependencia
              </h3>

              <label
                style={{
                  display: "block",
                  fontSize: 14,
                  marginBottom: 6,
                }}
              >
                Valeur
              </label>

              <input
                type="text"
                value={dependenciaDraft}
                onChange={(event) => setDependenciaDraft(event.target.value)}
                placeholder="Entrer une valeur de dependencia"
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "8px 10px",
                  marginBottom: 10,
                }}
              />

              <div
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    onApplyDependencia(dependenciaValueToApply);
                    setIsDependenciaEditorOpen(false);
                  }}
                  disabled={isDependenciaApplyDisabled}
                  style={{
                    padding: "10px 14px",
                    cursor: isDependenciaApplyDisabled
                      ? "not-allowed"
                      : "pointer",
                  }}
                >
                  Valider la modification
                </button>

                <button
                  type="button"
                  onClick={() => setIsDependenciaEditorOpen(false)}
                  style={{
                    padding: "10px 14px",
                    cursor: "pointer",
                  }}
                >
                  Fermer
                </button>
              </div>
            </div>
          ) : null}

          <p>
            Com : <strong>{selectedRow.visible.com || "—"}</strong>
          </p>
          <p>
            Hora : <strong>{selectedRow.visible.hora || "—"}</strong>
          </p>
          <p>
            Técn : <strong>{selectedRow.visible.tecn || "—"}</strong>
          </p>
          <p>
            Conc : <strong>{selectedRow.visible.conc || "—"}</strong>
          </p>

          <p>
            CSV :{" "}
            <button
              type="button"
              onClick={() => setIsCsvEditorOpen((previous) => !previous)}
              style={{
                padding: 0,
                border: "none",
                background: "transparent",
                font: "inherit",
                cursor: "pointer",
                textAlign: "left",
              }}
              title="Cliquer pour éditer CSV"
            >
              <strong>{selectedCsv ? "Oui" : "Non"}</strong>
            </button>
          </p>

          {isCsvEditorOpen ? (
            <div
              style={{
                marginTop: 12,
                marginBottom: 12,
                padding: 12,
                border: "1px solid #d1d5db",
                borderRadius: 8,
                background: "#f9fafb",
              }}
            >
              <h3 style={{ marginTop: 0, marginBottom: 12 }}>Édition CSV</h3>

              <label
                style={{
                  display: "block",
                  fontSize: 14,
                  marginBottom: 6,
                }}
              >
                Valeur
              </label>

              <select
                value={csvDraft ? "true" : "false"}
                onChange={(event) => setCsvDraft(event.target.value === "true")}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  marginBottom: 10,
                }}
              >
                <option value="false">Non</option>
                <option value="true">Oui</option>
              </select>

              <div
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    onApplyCsv(csvDraft);
                    setIsCsvEditorOpen(false);
                  }}
                  disabled={isCsvApplyDisabled}
                  style={{
                    padding: "10px 14px",
                    cursor: isCsvApplyDisabled ? "not-allowed" : "pointer",
                  }}
                >
                  Valider la modification
                </button>

                <button
                  type="button"
                  onClick={() => setIsCsvEditorOpen(false)}
                  style={{
                    padding: "10px 14px",
                    cursor: "pointer",
                  }}
                >
                  Fermer
                </button>
              </div>
            </div>
          ) : null}

          <p>
            Bloqueo :{" "}
            <button
              type="button"
              onClick={() => setIsBloqueoEditorOpen((previous) => !previous)}
              style={{
                padding: 0,
                border: "none",
                background: "transparent",
                font: "inherit",
                cursor: "pointer",
                textAlign: "left",
              }}
              title="Cliquer pour éditer Bloqueo"
            >
              <strong>{selectedRow.visible.bloqueo || "—"}</strong>
            </button>
          </p>

          {isBloqueoEditorOpen ? (
            <div
              style={{
                marginTop: 12,
                marginBottom: 12,
                padding: 12,
                border: "1px solid #d1d5db",
                borderRadius: 8,
                background: "#f9fafb",
              }}
            >
              <h3 style={{ marginTop: 0, marginBottom: 12 }}>
                Édition Bloqueo
              </h3>

              <label
                style={{
                  display: "block",
                  fontSize: 14,
                  marginBottom: 6,
                }}
              >
                Valeur
              </label>

              <select
                value={bloqueoMode}
                onChange={(event) => setBloqueoMode(event.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  marginBottom: 10,
                }}
              >
                {bloqueoOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}

                <option value={CUSTOM_BLOQUEO_VALUE}>
                  Valeur personnalisée…
                </option>
              </select>

              {bloqueoMode === CUSTOM_BLOQUEO_VALUE ? (
                <>
                  <label
                    style={{
                      display: "block",
                      fontSize: 14,
                      marginBottom: 6,
                    }}
                  >
                    Valeur personnalisée
                  </label>

                  <input
                    type="text"
                    value={customBloqueo}
                    onChange={(event) => setCustomBloqueo(event.target.value)}
                    placeholder="Entrer une valeur de bloqueo"
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      padding: "8px 10px",
                      marginBottom: 10,
                    }}
                  />
                </>
              ) : null}

              <div
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    onApplyBloqueo(bloqueoValueToApply);
                    setIsBloqueoEditorOpen(false);
                  }}
                  disabled={isBloqueoApplyDisabled}
                  style={{
                    padding: "10px 14px",
                    cursor: isBloqueoApplyDisabled ? "not-allowed" : "pointer",
                  }}
                >
                  Valider la modification
                </button>

                <button
                  type="button"
                  onClick={() => setIsBloqueoEditorOpen(false)}
                  style={{
                    padding: "10px 14px",
                    cursor: "pointer",
                  }}
                >
                  Fermer
                </button>
              </div>
            </div>
          ) : null}

          <p>
            V Max :{" "}
            <button
              type="button"
              onClick={() => setIsVmaxEditorOpen((previous) => !previous)}
              style={{
                padding: 0,
                border: "none",
                background: "transparent",
                font: "inherit",
                cursor: "pointer",
                textAlign: "left",
              }}
              title="Cliquer pour éditer V Max"
            >
              <strong>{selectedRow.visible.vmax || "—"}</strong>
            </button>
          </p>

          {isVmaxEditorOpen ? (
            <div
              style={{
                marginTop: 12,
                marginBottom: 12,
                padding: 12,
                border: "1px solid #d1d5db",
                borderRadius: 8,
                background: "#f9fafb",
              }}
            >
              <h3 style={{ marginTop: 0, marginBottom: 12 }}>Édition V Max</h3>

              <label
                style={{
                  display: "block",
                  fontSize: 14,
                  marginBottom: 6,
                }}
              >
                Valeur
              </label>

              <select
                value={vmaxMode}
                onChange={(event) => setVmaxMode(event.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  marginBottom: 10,
                }}
              >
                {vmaxOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}

                <option value={CUSTOM_VMAX_VALUE}>
                  Valeur personnalisée…
                </option>
              </select>

              {vmaxMode === CUSTOM_VMAX_VALUE ? (
                <>
                  <label
                    style={{
                      display: "block",
                      fontSize: 14,
                      marginBottom: 6,
                    }}
                  >
                    Valeur personnalisée
                  </label>

                  <input
                    type="text"
                    value={customVmax}
                    onChange={(event) => setCustomVmax(event.target.value)}
                    placeholder="Entrer une valeur de V Max"
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      padding: "8px 10px",
                      marginBottom: 10,
                    }}
                  />
                </>
              ) : null}

              <div
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    onApplyVmax(vmaxValueToApply);
                    setIsVmaxEditorOpen(false);
                  }}
                  disabled={isVmaxApplyDisabled}
                  style={{
                    padding: "10px 14px",
                    cursor: isVmaxApplyDisabled ? "not-allowed" : "pointer",
                  }}
                >
                  Valider la modification
                </button>

                <button
                  type="button"
                  onClick={() => setIsVmaxEditorOpen(false)}
                  style={{
                    padding: "10px 14px",
                    cursor: "pointer",
                  }}
                >
                  Fermer
                </button>
              </div>
            </div>
          ) : null}

          <p>
            Radio :{" "}
            <button
              type="button"
              onClick={() => setIsRadioEditorOpen((previous) => !previous)}
              style={{
                padding: 0,
                border: "none",
                background: "transparent",
                font: "inherit",
                cursor: "pointer",
                textAlign: "left",
              }}
              title="Cliquer pour éditer Radio"
            >
              <strong>{selectedRow.visible.radio || "—"}</strong>
            </button>
          </p>

          {isRadioEditorOpen ? (
            <div
              style={{
                marginTop: 12,
                marginBottom: 12,
                padding: 12,
                border: "1px solid #d1d5db",
                borderRadius: 8,
                background: "#f9fafb",
              }}
            >
              <h3 style={{ marginTop: 0, marginBottom: 12 }}>Édition Radio</h3>

              <label
                style={{
                  display: "block",
                  fontSize: 14,
                  marginBottom: 6,
                }}
              >
                Valeur
              </label>

              <select
                value={radioMode}
                onChange={(event) => setRadioMode(event.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  marginBottom: 10,
                }}
              >
                {radioOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}

                <option value={CUSTOM_RADIO_VALUE}>
                  Valeur personnalisée…
                </option>
              </select>

              {radioMode === CUSTOM_RADIO_VALUE ? (
                <>
                  <label
                    style={{
                      display: "block",
                      fontSize: 14,
                      marginBottom: 6,
                    }}
                  >
                    Valeur personnalisée
                  </label>

                  <input
                    type="text"
                    value={customRadio}
                    onChange={(event) => setCustomRadio(event.target.value)}
                    placeholder="Entrer une valeur de Radio"
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      padding: "8px 10px",
                      marginBottom: 10,
                    }}
                  />
                </>
              ) : null}

              <div
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    onApplyRadio(radioValueToApply);
                    setIsRadioEditorOpen(false);
                  }}
                  disabled={isRadioApplyDisabled}
                  style={{
                    padding: "10px 14px",
                    cursor: isRadioApplyDisabled ? "not-allowed" : "pointer",
                  }}
                >
                  Valider la modification
                </button>

                <button
                  type="button"
                  onClick={() => setIsRadioEditorOpen(false)}
                  style={{
                    padding: "10px 14px",
                    cursor: "pointer",
                  }}
                >
                  Fermer
                </button>
              </div>
            </div>
          ) : null}

          <p>
            Ramp Caract :{" "}
            <button
              type="button"
              onClick={() => setIsRcEditorOpen((previous) => !previous)}
              style={{
                padding: 0,
                border: "none",
                background: "transparent",
                font: "inherit",
                cursor: "pointer",
                textAlign: "left",
              }}
              title="Cliquer pour éditer Ramp Caract"
            >
              <strong>{selectedRow.visible.rc || "—"}</strong>
            </button>
          </p>

          {isRcEditorOpen ? (
            <div
              style={{
                marginTop: 12,
                marginBottom: 12,
                padding: 12,
                border: "1px solid #d1d5db",
                borderRadius: 8,
                background: "#f9fafb",
              }}
            >
              <h3 style={{ marginTop: 0, marginBottom: 12 }}>
                Édition Ramp Caract
              </h3>

              <label
                style={{
                  display: "block",
                  fontSize: 14,
                  marginBottom: 6,
                }}
              >
                Valeur
              </label>

              <select
                value={rcMode}
                onChange={(event) => setRcMode(event.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  marginBottom: 10,
                }}
              >
                {rcOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}

                <option value={CUSTOM_RC_VALUE}>
                  Valeur personnalisée…
                </option>
              </select>

              {rcMode === CUSTOM_RC_VALUE ? (
                <>
                  <label
                    style={{
                      display: "block",
                      fontSize: 14,
                      marginBottom: 6,
                    }}
                  >
                    Valeur personnalisée
                  </label>

                  <input
                    type="text"
                    value={customRc}
                    onChange={(event) => setCustomRc(event.target.value)}
                    placeholder="Entrer une valeur de Ramp Caract"
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      padding: "8px 10px",
                      marginBottom: 10,
                    }}
                  />
                </>
              ) : null}

              <div
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    onApplyRc(rcValueToApply);
                    setIsRcEditorOpen(false);
                  }}
                  disabled={isRcApplyDisabled}
                  style={{
                    padding: "10px 14px",
                    cursor: isRcApplyDisabled ? "not-allowed" : "pointer",
                  }}
                >
                  Valider la modification
                </button>

                <button
                  type="button"
                  onClick={() => setIsRcEditorOpen(false)}
                  style={{
                    padding: "10px 14px",
                    cursor: "pointer",
                  }}
                >
                  Fermer
                </button>
              </div>
            </div>
          ) : null}

          <hr style={{ margin: "16px 0" }} />

          <p>
            PK ADIF : <strong>{formatTechnicalPk(selectedRow.technical.pkAdif)}</strong>
          </p>
          <p>
            PK LFP : <strong>{formatTechnicalPk(selectedRow.technical.pkLfp)}</strong>
          </p>
          <p>
            PK RFN : <strong>{formatTechnicalPk(selectedRow.technical.pkRfn)}</strong>
          </p>
          <p>
            Réseau source technique :{" "}
            <strong>{selectedRow.technical.network || "—"}</strong>
          </p>
          <p>
            CSV technique : <strong>{selectedRow.technical.csv ? "Oui" : "Non"}</strong>
          </p>

          <hr style={{ margin: "16px 0" }} />

          <p>
            Index source : <strong>{selectedRow.identity.sourceIndex}</strong>
          </p>
          <p>
            Tableau source : <strong>{selectedRow.identity.sourceTableName}</strong>
          </p>
          <p>
            Warnings :{" "}
            <strong>
              {selectedRow.debug.warnings.length > 0
                ? selectedRow.debug.warnings.join(" | ")
                : "aucun"}
            </strong>
          </p>
        </>
      )}

      <p>
        Sens courant : <strong>{directionLabel}</strong>
      </p>
      <p>
        État source : <strong>{sourceStatus}</strong>
      </p>
      <p>
        Lignes disponibles pour ce sens : <strong>{rowCount}</strong>
      </p>
    </div>
  );
}
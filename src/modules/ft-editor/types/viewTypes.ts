export type EditorDirection = "NORD_SUD" | "SUD_NORD";

export type EditorSourceTableName = "nordSud" | "sudNord";

export type EditorFtRowView = {
  id: string;

  identity: {
    sourceTableName: EditorSourceTableName;
    sourceIndex: number;
  };

  visible: {
    pkInternalDisplay: string;
    networkDisplay: string;
    pkDisplay: string;
    dependencia: string;
    com: string;
    hora: string;
    tecn: string;
    conc: string;
    bloqueo: string;
    vmax: string;
    radio: string;
    rc: string;
    noteDisplay: string;
  };

  visual: {
    isNoteOnly: boolean;
    bloqueoBar: boolean;
    vmaxBar: boolean;
    vmaxHighlight: boolean;
    rcBar: boolean;
  };

  technical: {
    network: string | null;
    pkInternal: number | null;
    pkAdif: number | null;
    pkLfp: number | null;
    pkRfn: number | null;
    csv: boolean;
  };

  debug: {
    sourceRaw: unknown;
    warnings: string[];
  };
};
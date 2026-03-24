export type FtLineType = "data" | "note";

export type FtLineCommon = {
  id: string;
  rowKey?: string;
  type: FtLineType;

  reseau: string;

  pkInterne: string;
  pkAdif: string;
  pkLfp: string;
  pkRfn: string;

  bloqueo: string;
  vmax: string;
  sitKm: string;
  dependencia: string;
  radio: string;
  etcs: string;
  rampCaract: string;

  csv: boolean;

  notes: string[];
};

export type FtDirectionCommonTable = {
  rows: FtLineCommon[];
};

export type FtTrainMeta = {
  origine: string;
  destination: string;
};

export type FtTrainData = {
  meta: FtTrainMeta;
  byRowKey: Record<string, unknown>;
};

export type LigneFTNormalized = {
  nordSud: FtDirectionCommonTable;
  sudNord: FtDirectionCommonTable;
  trains?: Record<string, FtTrainData>;
};
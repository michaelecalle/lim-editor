export type FtLineType = "data" | "note";

export type FtLineCommon = {
  id: string;
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

export type LigneFTNormalized = {
  nordSud: FtDirectionCommonTable;
  sudNord: FtDirectionCommonTable;
};
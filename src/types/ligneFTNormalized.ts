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

  numeroEspagne: string;
  numeroFrance: string;

  categorieEspagne: string;
  categorieFrance: string;

  materiel: string;
  composition: string;
};

export type FtTrainVariantDays = {
  monday: boolean;
  tuesday: boolean;
  wednesday: boolean;
  thursday: boolean;
  friday: boolean;
  saturday: boolean;
  sunday: boolean;
};

export type FtTrainVariantValidity = {
  startDate: string;
  endDate: string;
  days: FtTrainVariantDays;
};

export type FtTrainRowData = {
  com?: string;
  hora?: string;
  tecn?: string;
  conc?: string;
};

export type FtTrainVariantMeta = FtTrainMeta & {
  validity: FtTrainVariantValidity;
};

export type FtTrainVariantData = {
  meta: FtTrainVariantMeta;
  byRowKey: Record<string, FtTrainRowData>;
};

export type FtTrainData = {
  meta: FtTrainMeta;
  byRowKey: Record<string, unknown>;
  variants?: FtTrainVariantData[];
};

export type LigneFTNormalized = {
  nordSud: FtDirectionCommonTable;
  sudNord: FtDirectionCommonTable;
  trains?: Record<string, FtTrainData>;
};
export type FtSourceDirectionTable = {
  rows: unknown[];
};

export type FtSourceTrainMeta = {
  origine: string;
  destination: string;
  ligne: string;

  numeroEspagne: string;
  numeroFrance: string;

  categorieEspagne: string;
  categorieFrance: string;

  materiel: string;
  composition: string;
};

export type FtSourceVariantDays = {
  monday: boolean;
  tuesday: boolean;
  wednesday: boolean;
  thursday: boolean;
  friday: boolean;
  saturday: boolean;
  sunday: boolean;
};

export type FtSourceVariantValidity = {
  startDate: string;
  endDate: string;
  days: FtSourceVariantDays;
};

export type FtSourceTrainRowData = {
  com?: string;
  hora?: string;
  tecn?: string;
  conc?: string;
};

export type FtSourceTrainPublishState = "published" | "local";

export type FtSourceTrainVariantMeta = FtSourceTrainMeta & {
  validity: FtSourceVariantValidity;
};

export type FtSourceTrainVariantData = {
  meta: FtSourceTrainVariantMeta;
  byRowKey: Record<string, FtSourceTrainRowData>;
};

export type FtSourceTrainData = {
  variants: FtSourceTrainVariantData[];
  publishState?: FtSourceTrainPublishState;
};

export type FtSourceTrains = Record<string, FtSourceTrainData>;

export type FtSourceDirectionTables = {
  nordSud: FtSourceDirectionTable;
  sudNord: FtSourceDirectionTable;
  trains?: FtSourceTrains;
};
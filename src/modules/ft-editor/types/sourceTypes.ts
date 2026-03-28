export type FtSourceDirectionTable = {
  rows: unknown[];
};

export type FtSourceTrainMeta = {
  origine: string;
  destination: string;
};

export type FtSourceTrainRowData = {
  com?: string;
  hora?: string;
  tecn?: string;
  conc?: string;
};

export type FtSourceTrainPublishState = "published" | "local";

export type FtSourceTrainData = {
  meta: FtSourceTrainMeta;
  byRowKey: Record<string, FtSourceTrainRowData>;
  publishState?: FtSourceTrainPublishState;
};

export type FtSourceTrains = Record<string, FtSourceTrainData>;

export type FtSourceDirectionTables = {
  nordSud: FtSourceDirectionTable;
  sudNord: FtSourceDirectionTable;
  trains?: FtSourceTrains;
};
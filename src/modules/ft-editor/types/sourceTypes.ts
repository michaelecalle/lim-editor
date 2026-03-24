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
};

export type FtSourceTrainData = {
  meta: FtSourceTrainMeta;
  byRowKey: Record<string, FtSourceTrainRowData>;
};

export type FtSourceTrains = Record<string, FtSourceTrainData>;

export type FtSourceDirectionTables = {
  nordSud: FtSourceDirectionTable;
  sudNord: FtSourceDirectionTable;
  trains?: FtSourceTrains;
};
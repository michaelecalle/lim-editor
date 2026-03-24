export type FtSourceDirectionTable = {
  rows: unknown[];
};

export type FtSourceTrainMeta = {
  origine: string;
  destination: string;
};

export type FtSourceTrainData = {
  meta: FtSourceTrainMeta;
  byRowKey: Record<string, unknown>;
};

export type FtSourceTrains = Record<string, FtSourceTrainData>;

export type FtSourceDirectionTables = {
  nordSud: FtSourceDirectionTable;
  sudNord: FtSourceDirectionTable;
  trains?: FtSourceTrains;
};
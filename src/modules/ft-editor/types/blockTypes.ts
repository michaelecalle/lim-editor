export type BlockColumnKind =
  | "bloqueo"
  | "vmax"
  | "radio"
  | "rc";

export type BlockSegment = {
  column: BlockColumnKind;
  startRowIndex: number;
  endRowIndex: number;
  value: string;
};
import type { FtSourceDirectionTables } from "../types/sourceTypes";

function stableSerialize(value: FtSourceDirectionTables): string {
  return JSON.stringify(value);
}

export function areSourceTablesEqual(
  left: FtSourceDirectionTables,
  right: FtSourceDirectionTables,
): boolean {
  return stableSerialize(left) === stableSerialize(right);
}
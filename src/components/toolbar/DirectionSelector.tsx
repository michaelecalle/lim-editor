import type { EditorDirection } from "../../modules/ft-editor/types/viewTypes";

type DirectionSelectorProps = {
  value: EditorDirection;
  onChange: (value: EditorDirection) => void;
};

export default function DirectionSelector({
  value,
  onChange,
}: DirectionSelectorProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
      }}
    >
      <strong>LIM Editor</strong>

      <label>
        Sens :{" "}
        <select
          value={value}
          onChange={(event) =>
            onChange(event.target.value as EditorDirection)
          }
        >
          <option value="NORD_SUD">Nord → Sud</option>
          <option value="SUD_NORD">Sud → Nord</option>
        </select>
      </label>
    </div>
  );
}
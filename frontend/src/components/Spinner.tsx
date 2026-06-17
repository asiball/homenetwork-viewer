// Centered loading spinner — the amber ring used on the detail / edit screens
// while the catalog is still loading. Replaces the inline copies that lived in
// DetailView and EditView (the `.spin` class supplies the rotation).

interface Props {
  /** Caption shown under the ring. */
  label?: string;
}

export function Spinner({ label = "読み込み中..." }: Props) {
  return (
    <div className="center-screen">
      <div
        className="spin"
        style={{
          width: "16px",
          height: "16px",
          border: "2px solid var(--fg-faint)",
          borderTopColor: "var(--amber)",
          borderRadius: "50%",
        }}
      />
      <div style={{ marginTop: 12 }}>{label}</div>
    </div>
  );
}

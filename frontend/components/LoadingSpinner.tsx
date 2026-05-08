export default function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <div
        className="w-8 h-8 rounded-full border-2 animate-spin"
        style={{ borderColor: "var(--bg-border)", borderTopColor: "var(--accent)" }}
      />
    </div>
  );
}

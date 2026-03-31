export default function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="w-8 h-8 border-2 border-[#1f1f1f] border-t-blue-500 rounded-full animate-spin" />
    </div>
  );
}

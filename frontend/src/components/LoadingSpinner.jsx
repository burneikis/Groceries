export default function LoadingSpinner() {
  return (
    <div className="flex justify-center py-12">
      <div className="w-8 h-8 border-3 border-gray-200 dark:border-slate-700 border-t-amber-500 dark:border-t-amber-600 rounded-full animate-spin" />
    </div>
  )
}

import { useEffect } from 'react'
import useStore from '../store/useStore'

export default function ErrorToast() {
  const error = useStore((s) => s.error)
  const clearError = useStore((s) => s.clearError)

  useEffect(() => {
    if (error) {
      const timer = setTimeout(clearError, 5000)
      return () => clearTimeout(timer)
    }
  }, [error, clearError])

  if (!error) return null

  return (
    <div className="fixed top-4 left-4 right-4 z-50 max-w-lg mx-auto animate-slide-down">
      <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center gap-3 shadow-lg">
        <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
        </svg>
        <p className="flex-1 text-sm text-red-800">{error}</p>
        <button
          onClick={clearError}
          className="text-red-400 hover:text-red-600 p-1"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}

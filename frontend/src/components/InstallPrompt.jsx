import { useState, useEffect } from 'react'

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  if (!deferredPrompt || dismissed) return null

  const handleInstall = async () => {
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      setDeferredPrompt(null)
    }
  }

  return (
    <div className="fixed bottom-20 left-4 right-4 z-40 max-w-lg mx-auto bg-white rounded-xl shadow-lg border border-gray-200 p-4 flex items-center gap-3">
      <div className="flex-1">
        <p className="text-sm font-medium text-gray-900">Install Groceries</p>
        <p className="text-xs text-gray-500">Add to home screen for quick access</p>
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="text-gray-400 hover:text-gray-600 px-2 py-1 text-sm"
      >
        Later
      </button>
      <button
        onClick={handleInstall}
        className="bg-amber-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-600 transition-colors"
      >
        Install
      </button>
    </div>
  )
}

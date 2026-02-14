import useStore from '../store/useStore'

export default function OfflineIndicator() {
  const isOnline = useStore((s) => s.isOnline)
  const pendingSyncs = useStore((s) => s.pendingSyncs)

  if (isOnline && pendingSyncs === 0) return null

  return (
    <div className={`fixed top-0 left-0 right-0 z-50 px-4 py-2 text-center text-sm font-medium animate-slide-down ${
      isOnline
        ? 'bg-amber-100 text-amber-800'
        : 'bg-gray-700 text-white'
    }`}>
      {!isOnline && 'You are offline'}
      {isOnline && pendingSyncs > 0 && `Syncing ${pendingSyncs} pending change${pendingSyncs !== 1 ? 's' : ''}...`}
    </div>
  )
}

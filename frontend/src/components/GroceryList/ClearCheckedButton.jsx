import { useState } from 'react'
import useStore from '../../store/useStore'

export default function ClearCheckedButton({ count }) {
  const deleteCheckedItems = useStore((s) => s.deleteCheckedItems)
  const [clearing, setClearing] = useState(false)

  const handleClear = async () => {
    if (!window.confirm(`Clear ${count} checked item${count === 1 ? '' : 's'}?`)) return
    setClearing(true)
    try {
      await deleteCheckedItems()
    } catch (err) {
      console.error('Failed to clear checked items:', err)
    } finally {
      setClearing(false)
    }
  }

  return (
    <button
      onClick={handleClear}
      disabled={clearing}
      className="text-sm text-gray-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 transition-colors disabled:opacity-40 flex items-center gap-1.5"
    >
      {clearing && <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin inline-block" />}
      Clear {count} checked
    </button>
  )
}

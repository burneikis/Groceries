import useStore from '../../store/useStore'

export default function ClearCheckedButton({ count }) {
  const deleteCheckedItems = useStore((s) => s.deleteCheckedItems)

  const handleClear = async () => {
    if (!window.confirm(`Clear ${count} checked item${count === 1 ? '' : 's'}?`)) return
    try {
      await deleteCheckedItems()
    } catch (err) {
      console.error('Failed to clear checked items:', err)
    }
  }

  return (
    <button
      onClick={handleClear}
      className="text-sm text-gray-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 transition-colors"
    >
      Clear {count} checked
    </button>
  )
}

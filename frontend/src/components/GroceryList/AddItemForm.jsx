import { useState } from 'react'
import useStore from '../../store/useStore'

export default function AddItemForm() {
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [showAmount, setShowAmount] = useState(false)
  const [loading, setLoading] = useState(false)
  const createItem = useStore((s) => s.createItem)

  const handleSubmit = async (e) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return

    setLoading(true)
    try {
      await createItem({
        name: trimmed,
        amount: amount.trim() || undefined,
      })
      setName('')
      setAmount('')
      setShowAmount(false)
    } catch (err) {
      console.error('Failed to add item:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 items-end">
      <div className="flex-1">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Add an item..."
          className="w-full h-12 px-4 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 text-base focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
        />
      </div>

      {showAmount ? (
        <input
          type="text"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Qty"
          className="w-20 h-12 px-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 text-base text-center focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
        />
      ) : (
        <button
          type="button"
          onClick={() => setShowAmount(true)}
          className="h-12 px-3 rounded-xl border border-gray-200 dark:border-slate-700 text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300 hover:border-gray-300 dark:hover:border-slate-600 transition-colors"
          title="Add quantity"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </button>
      )}

      <button
        type="submit"
        disabled={!name.trim() || loading}
        className="relative h-12 px-5 rounded-xl bg-amber-500 dark:bg-amber-600 text-white font-semibold text-base hover:bg-amber-600 dark:hover:bg-amber-700 active:bg-amber-700 dark:active:bg-amber-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        <span className={`inline-flex items-center justify-center ${loading ? 'invisible' : ''}`}>Add</span>
        {loading && <span className="absolute inset-0 flex items-center justify-center"><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /></span>}
      </button>
    </form>
  )
}

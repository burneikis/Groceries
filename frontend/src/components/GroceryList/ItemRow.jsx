import { useState } from 'react'
import useStore from '../../store/useStore'

export default function ItemRow({ item }) {
  const { toggleItemCheck, deleteItem, updateItem, categories } = useStore()
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(item.name)
  const [editAmount, setEditAmount] = useState(item.amount || '')
  const [editCategory, setEditCategory] = useState(item.category_id || '')

  const isChecked = !!item.checked

  const handleCheck = () => {
    toggleItemCheck(item.id, !isChecked)
  }

  const handleSave = async () => {
    if (!editName.trim()) return
    try {
      await updateItem(item.id, {
        name: editName.trim(),
        amount: editAmount.trim() || null,
        category_id: editCategory || null,
      })
      setEditing(false)
    } catch (err) {
      console.error('Failed to update item:', err)
    }
  }

  const handleDelete = () => {
    if (!window.confirm(`Delete "${item.name}"?`)) return
    deleteItem(item.id)
  }

  if (editing) {
    return (
      <div className="px-4 py-3 border-t border-gray-50 dark:border-slate-700 space-y-2">
        <input
          type="text"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 text-base focus:outline-none focus:ring-2 focus:ring-amber-400"
          autoFocus
        />
        <div className="flex gap-2">
          <input
            type="text"
            value={editAmount}
            onChange={(e) => setEditAmount(e.target.value)}
            placeholder="Qty"
            className="w-24 px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 text-base focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
          <select
            value={editCategory}
            onChange={(e) => setEditCategory(e.target.value ? Number(e.target.value) : '')}
            className="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 text-base bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            <option value="">No category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-2 justify-end">
          <button
            onClick={() => setEditing(false)}
            className="px-3 py-1.5 text-sm text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-3 py-1.5 text-sm bg-amber-500 dark:bg-amber-600 text-white rounded-lg hover:bg-amber-600 dark:hover:bg-amber-700"
          >
            Save
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3 border-t border-gray-50 dark:border-slate-700 group">
      <button
        onClick={handleCheck}
        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
          isChecked
            ? 'bg-amber-500 dark:bg-amber-600 border-amber-500 dark:border-amber-600'
            : 'border-gray-300 dark:border-slate-600 hover:border-amber-400 dark:hover:border-amber-500'
        }`}
      >
        {isChecked && (
          <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
          </svg>
        )}
      </button>

      <div
        className={`flex-1 min-w-0 cursor-pointer transition-opacity duration-200 ${isChecked ? 'opacity-50' : ''}`}
        onClick={() => !isChecked && setEditing(true)}
      >
        <span className={`text-sm transition-colors duration-200 ${isChecked ? 'line-through text-gray-400 dark:text-slate-500' : 'text-gray-900 dark:text-slate-100'}`}>
          {item.name}
        </span>
        {item.amount && (
          <span className="ml-2 text-xs text-gray-400 dark:text-slate-500">{item.amount}</span>
        )}
        {item.description && (
          <p className="text-xs text-gray-400 dark:text-slate-500 truncate">{item.description}</p>
        )}
      </div>

      <button
        onClick={handleDelete}
        className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 p-1 text-gray-300 dark:text-slate-600 hover:text-red-400 dark:hover:text-red-400 active:text-red-400 transition-all"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
        </svg>
      </button>
    </div>
  )
}

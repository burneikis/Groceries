import { useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import useStore from '../../store/useStore'

export default function CategoryRow({ category }) {
  const { updateCategory, deleteCategory } = useStore()
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(category.name)
  const [deleting, setDeleting] = useState(false)

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: category.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const handleSave = async () => {
    if (!editName.trim() || editName.trim() === category.name) {
      setEditName(category.name)
      setEditing(false)
      return
    }
    try {
      await updateCategory(category.id, editName.trim())
      setEditing(false)
    } catch (err) {
      console.error('Failed to update category:', err)
      setEditName(category.name)
    }
  }

  const handleDelete = async () => {
    if (!window.confirm(`Delete "${category.name}"?`)) return
    setDeleting(true)
    try {
      await deleteCategory(category.id)
    } catch (err) {
      alert(err.message)
      setDeleting(false)
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 bg-white dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-slate-700 px-3 py-2.5 ${
        isDragging ? 'opacity-50 shadow-lg' : ''
      }`}
    >
      <button
        {...attributes}
        {...listeners}
        className="p-1 text-gray-300 dark:text-slate-600 hover:text-gray-500 dark:hover:text-slate-400 cursor-grab active:cursor-grabbing touch-none"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
        </svg>
      </button>

      {editing ? (
        <input
          type="text"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onBlur={handleSave}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave()
            if (e.key === 'Escape') {
              setEditName(category.name)
              setEditing(false)
            }
          }}
          className="flex-1 px-2 py-1 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 text-base focus:outline-none focus:ring-2 focus:ring-amber-400"
          autoFocus
        />
      ) : (
        <span
          className="flex-1 text-sm text-gray-800 dark:text-slate-200 cursor-pointer"
          onClick={() => setEditing(true)}
        >
          {category.name}
        </span>
      )}

      <button
        onClick={handleDelete}
        disabled={deleting}
        className="p-1 text-gray-300 dark:text-slate-600 hover:text-red-400 dark:hover:text-red-400 transition-colors disabled:opacity-40"
      >
        {deleting
          ? <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin inline-block" />
          : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
            </svg>
        }
      </button>
    </div>
  )
}

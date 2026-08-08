import { useState } from 'react'
import { Link } from 'react-router-dom'
import useStore from '../../store/useStore'

export default function RecipeCard({ recipe }) {
  const { addRecipeToList, removeRecipeFromList, deleteRecipe, toggleRecipeRegular, items } = useStore()
  const [adding, setAdding] = useState(false)
  const [added, setAdded] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const isOnList = items.some((i) => i.recipe_id === recipe.id)

  const handleAddToList = async (e) => {
    e.preventDefault()
    e.stopPropagation()
    setAdding(true)
    try {
      await addRecipeToList(recipe.id)
      setAdded(true)
      setTimeout(() => setAdded(false), 2000)
    } catch (err) {
      console.error('Failed to add recipe to list:', err)
    } finally {
      setAdding(false)
    }
  }

  const handleRemoveFromList = async (e) => {
    e.preventDefault()
    e.stopPropagation()
    setRemoving(true)
    try {
      await removeRecipeFromList(recipe.id)
    } catch (err) {
      console.error('Failed to remove recipe from list:', err)
    } finally {
      setRemoving(false)
    }
  }

  const handleToggleRegular = async (e) => {
    e.preventDefault()
    e.stopPropagation()
    try {
      await toggleRecipeRegular(recipe.id, !recipe.is_regular)
    } catch (err) {
      console.error('Failed to update regular flag:', err)
    }
  }

  const handleDelete = async (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (!window.confirm(`Delete "${recipe.name}"?`)) return
    setDeleting(true)
    try {
      await deleteRecipe(recipe.id)
    } catch (err) {
      console.error('Failed to delete recipe:', err)
      setDeleting(false)
    }
  }

  return (
    <Link
      to={`/recipes/${recipe.id}`}
      className="block bg-white dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-slate-700 p-4 hover:border-amber-200 dark:hover:border-amber-600 transition-colors"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={handleToggleRegular}
            aria-label={recipe.is_regular ? 'Unmark as regular dinner' : 'Mark as regular dinner'}
            aria-pressed={Boolean(recipe.is_regular)}
            className={`flex-shrink-0 transition-colors ${recipe.is_regular
              ? 'text-amber-500 dark:text-amber-400'
              : 'text-gray-300 dark:text-slate-600 hover:text-amber-400'
              }`}
          >
            <svg
              className="w-5 h-5"
              fill={recipe.is_regular ? 'currentColor' : 'none'}
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.5a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
            </svg>
          </button>
          <h3 className="font-semibold text-gray-900 dark:text-slate-100 truncate">{recipe.name}</h3>
        </div>
        <div className="flex gap-2">
          {isOnList && (
            <button
              onClick={handleRemoveFromList}
              disabled={removing}
              className="relative px-3 py-1.5 text-xs font-medium rounded-lg transition-colors bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50"
            >
              <span className={removing ? 'invisible' : ''}>Remove</span>
              {removing && <span className="absolute inset-0 flex items-center justify-center">...</span>}
            </button>
          )}
          <button
            onClick={handleAddToList}
            disabled={adding}
            className={`relative px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${added
              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
              : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-900/50'
              }`}
          >
            <span className={adding ? 'invisible' : ''}>
              {added ? 'Added!' : 'Add'}
            </span>
            {adding && <span className="absolute inset-0 flex items-center justify-center">...</span>}
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="p-1.5 text-gray-300 dark:text-slate-600 hover:text-red-400 dark:hover:text-red-400 transition-colors disabled:opacity-40"
          >
            {deleting
              ? <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin inline-block" />
              : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
              </svg>
            }
          </button>
        </div>
      </div>
    </Link>
  )
}

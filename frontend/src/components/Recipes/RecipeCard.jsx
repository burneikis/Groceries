import { useState } from 'react'
import { Link } from 'react-router-dom'
import useStore from '../../store/useStore'

export default function RecipeCard({ recipe }) {
  const { addRecipeToList, deleteRecipe } = useStore()
  const [adding, setAdding] = useState(false)
  const [added, setAdded] = useState(false)

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

  const handleDelete = async (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (!window.confirm(`Delete "${recipe.name}"?`)) return
    try {
      await deleteRecipe(recipe.id)
    } catch (err) {
      console.error('Failed to delete recipe:', err)
    }
  }

  return (
    <Link
      to={`/recipes/${recipe.id}`}
      className="block bg-white rounded-xl border border-gray-100 p-4 hover:border-amber-200 transition-colors"
    >
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">{recipe.name}</h3>
        <div className="flex gap-2">
          <button
            onClick={handleAddToList}
            disabled={adding}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              added
                ? 'bg-green-100 text-green-700'
                : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
            }`}
          >
            {added ? 'Added!' : adding ? '...' : 'Add to List'}
          </button>
          <button
            onClick={handleDelete}
            className="p-1.5 text-gray-300 hover:text-red-400 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
            </svg>
          </button>
        </div>
      </div>
    </Link>
  )
}

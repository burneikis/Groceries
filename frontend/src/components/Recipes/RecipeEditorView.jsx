import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import useStore from '../../store/useStore'
import { recipesApi } from '../../services/api'

export default function RecipeEditorView() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { categories, fetchCategories, createRecipe, updateRecipe } = useStore()
  const isNew = !id

  const [name, setName] = useState('')
  const [ingredients, setIngredients] = useState([])
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(!isNew)

  useEffect(() => {
    fetchCategories()
  }, [fetchCategories])

  useEffect(() => {
    if (!isNew) {
      recipesApi.getById(id).then((recipe) => {
        setName(recipe.name)
        setIngredients(
          recipe.ingredients.map((ing) => ({
            name: ing.name,
            amount: ing.amount || '',
            category_id: ing.category_id || '',
          }))
        )
        setLoading(false)
      }).catch(() => {
        navigate('/recipes', { replace: true })
      })
    }
  }, [id, isNew, navigate])

  const addIngredient = () => {
    setIngredients([...ingredients, { name: '', amount: '', category_id: '' }])
  }

  const updateIngredient = (index, field, value) => {
    setIngredients(
      ingredients.map((ing, i) =>
        i === index ? { ...ing, [field]: value } : ing
      )
    )
  }

  const removeIngredient = (index) => {
    setIngredients(ingredients.filter((_, i) => i !== index))
  }

  const handleSave = async () => {
    if (!name.trim()) return
    setSaving(true)

    const recipe = {
      name: name.trim(),
      ingredients: ingredients
        .filter((ing) => ing.name.trim())
        .map((ing, i) => ({
          name: ing.name.trim(),
          amount: ing.amount.trim() || null,
          category_id: ing.category_id || null,
          position: i,
        })),
    }

    try {
      if (isNew) {
        await createRecipe(recipe)
      } else {
        await updateRecipe(Number(id), recipe)
      }
      navigate('/recipes')
    } catch (err) {
      console.error('Failed to save recipe:', err)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="max-w-lg mx-auto px-4 py-8 text-center text-gray-400">
        Loading...
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto px-4">
      <header className="py-4 flex items-center justify-between">
        <button
          onClick={() => navigate('/recipes')}
          className="text-gray-500 hover:text-gray-700"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
        </button>
        <h1 className="text-lg font-bold text-gray-900">
          {isNew ? 'New Recipe' : 'Edit Recipe'}
        </h1>
        <button
          onClick={handleSave}
          disabled={saving || !name.trim()}
          className="px-4 py-1.5 rounded-lg bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 disabled:opacity-40 transition-colors"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </header>

      <div className="space-y-4">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Recipe name"
          className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-lg font-medium focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
          autoFocus={isNew}
        />

        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700">Ingredients</h2>
            <button
              onClick={addIngredient}
              className="text-sm text-amber-600 hover:text-amber-700 font-medium"
            >
              + Add Ingredient
            </button>
          </div>

          <div className="space-y-2">
            {ingredients.map((ing, index) => (
              <div key={index} className="bg-white rounded-xl border border-gray-100 p-3 space-y-2">
                <div className="flex gap-2 items-center">
                  <input
                    type="text"
                    value={ing.name}
                    onChange={(e) => updateIngredient(index, 'name', e.target.value)}
                    placeholder="Ingredient name"
                    className="flex-1 min-w-0 px-2 py-1.5 rounded-lg border border-gray-200 text-base focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                  <button
                    onClick={() => removeIngredient(index)}
                    className="p-1 text-gray-300 hover:text-red-400 active:text-red-400 transition-colors flex-shrink-0"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={ing.amount}
                    onChange={(e) => updateIngredient(index, 'amount', e.target.value)}
                    placeholder="Qty"
                    className="w-20 px-2 py-1.5 rounded-lg border border-gray-200 text-base text-center focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                  <select
                    value={ing.category_id}
                    onChange={(e) =>
                      updateIngredient(index, 'category_id', e.target.value ? Number(e.target.value) : '')
                    }
                    className="flex-1 min-w-0 px-2 py-1.5 rounded-lg border border-gray-200 text-base bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                  >
                    <option value="">Category</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>

          {ingredients.length === 0 && (
            <button
              onClick={addIngredient}
              className="w-full py-8 rounded-xl border-2 border-dashed border-gray-200 text-gray-400 hover:border-amber-300 hover:text-amber-500 transition-colors"
            >
              Add your first ingredient
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

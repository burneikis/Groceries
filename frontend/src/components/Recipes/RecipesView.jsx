import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import useStore from '../../store/useStore'
import RecipeCard from './RecipeCard'
import LoadingSpinner from '../LoadingSpinner'

export default function RecipesView() {
  const { recipes, loading, fetchRecipes } = useStore()
  const navigate = useNavigate()

  useEffect(() => {
    if (sessionStorage.getItem('recipe_draft_new')) {
      navigate('/recipes/new', { replace: true })
      return
    }
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i)
      if (key?.startsWith('recipe_draft_') && key !== 'recipe_draft_new') {
        navigate(`/recipes/${key.replace('recipe_draft_', '')}`, { replace: true })
        return
      }
    }
  }, [navigate])

  useEffect(() => {
    fetchRecipes()
  }, [fetchRecipes])

  const isInitialLoad = loading.recipes && recipes.length === 0

  return (
    <div className="max-w-lg mx-auto px-4">
      <header className="py-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">Recipes</h1>
        <div className="flex items-center gap-2">
        <Link
          to="/dinner"
          className="px-3 py-2 rounded-xl border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 text-sm font-semibold hover:bg-amber-50 dark:hover:bg-amber-900/30 transition-colors"
        >
          What&apos;s for dinner?
        </Link>
        <Link
          to="/recipes/new"
          className="px-4 py-2 rounded-xl bg-amber-500 dark:bg-amber-600 text-white text-sm font-semibold hover:bg-amber-600 dark:hover:bg-amber-700 active:bg-amber-700 dark:active:bg-amber-800 transition-colors"
        >
          + New Recipe
        </Link>
        </div>
      </header>

      <div className="space-y-3">
        {recipes.map((recipe) => (
          <RecipeCard key={recipe.id} recipe={recipe} />
        ))}
      </div>

      {isInitialLoad && <LoadingSpinner />}

      {!isInitialLoad && recipes.length === 0 && (
        <p className="text-center text-gray-400 dark:text-slate-500 mt-12">
          No recipes yet. Create one to get started!
        </p>
      )}
    </div>
  )
}

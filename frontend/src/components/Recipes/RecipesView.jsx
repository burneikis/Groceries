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
          aria-label="What's for dinner?"
          title="What's for dinner?"
          className="p-2 rounded-xl border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/30 transition-colors"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-5 h-5"
          >
            <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
            <path d="M20 3v4" />
            <path d="M22 5h-4" />
            <path d="M4 17v2" />
            <path d="M5 18H3" />
          </svg>
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

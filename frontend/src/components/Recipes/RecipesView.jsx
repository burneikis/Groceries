import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import useStore from '../../store/useStore'
import RecipeCard from './RecipeCard'
import LoadingSpinner from '../LoadingSpinner'

export default function RecipesView() {
  const { recipes, loading, fetchRecipes } = useStore()

  useEffect(() => {
    fetchRecipes()
  }, [fetchRecipes])

  const isInitialLoad = loading.recipes && recipes.length === 0

  return (
    <div className="max-w-lg mx-auto px-4">
      <header className="py-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Recipes</h1>
        <Link
          to="/recipes/new"
          className="px-4 py-2 rounded-xl bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 active:bg-amber-700 transition-colors"
        >
          + New Recipe
        </Link>
      </header>

      <div className="space-y-3">
        {recipes.map((recipe) => (
          <RecipeCard key={recipe.id} recipe={recipe} />
        ))}
      </div>

      {isInitialLoad && <LoadingSpinner />}

      {!isInitialLoad && recipes.length === 0 && (
        <p className="text-center text-gray-400 mt-12">
          No recipes yet. Create one to get started!
        </p>
      )}
    </div>
  )
}

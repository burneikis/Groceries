import { Routes, Route, Navigate } from 'react-router-dom'
import Navigation from './components/Navigation'
import GroceryListView from './components/GroceryList/GroceryListView'
import RecipesView from './components/Recipes/RecipesView'
import RecipeEditorView from './components/Recipes/RecipeEditorView'
import SettingsView from './components/Settings/SettingsView'

export default function App() {
  return (
    <div className="flex flex-col min-h-[100dvh]">
      <main className="flex-1 pb-20">
        <Routes>
          <Route path="/" element={<GroceryListView />} />
          <Route path="/recipes" element={<RecipesView />} />
          <Route path="/recipes/new" element={<RecipeEditorView />} />
          <Route path="/recipes/:id" element={<RecipeEditorView />} />
          <Route path="/settings" element={<SettingsView />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <Navigation />
    </div>
  )
}

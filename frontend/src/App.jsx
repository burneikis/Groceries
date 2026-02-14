import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Navigation from './components/Navigation'
import OfflineIndicator from './components/OfflineIndicator'
import ErrorToast from './components/ErrorToast'
import InstallPrompt from './components/InstallPrompt'
import GroceryListView from './components/GroceryList/GroceryListView'
import RecipesView from './components/Recipes/RecipesView'
import RecipeEditorView from './components/Recipes/RecipeEditorView'
import SettingsView from './components/Settings/SettingsView'
import useStore from './store/useStore'

export default function App() {
  const initOfflineSupport = useStore((s) => s.initOfflineSupport)

  useEffect(() => {
    return initOfflineSupport()
  }, [initOfflineSupport])

  return (
    <div className="flex flex-col min-h-[100dvh]">
      <OfflineIndicator />
      <ErrorToast />
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
      <InstallPrompt />
    </div>
  )
}

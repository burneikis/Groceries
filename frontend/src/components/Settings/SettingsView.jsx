import { useEffect } from 'react'
import useStore from '../../store/useStore'
import CategoryManager from './CategoryManager'
import ThemeSelector from './ThemeSelector'

export default function SettingsView() {
  const fetchCategories = useStore((s) => s.fetchCategories)

  useEffect(() => {
    fetchCategories()
  }, [fetchCategories])

  return (
    <div className="max-w-lg mx-auto px-4">
      <header className="py-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">Settings</h1>
      </header>

      <section className="mb-8">
        <h2 className="text-sm font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-3">
          Appearance
        </h2>
        <ThemeSelector />
      </section>

      <section>
        <h2 className="text-sm font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-3">
          Categories
        </h2>
        <CategoryManager />
      </section>
    </div>
  )
}

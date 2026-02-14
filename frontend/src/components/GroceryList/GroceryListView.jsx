import { useEffect } from 'react'
import useStore from '../../store/useStore'
import AddItemForm from './AddItemForm'
import CategorySection from './CategorySection'
import ClearCheckedButton from './ClearCheckedButton'
import LoadingSpinner from '../LoadingSpinner'

export default function GroceryListView() {
  const { items, categories, loading, fetchItems, fetchCategories } = useStore()

  useEffect(() => {
    fetchItems()
    fetchCategories()
  }, [fetchItems, fetchCategories])

  const isInitialLoad = (loading.items || loading.categories) && items.length === 0

  const checkedCount = items.filter((i) => i.checked).length

  // Group all items by category (checked items stay in their category)
  const grouped = categories
    .map((cat) => ({
      category: cat,
      items: items.filter((i) => i.category_id === cat.id),
    }))
    .filter((g) => g.items.length > 0)

  // Items with no category
  const uncategorized = items.filter((i) => !i.category_id)

  return (
    <div className="max-w-lg mx-auto px-4">
      <header className="py-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Grocery List</h1>
        {checkedCount > 0 && <ClearCheckedButton count={checkedCount} />}
      </header>

      <AddItemForm />

      <div className="mt-4 space-y-3 animate-fade-in">
        {uncategorized.length > 0 && (
          <CategorySection
            category={{ id: null, name: 'Uncategorized' }}
            items={uncategorized}
          />
        )}

        {grouped.map(({ category, items }) => (
          <CategorySection key={category.id} category={category} items={items} />
        ))}
      </div>

      {isInitialLoad && <LoadingSpinner />}

      {!isInitialLoad && items.length === 0 && (
        <p className="text-center text-gray-400 mt-12">
          Your list is empty. Add some items above!
        </p>
      )}
    </div>
  )
}

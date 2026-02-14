import { useEffect } from 'react'
import useStore from '../../store/useStore'
import AddItemForm from './AddItemForm'
import CategorySection from './CategorySection'
import ClearCheckedButton from './ClearCheckedButton'

export default function GroceryListView() {
  const { items, categories, fetchItems, fetchCategories } = useStore()

  useEffect(() => {
    fetchItems()
    fetchCategories()
  }, [fetchItems, fetchCategories])

  // Group items by category
  const uncheckedItems = items.filter((i) => !i.checked)
  const checkedItems = items.filter((i) => i.checked)

  const grouped = categories
    .map((cat) => ({
      category: cat,
      items: uncheckedItems.filter((i) => i.category_id === cat.id),
    }))
    .filter((g) => g.items.length > 0)

  // Items with no category
  const uncategorized = uncheckedItems.filter((i) => !i.category_id)

  return (
    <div className="max-w-lg mx-auto px-4">
      <header className="py-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Grocery List</h1>
        {checkedItems.length > 0 && <ClearCheckedButton count={checkedItems.length} />}
      </header>

      <AddItemForm />

      <div className="mt-4 space-y-3">
        {uncategorized.length > 0 && (
          <CategorySection
            category={{ id: null, name: 'Uncategorized' }}
            items={uncategorized}
          />
        )}

        {grouped.map(({ category, items }) => (
          <CategorySection key={category.id} category={category} items={items} />
        ))}

        {checkedItems.length > 0 && (
          <CategorySection
            category={{ id: '__checked', name: 'Checked' }}
            items={checkedItems}
            defaultCollapsed
          />
        )}
      </div>

      {items.length === 0 && (
        <p className="text-center text-gray-400 mt-12">
          Your list is empty. Add some items above!
        </p>
      )}
    </div>
  )
}

import { useState } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import useStore from '../../store/useStore'
import ItemRow from './ItemRow'

export default function CategorySection({ category, items, defaultCollapsed = false }) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)
  const { reorderItems } = useStore()

  const uncheckedItems = items.filter((i) => !i.checked)
  const checkedItems = items.filter((i) => i.checked)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleDragEnd = (event) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = uncheckedItems.findIndex((i) => i.id === active.id)
    const newIndex = uncheckedItems.findIndex((i) => i.id === over.id)
    const reordered = arrayMove(uncheckedItems, oldIndex, newIndex)
    reorderItems(reordered)
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-slate-700 overflow-hidden">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-700 dark:text-slate-200">{category.name}</span>
          <span className="text-xs text-gray-400 dark:text-slate-500 bg-gray-100 dark:bg-slate-700 px-2 py-0.5 rounded-full">
            {items.length}
          </span>
        </div>
        <svg
          className={`w-4 h-4 text-gray-400 dark:text-slate-500 transition-transform duration-200 ${collapsed ? '' : 'rotate-180'}`}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      <div
        className={`transition-all duration-200 ease-in-out ${
          collapsed ? 'max-h-0 overflow-hidden' : 'max-h-[2000px]'
        }`}
      >
        <div className="border-t border-gray-50 dark:border-slate-700">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={uncheckedItems.map((i) => i.id)}
              strategy={verticalListSortingStrategy}
            >
              {uncheckedItems.map((item) => (
                <ItemRow key={item.id} item={item} categoryItemCount={items.length} draggable />
              ))}
            </SortableContext>
          </DndContext>
          {checkedItems.map((item) => (
            <ItemRow key={item.id} item={item} categoryItemCount={items.length} />
          ))}
        </div>
      </div>
    </div>
  )
}

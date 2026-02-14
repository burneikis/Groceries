import { useState } from 'react'
import ItemRow from './ItemRow'

export default function CategorySection({ category, items, defaultCollapsed = false }) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-700">{category.name}</span>
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
            {items.length}
          </span>
        </div>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${collapsed ? '' : 'rotate-180'}`}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {!collapsed && (
        <div className="border-t border-gray-50">
          {items.map((item) => (
            <ItemRow key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  )
}

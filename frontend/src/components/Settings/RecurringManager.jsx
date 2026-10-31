import useStore from '../../store/useStore'
import { sortRecurring } from '../../utils/recurring'
import RecurringForm from './RecurringForm'
import RecurringRow from './RecurringRow'

/**
 * Settings section for recurring items (milk, bread, ...). They are offered,
 * unticked, as a step in the "What's for dinner?" wizard.
 */
export default function RecurringManager() {
  const { categories, recurringItems, createRecurringItem } = useStore()
  const sorted = sortRecurring(recurringItems, categories)

  return (
    <div className="space-y-3">
      <RecurringForm onSubmit={createRecurringItem} submitLabel="Add" resetOnSubmit />

      {sorted.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-slate-500">
          No recurring items yet. They show up in the dinner wizard so you can add them in one go.
        </p>
      ) : (
        <div className="space-y-1">
          {sorted.map((recurring) => (
            <RecurringRow key={recurring.id} recurring={recurring} />
          ))}
        </div>
      )}
    </div>
  )
}

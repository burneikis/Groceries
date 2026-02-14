import useStore from '../../store/useStore'

const SunIcon = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32l1.41-1.41" />
  </svg>
)

const MoonIcon = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
)

const ComputerIcon = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
    <path d="M8 21h8m-4-4v4" />
  </svg>
)

const CheckIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
)

export default function ThemeSelector() {
  const theme = useStore((s) => s.theme)
  const setTheme = useStore((s) => s.setTheme)

  const options = [
    { value: 'light', label: 'Light', icon: SunIcon },
    { value: 'dark', label: 'Dark', icon: MoonIcon },
    { value: 'system', label: 'System', icon: ComputerIcon },
  ]

  return (
    <div className="grid grid-cols-3 gap-3">
      {options.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          onClick={() => setTheme(value)}
          className={`
            relative flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all
            ${
              theme === value
                ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-600'
                : 'border-gray-200 bg-white hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700'
            }
          `}
        >
          {theme === value && (
            <div className="absolute top-2 right-2 text-amber-600 dark:text-amber-400">
              <CheckIcon />
            </div>
          )}
          <div className={theme === value ? 'text-amber-600 dark:text-amber-400' : 'text-gray-700 dark:text-slate-300'}>
            <Icon />
          </div>
          <span className={`text-sm font-medium ${theme === value ? 'text-amber-900 dark:text-amber-100' : 'text-gray-900 dark:text-slate-100'}`}>
            {label}
          </span>
        </button>
      ))}
    </div>
  )
}

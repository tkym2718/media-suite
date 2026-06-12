interface ToggleProps {
  checked: boolean
  onChange: (next: boolean) => void
  label?: string
  activeColor?: string
}

export function Toggle({ checked, onChange, label, activeColor = 'bg-indigo-600' }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex items-center gap-2.5 select-none focus:outline-none group"
    >
      <span
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          checked ? activeColor : 'bg-zinc-300 dark:bg-zinc-600'
        }`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0.5'
          }`}
        />
      </span>
      {label && (
        <span
          className={`text-sm font-medium transition-colors ${
            checked ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-500'
          }`}
        >
          {label}
        </span>
      )}
    </button>
  )
}

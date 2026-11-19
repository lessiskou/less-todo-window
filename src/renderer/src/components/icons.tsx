interface IconProps {
  size?: number
  className?: string
}

function base(size: number, className?: string) {
  return {
    viewBox: '0 0 14 14',
    width: size,
    height: size,
    className,
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.4,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    focusable: false
  } as const
}

export function SearchIcon({ size = 14, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <circle cx="6.2" cy="6.2" r="4.2" />
      <path d="M9.3 9.3 12.5 12.5" />
    </svg>
  )
}

export function SettingsIcon({ size = 14, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M2.5 4.5h9M2.5 9.5h9" />
      <circle cx="5.5" cy="4.5" r="1.6" />
      <circle cx="8.5" cy="9.5" r="1.6" />
    </svg>
  )
}

export function CloseIcon({ size = 14, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M4 4l6 6M10 4l-6 6" />
    </svg>
  )
}

export function BellIcon({ size = 14, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M7 2.2a3.1 3.1 0 0 1 3.1 3.1v2.4l.9 1.3H3l.9-1.3V5.3A3.1 3.1 0 0 1 7 2.2Z" />
      <path d="M5.7 11.2a1.4 1.4 0 0 0 2.6 0" />
    </svg>
  )
}

export function MoveDownIcon({ size = 14, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M7 2.8v6M4.4 6.3 7 8.9l2.6-2.6" />
      <path d="M3 11.4h8" />
    </svg>
  )
}

export function MoveUpIcon({ size = 14, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M7 8.9v-6M4.4 5.4 7 2.8l2.6 2.6" />
      <path d="M3 11.4h8" />
    </svg>
  )
}

export function ChevronIcon({ size = 14, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M5.2 3.5 8.7 7l-3.5 3.5" />
    </svg>
  )
}

export function PlusIcon({ size = 14, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M7 2.8v8.4M2.8 7h8.4" />
    </svg>
  )
}

export function CheckIcon({ size = 10, className }: IconProps) {
  return (
    <svg {...base(size, className)} viewBox="0 0 12 12" strokeWidth={1.8}>
      <path d="M2.5 6.2 4.8 8.5 9.5 3.5" />
    </svg>
  )
}

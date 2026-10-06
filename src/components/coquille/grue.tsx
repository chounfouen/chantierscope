import { cn } from '@/lib/utils'

/** Silhouette de grue a tour, en filigrane : la signature du chantier. */
export function Grue({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 220 200"
      className={cn('text-marque pointer-events-none opacity-[0.06]', className)}
      style={style}
      fill="none"
      stroke="currentColor"
      strokeWidth="6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M120 200V40M100 200V40M100 40h20M100 70l20 20M120 70l-20 20M100 110l20 20M120 110l-20 20M100 150l20 20M120 150l-20 20" />
      <path d="M20 40h195M110 40V10M110 10L20 40M110 10l105 30M180 40v40M172 80h16v14h-16z" />
      <path d="M30 40v22h30V40" />
    </svg>
  )
}

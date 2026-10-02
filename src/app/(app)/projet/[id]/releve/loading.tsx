import { Skeleton } from '@/components/ui/skeleton'

export default function Chargement() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6" aria-busy aria-label="Chargement">
      <Skeleton className="h-4 w-48" />
      <Skeleton className="mt-4 h-7 w-64" />
      <Skeleton className="mt-2 h-4 w-80" />
      <div className="mt-6 space-y-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-14 w-full rounded-xl" />
        ))}
      </div>
    </div>
  )
}

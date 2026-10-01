import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export default function Chargement() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6" aria-busy aria-label="Chargement">
      <Skeleton className="h-4 w-48" />
      <Skeleton className="mt-4 h-7 w-96" />
      <Skeleton className="mt-2 h-4 w-72" />

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="pt-1">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="mt-2 h-7 w-20" />
              <Skeleton className="mt-1.5 h-3 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mt-6">
        <CardHeader>
          <Skeleton className="h-5 w-44" />
        </CardHeader>
        <CardContent className="space-y-4">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i}>
              <Skeleton className="h-4 w-56" />
              <Skeleton className="mt-1.5 h-2.5 w-full" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

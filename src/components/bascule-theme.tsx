'use client'

import { Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'

export function BasculeTheme() {
  const { resolvedTheme, setTheme } = useTheme()
  const sombre = resolvedTheme === 'dark'

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={sombre ? 'Passer en thème clair' : 'Passer en thème sombre'}
      onClick={() => setTheme(sombre ? 'light' : 'dark')}
    >
      {sombre ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  )
}

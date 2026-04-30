import { useEffect, useState } from 'react'

type Theme = 'dark' | 'light'

function getInitial(): Theme {
  const stored = localStorage.getItem('dcb_theme') as Theme | null
  if (stored) return stored
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getInitial)

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'light') {
      root.classList.add('light')
      root.style.colorScheme = 'light'
      document.body.style.backgroundColor = '#EEF3F8'
      document.body.style.color = '#1A1620'
    } else {
      root.classList.remove('light')
      root.style.colorScheme = 'dark'
      document.body.style.backgroundColor = '#1A1620'
      document.body.style.color = '#EEF3F8'
    }
    localStorage.setItem('dcb_theme', theme)
  }, [theme])

  const toggle = () => setTheme(t => t === 'dark' ? 'light' : 'dark')

  return { theme, toggle, isDark: theme === 'dark' }
}

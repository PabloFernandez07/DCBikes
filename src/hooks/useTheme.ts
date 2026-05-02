import { useEffect } from 'react'

export function useTheme() {
  useEffect(() => {
    const root = document.documentElement
    root.classList.remove('light')
    root.style.colorScheme = 'dark'
    document.body.style.backgroundColor = '#1A1620'
    document.body.style.color = '#EEF3F8'
  }, [])

  return { theme: 'dark' as string, toggle: () => {}, isDark: true }
}

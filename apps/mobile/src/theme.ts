import { useColorScheme } from 'react-native'

export type Theme = {
  background: string
  surface: string
  text: string
  muted: string
  border: string
  primary: string
  primaryPressed: string
  onPrimary: string
  quietAccent: string
}

export const lightTheme: Theme = {
  background: '#F7F3EB',
  surface: '#FFFDF9',
  text: '#211F1B',
  muted: '#655F57',
  border: '#D8D0C4',
  primary: '#B63A32',
  primaryPressed: '#8F2B26',
  onPrimary: '#FFFFFF',
  quietAccent: '#E9DDD2',
}

export const darkTheme: Theme = {
  background: '#161512',
  surface: '#24211D',
  text: '#F8F2E8',
  muted: '#C6BCAF',
  border: '#4A443D',
  primary: '#FF8A7A',
  primaryPressed: '#FFAD9F',
  onPrimary: '#161512',
  quietAccent: '#382C27',
}

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? darkTheme : lightTheme
}
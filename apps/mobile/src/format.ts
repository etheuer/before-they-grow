const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** 'YYYY-MM-DD' → 'August 11, 2026' in the memory's own local calendar. */
export function formatDisplayDate(localDate: string): string {
  const [year, month, day] = localDate.split('-').map(Number)
  if (!year || !month || !day) return localDate
  return `${MONTHS[month - 1] ?? month} ${day}, ${year}`
}
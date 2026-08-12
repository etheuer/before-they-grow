import { useEffect, useState } from 'react'
import { AccessibilityInfo } from 'react-native'

/** True when the system asks for reduced motion; skip nonessential animation. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    let cancelled = false
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (!cancelled) setReduced(value)
    })
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced)
    return () => {
      cancelled = true
      subscription.remove()
    }
  }, [])
  return reduced
}

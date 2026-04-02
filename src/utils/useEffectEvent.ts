import { useCallback, useRef } from 'react'

export function useEffectEvent<T extends (...args: any[]) => any>(
  callback: T,
): T {
  const ref = useRef(callback)
  ref.current = callback
  return useCallback(((...args: Parameters<T>) => ref.current(...args)) as T, [])
}

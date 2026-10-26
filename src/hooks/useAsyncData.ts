import { useCallback, useEffect, useRef, useState } from 'react'
import { getErrorMessage, logError } from '@/lib/errors'

interface AsyncState<T> {
  data: T | null
  loading: boolean
  error: string | null
}

/**
 * Small data-fetching helper used by every screen.
 *
 * `key` acts as the cache key: whenever it changes the loader re-runs. Loaders
 * are read through a ref so callers do not need to memoise them.
 */
export function useAsyncData<T>(key: string, loader: () => Promise<T>) {
  const loaderRef = useRef(loader)
  const [nonce, setNonce] = useState(0)
  const [state, setState] = useState<AsyncState<T>>({ data: null, loading: true, error: null })
  const mounted = useRef(true)

  useEffect(() => {
    loaderRef.current = loader
  }, [loader])

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setState((current) => ({ ...current, loading: true, error: null }))

    loaderRef
      .current()
      .then((result) => {
        if (!cancelled && mounted.current) setState({ data: result, loading: false, error: null })
      })
      .catch((error) => {
        if (cancelled || !mounted.current) return
        logError(`useAsyncData(${key})`, error)
        setState({ data: null, loading: false, error: getErrorMessage(error) })
      })

    return () => {
      cancelled = true
    }
  }, [key, nonce])

  const reload = useCallback(() => setNonce((value) => value + 1), [])
  const setData = useCallback((updater: T | ((current: T | null) => T | null)) => {
    setState((current) => ({
      ...current,
      data:
        typeof updater === 'function'
          ? (updater as (value: T | null) => T | null)(current.data)
          : updater,
    }))
  }, [])

  return { ...state, reload, setData }
}

/** Debounces a value — used to keep search fields from firing on every keystroke. */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(timer)
  }, [value, delay])

  return debounced
}

/** Tracks a media query, used to collapse the sidebar on small screens. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia(query).matches,
  )

  useEffect(() => {
    const list = window.matchMedia(query)
    const handler = (event: MediaQueryListEvent) => setMatches(event.matches)
    setMatches(list.matches)
    list.addEventListener('change', handler)
    return () => list.removeEventListener('change', handler)
  }, [query])

  return matches
}

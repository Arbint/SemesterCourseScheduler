import { useState, useCallback } from 'react'

export interface UndoAction {
  label: string
  undo: () => Promise<void>
}

const MAX_UNDO_STACK = 50

// Generic LIFO undo stack. Each pushed action knows how to reverse itself
// (via its own API calls) — this hook only tracks the stack, it doesn't
// know anything about what's being undone.
export function useUndoStack() {
  const [stack, setStack] = useState<UndoAction[]>([])

  const push = useCallback((action: UndoAction) => {
    setStack(prev => [...prev, action].slice(-MAX_UNDO_STACK))
  }, [])

  const removeLast = useCallback(() => {
    setStack(prev => prev.slice(0, -1))
  }, [])

  const clear = useCallback(() => setStack([]), [])

  return { stack, push, removeLast, clear }
}

import { useLayoutEffect, useRef } from 'react';
import { unsavedChanges, type UnsavedChanges } from './desktop-updates';

/** Readers retain only flags; source contents never reach the native quit guard. */
export function useUnsavedChanges(state: UnsavedChanges | (() => UnsavedChanges)) {
  const latest = useRef(state);
  latest.current = state;
  useLayoutEffect(() => unsavedChanges.register(() => typeof latest.current === 'function' ? latest.current() : latest.current), []);
}

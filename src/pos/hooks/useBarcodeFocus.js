import { useCallback } from 'react';

export function useBarcodeFocus(inputRef) {
  return useCallback(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [inputRef]);
}

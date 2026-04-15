import { useEffect, useRef } from 'react';
import type { PipelineEvent } from '../types/api';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';

export function useSSE(enabled: boolean, onEvent: (e: PipelineEvent) => void) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!enabled) return;

    const source = new EventSource(`${BASE_URL}/events`);

    source.onmessage = (e) => {
      try {
        const parsed = JSON.parse(e.data) as PipelineEvent;
        onEventRef.current(parsed);
      } catch {
        // ignore parse errors
      }
    };

    source.onerror = () => {
      source.close();
    };

    return () => {
      source.close();
    };
  }, [enabled]);
}

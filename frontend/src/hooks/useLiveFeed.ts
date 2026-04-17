import { useSyncExternalStore } from 'react';
import api from '@/api/client';
import type { LiveFeedEvent, SummaryStats } from '@/types/api';

interface LiveFeedState {
  connected: boolean;
  summary: SummaryStats | null;
  recentEvents: LiveFeedEvent[];
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';
const WS_BASE = API_BASE.replace(/^http/, 'ws');
const MAX_EVENTS = 50;

let state: LiveFeedState = {
  connected: false,
  summary: null,
  recentEvents: [],
};

const listeners = new Set<() => void>();
let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let bootstrapPromise: Promise<void> | null = null;

function emit(next: Partial<LiveFeedState>) {
  state = { ...state, ...next };
  listeners.forEach(listener => listener());
}

async function bootstrapSummary() {
  if (bootstrapPromise) return bootstrapPromise;
  bootstrapPromise = api
    .get<SummaryStats>('/summary')
    .then(response => {
      emit({ summary: response.data });
    })
    .catch(() => {
      // Keep the last snapshot if the API is briefly unavailable.
    })
    .finally(() => {
      bootstrapPromise = null;
    });
  return bootstrapPromise;
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, 5000);
}

function connect() {
  if (typeof window === 'undefined' || socket) {
    return;
  }

  socket = new WebSocket(`${WS_BASE}/ws/live-feed`);

  socket.onopen = () => {
    emit({ connected: true });
    if (!state.summary) {
      void bootstrapSummary();
    }
  };

  socket.onmessage = (event) => {
    try {
      const parsed = JSON.parse(event.data) as LiveFeedEvent;
      const recentEvents = [parsed, ...state.recentEvents].slice(0, MAX_EVENTS);
      emit({
        connected: true,
        recentEvents,
        summary: parsed.summary ?? state.summary,
      });
    } catch {
      // Ignore malformed payloads so the socket stays alive.
    }
  };

  socket.onerror = () => {
    emit({ connected: false });
  };

  socket.onclose = () => {
    socket = null;
    emit({ connected: false });
    if (listeners.size > 0) {
      scheduleReconnect();
    }
  };
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!state.summary) {
    void bootstrapSummary();
  }
  if (!socket && !reconnectTimer) {
    connect();
  }

  return () => {
    listeners.delete(listener);
  };
}

export function useLiveFeed() {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => state
  );
}

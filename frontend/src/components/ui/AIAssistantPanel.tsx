import React, { useState, useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Send, Sparkles, Loader2 } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import api from '@/api/client';

interface Message {
  id: number;
  role: 'user' | 'ai';
  text: string;
  ts: Date;
}

const contextMap: Record<string, string> = {
  '/': 'pipeline',
  '/pipeline': 'pipeline',
  '/raw-vault': 'records',
  '/canonical': 'records',
  '/identity-graph': 'identity-graph',
  '/review': 'review',
  '/master-records': 'master-records',
  '/lineage': 'lineage',
  '/settings': 'settings',
};

export default function AIAssistantPanel() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 0,
      role: 'ai',
      text: "Hi! I'm your DataFusion AI assistant. Ask me anything about your pipeline, records, or deduplication decisions.",
      ts: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const location = useLocation();

  const context = contextMap[location.pathname] ?? 'pipeline';

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 300);
  }, [open]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    const userMsg: Message = { id: Date.now(), role: 'user', text, ts: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);
    try {
      const res = await api.post('/ai/chat', { message: text, context });
      setMessages(prev => [...prev, { id: Date.now() + 1, role: 'ai', text: res.data.reply, ts: new Date() }]);
    } catch {
      setMessages(prev => [...prev, { id: Date.now() + 1, role: 'ai', text: 'Sorry, I encountered an error. Please try again.', ts: new Date() }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  return (
    <>
      {/* Floating button */}
      <AnimatePresence>
        {!open && (
          <motion.button
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            onClick={() => setOpen(true)}
            className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-full shadow-lg text-white text-sm font-medium"
            style={{ background: 'linear-gradient(135deg, var(--color-accent-secondary), #7c3aed)' }}
          >
            <Sparkles size={16} />
            <span>AI</span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Chat Panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ y: 60, opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 60, opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', damping: 22, stiffness: 260 }}
            className="fixed bottom-6 right-6 z-50 w-[360px] rounded-2xl overflow-hidden shadow-2xl flex flex-col"
            style={{
              height: '60vh',
              background: 'var(--color-surface-1)',
              border: '1px solid var(--color-border)',
              backdropFilter: 'blur(16px)',
            }}
          >
            {/* Header */}
            <div className="px-4 py-3 flex items-center justify-between border-b border-[var(--color-border)]" style={{ background: 'linear-gradient(135deg, var(--color-accent-secondary)18, #7c3aed18)' }}>
              <div className="flex items-center gap-2">
                <Sparkles size={15} style={{ color: 'var(--color-accent-secondary)' }} />
                <span className="text-sm font-semibold text-[var(--color-text-primary)]">AI Assistant</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-accent-secondary)]/20 text-[var(--color-accent-secondary)] font-mono uppercase">{context}</span>
              </div>
              <button onClick={() => setOpen(false)} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors">
                <X size={16} />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {messages.map(msg => (
                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[85%] px-3 py-2 rounded-xl text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'text-white rounded-br-sm'
                        : 'text-[var(--color-text-primary)] bg-[var(--color-surface-2)] rounded-bl-sm'
                    }`}
                    style={msg.role === 'user' ? { background: 'var(--color-accent-secondary)' } : {}}
                  >
                    {msg.text}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="px-3 py-2 rounded-xl bg-[var(--color-surface-2)] rounded-bl-sm">
                    <Loader2 size={14} className="animate-spin text-[var(--color-text-muted)]" />
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Footer */}
            <div className="px-3 py-2.5 border-t border-[var(--color-border)] bg-[var(--color-surface-2)]">
              <div className="flex gap-2 items-center">
                <input
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder="Ask anything…"
                  className="flex-1 bg-[var(--color-surface-1)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent-secondary)] transition-colors"
                />
                <button
                  onClick={send}
                  disabled={!input.trim() || loading}
                  className="p-2 rounded-lg disabled:opacity-40 transition-all text-white"
                  style={{ background: 'var(--color-accent-secondary)' }}
                >
                  <Send size={14} />
                </button>
              </div>
              <div className="text-[10px] text-[var(--color-text-muted)] text-center mt-1.5">Powered by Azure OpenAI GPT-4o-mini</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

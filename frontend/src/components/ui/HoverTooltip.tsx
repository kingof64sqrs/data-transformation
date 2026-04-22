import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

interface HoverTooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}

interface TooltipPosition {
  top: number;
  left: number;
}

export function HoverTooltip({ content, children, className, disabled = false }: HoverTooltipProps) {
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<TooltipPosition>({ top: 0, left: 0 });
  const id = useId();

  const updatePosition = () => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const top = rect.top - 10;
    const left = rect.left + rect.width / 2;
    setPosition({ top, left });
  };

  const show = () => {
    if (disabled || !content) return;
    updatePosition();
    setOpen(true);
  };

  const hide = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    const onReposition = () => updatePosition();
    window.addEventListener('scroll', onReposition, true);
    window.addEventListener('resize', onReposition);
    return () => {
      window.removeEventListener('scroll', onReposition, true);
      window.removeEventListener('resize', onReposition);
    };
  }, [open]);

  return (
    <>
      <span
        ref={triggerRef}
        className={cn('inline-flex', className)}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        aria-describedby={open ? id : undefined}
      >
        {children}
      </span>

      {open &&
        createPortal(
          <div
            id={id}
            role="tooltip"
            className="pointer-events-none fixed z-[9999] max-w-xs rounded-md border border-[var(--color-border)] bg-[var(--color-surface-1)] px-2.5 py-1.5 text-[11px] leading-relaxed text-[var(--color-text-primary)] shadow-xl"
            style={{
              top: position.top,
              left: position.left,
              transform: 'translate(-50%, -100%)',
            }}
          >
            {content}
          </div>,
          document.body
        )}
    </>
  );
}

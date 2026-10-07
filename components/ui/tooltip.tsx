"use client";

// oxlint-disable jsx-a11y/no-noninteractive-element-interactions -- A tooltip must stay readable when hovered; it is not a control.

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Portalled so a table's scrolling border cannot cut off its hover/focus explanation. */
export function Tooltip({
  content,
  children,
}: {
  content: string;
  children: (descriptionId: string) => ReactNode;
}) {
  const id = useId();
  const anchor = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    // A hint must never cover the picker/menu opened by its own trigger.
    setOpen(!anchor.current?.querySelector('[aria-expanded="true"]'));
  };
  const hide = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  };
  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    [],
  );
  return (
    <span
      ref={anchor}
      className="inline-flex"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      onPointerDown={() => setOpen(false)}
      onClickCapture={() => setOpen(false)}
    >
      {children(id)}
      {open &&
        createPortal(
          <TooltipBubble
            id={id}
            content={content}
            anchor={anchor.current}
            onEnter={show}
            onLeave={hide}
            onClose={() => setOpen(false)}
          />,
          document.body,
        )}
    </span>
  );
}

function TooltipBubble({
  id,
  content,
  anchor,
  onEnter,
  onLeave,
  onClose,
}: {
  id: string;
  content: string;
  anchor: HTMLElement | null;
  onEnter: () => void;
  onLeave: () => void;
  onClose: () => void;
}) {
  const bubble = useRef<HTMLSpanElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  useLayoutEffect(() => {
    if (!anchor || !bubble.current) return;
    const rect = anchor.getBoundingClientRect();
    const { offsetWidth: width, offsetHeight: height } = bubble.current;
    setPosition({
      left: Math.max(
        8,
        Math.min(rect.left + (rect.width - width) / 2, window.innerWidth - width - 8),
      ),
      top:
        rect.top - height - 4 >= 8
          ? rect.top - height - 4
          : Math.min(window.innerHeight - height - 8, rect.bottom + 4),
    });
  }, [anchor, content]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", escape);
    window.addEventListener("scroll", onClose, true);
    window.addEventListener("resize", onClose);
    return () => {
      window.removeEventListener("keydown", escape);
      window.removeEventListener("scroll", onClose, true);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);
  return (
    <span
      ref={bubble}
      id={id}
      role="tooltip"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      style={{
        top: position?.top ?? 0,
        left: position?.left ?? 0,
        visibility: position ? "visible" : "hidden",
      }}
      className="fixed z-50 max-w-[280px] rounded-[9px] border border-border bg-surface px-3 py-2 text-[12px] text-ink shadow-[0_4px_12px_rgba(15,23,42,0.12)]"
    >
      {content}
    </span>
  );
}

"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

interface HelpDialogProps {
  open: boolean;
  titleId: string;
  focusKey: string;
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
}

export function HelpDialog({ open, titleId, focusKey, closeLabel, onClose, children }: HelpDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    if (!dialog.open) dialog.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      if (dialog.open) dialog.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    dialog?.querySelector<HTMLElement>("[data-autofocus]")?.focus({ preventScroll: true });
    if (dialog) dialog.scrollTop = 0;
  }, [open, focusKey]);

  return (
    <dialog ref={dialogRef} className="help-dialog" aria-modal="true" aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <button type="button" className="help-dialog-close" aria-label={closeLabel} onClick={onClose}>×</button>
      {children}
    </dialog>
  );
}

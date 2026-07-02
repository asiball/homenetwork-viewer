import { useEffect, useId, useRef } from "react";

interface Props {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = "OK",
  cancelLabel = "キャンセル",
  danger = false,
  onConfirm,
  onCancel,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const messageId = useId();

  // Drive the native <dialog> via showModal()/close() so we get its modal
  // semantics for free: a focus trap while open, focus restored to the trigger
  // on close, and Esc firing `cancel`. The element stays mounted whether open or
  // not — returning null on close (the old behaviour) unmounted it before
  // close() could run, so focus was never restored and the ::backdrop exit was
  // lost (#165).
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    // Esc (and other dismissals) fire `cancel`; route it through onCancel so the
    // parent's open state stays in sync with the element.
    const handleCancel = (e: Event) => {
      e.preventDefault();
      onCancel();
    };
    dialog.addEventListener("cancel", handleCancel);
    return () => dialog.removeEventListener("cancel", handleCancel);
  }, [onCancel]);

  return (
    <dialog
      ref={dialogRef}
      className="confirm-modal"
      aria-labelledby={titleId}
      aria-describedby={messageId}
      onClick={(e) => {
        // A native <dialog> click handler sees e.target === the dialog element
        // itself both for a genuine ::backdrop click *and* for a click landing
        // in the dialog's own padding (there's no child element out there to
        // be the target). The dialog has 24px of padding, so the naive check
        // used to cancel on a stray click nowhere near the backdrop (#review
        // item 9). Only treat it as a backdrop click when the pointer is
        // actually outside the dialog's box.
        if (e.target !== dialogRef.current) return;
        const rect = dialogRef.current.getBoundingClientRect();
        const inside =
          e.clientX >= rect.left &&
          e.clientX <= rect.right &&
          e.clientY >= rect.top &&
          e.clientY <= rect.bottom;
        if (!inside) onCancel();
      }}
    >
      <div className="cm-content">
        <h3 id={titleId} className={danger ? "err" : ""}>
          {title}
        </h3>
        <p id={messageId}>{message}</p>
        <div className="cm-actions">
          <button className="f-btn ghost" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button className={`f-btn ${danger ? "danger" : "primary"}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}

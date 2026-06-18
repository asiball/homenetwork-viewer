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
        if (e.target === dialogRef.current) onCancel();
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

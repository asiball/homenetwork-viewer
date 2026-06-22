import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmModal } from "./ConfirmModal";

function setup(open: boolean) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  const utils = render(
    <ConfirmModal
      open={open}
      title="Replace all data?"
      message="This cannot be undone."
      confirmLabel="Replace"
      cancelLabel="Cancel"
      danger
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
  return { onConfirm, onCancel, ...utils };
}

describe("ConfirmModal", () => {
  it("opens the native dialog and labels it from title + message", () => {
    setup(true);
    const dialog = screen.getByRole("dialog");
    // showModal() ran (open reflects the native state), and the dialog is
    // described by the title/message via aria — not unmounted on close.
    expect((dialog as HTMLDialogElement).open).toBe(true);
    expect(dialog).toHaveAccessibleName("Replace all data?");
    expect(dialog).toHaveAccessibleDescription("This cannot be undone.");
  });

  it("invokes onConfirm / onCancel from the action buttons", async () => {
    const user = userEvent.setup();
    const { onConfirm, onCancel } = setup(true);
    await user.click(screen.getByRole("button", { name: "Replace" }));
    expect(onConfirm).toHaveBeenCalledOnce();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("stays mounted (and closed) when not open, so focus can be restored", () => {
    setup(false);
    // The element is rendered but the native dialog is closed — the old code
    // returned null here, which skipped dialog.close() and lost focus restore.
    const dialog = screen.queryByRole("dialog", { hidden: true });
    expect(dialog).toBeInTheDocument();
    expect((dialog as HTMLDialogElement).open).toBe(false);
  });
});

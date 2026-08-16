import { useEffect, useRef } from "react";

export interface ConfirmDialogProps {
	open: boolean;
	title: string;
	description: string;
	confirmLabel: string;
	cancelLabel: string;
	onConfirm: () => void;
	onCancel: () => void;
}

/**
 * A themed modal replacement for `window.confirm`, so destructive actions
 * (like resetting the playground) don't drop into the browser's native
 * dialog, which can't be styled and looks out of place next to the rest of
 * the UI. Closes on Escape or a backdrop click, both treated as cancel.
 */
export function ConfirmDialog({ open, title, description, confirmLabel, cancelLabel, onConfirm, onCancel }: ConfirmDialogProps) {
	const confirmButtonRef = useRef<HTMLButtonElement>(null);

	useEffect(() => {
		if (!open) {
			return;
		}
		confirmButtonRef.current?.focus();
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				onCancel();
			}
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [open, onCancel]);

	if (!open) {
		return null;
	}

	return (
		<div className="confirm-dialog-backdrop" onMouseDown={onCancel}>
			<div
				className="confirm-dialog"
				role="alertdialog"
				aria-modal="true"
				aria-labelledby="confirm-dialog-title"
				aria-describedby="confirm-dialog-description"
				onMouseDown={(event) => event.stopPropagation()}
			>
				<h2 id="confirm-dialog-title" className="confirm-dialog-title">
					{title}
				</h2>
				<p id="confirm-dialog-description" className="confirm-dialog-description">
					{description}
				</p>
				<div className="confirm-dialog-actions">
					<button type="button" className="confirm-dialog-button confirm-dialog-cancel" onClick={onCancel}>
						{cancelLabel}
					</button>
					<button
						type="button"
						className="confirm-dialog-button confirm-dialog-confirm"
						onClick={onConfirm}
						ref={confirmButtonRef}
					>
						{confirmLabel}
					</button>
				</div>
			</div>
		</div>
	);
}

"use client";

import { Modal } from "./Modal";
import { Button } from "./Button";

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Confirmar",
  loading = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  loading?: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <p className="text-sm leading-relaxed text-graphite-500 dark:text-gray-400">{message}</p>
      <div className="mt-8 flex justify-end gap-3">
        <Button variant="secondary" size="sm" onClick={onClose} disabled={loading}>
          Cancelar
        </Button>
        <Button variant="danger" size="sm" onClick={onConfirm} disabled={loading}>
          {loading ? "Processando..." : confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}

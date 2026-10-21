import React from 'react';
import { Button } from './Button';
import { Dialog } from './Dialog';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  tone?: 'danger' | 'primary';
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ open, title, description, confirmLabel, tone = 'danger', onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={title}
      description={description}
      size="sm"
      footer={
      <>
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant={tone} onClick={onConfirm} data-autofocus>
            {confirmLabel}
          </Button>
        </>
      } />);


}
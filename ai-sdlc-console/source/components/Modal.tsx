/**
 * AI 研发协作控制台 — 居中弹窗
 * 支持 ESC 关闭、点击遮罩关闭。
 * width 作为最大宽度下发（.ac-modal 自带 width:100%），窄视口下仍可自适应收缩。
 */
import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  title: string;
  subtitle?: string;
  width?: number;
  onClose: () => void;
  footer?: React.ReactNode;
  children: React.ReactNode;
}

export default function Modal({
  open,
  title,
  subtitle,
  width = 560,
  onClose,
  footer,
  children,
}: ModalProps) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="ac-modal-mask ac-modal-mask--open" onClick={onClose} role="presentation">
      <div
        className="ac-modal"
        style={{ maxWidth: width }}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="ac-modal-head">
          <div className="ac-col ac-gap-2">
            <span className="ac-modal-title">{title}</span>
            {subtitle ? <span className="ac-modal-subtitle">{subtitle}</span> : null}
          </div>
          <button type="button" className="ac-modal-close" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </div>
        <div className="ac-modal-body">{children}</div>
        {footer ? <div className="ac-modal-foot">{footer}</div> : null}
      </div>
    </div>
  );
}

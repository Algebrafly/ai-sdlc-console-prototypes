/**
 * AI 研发协作控制台 — 右侧抽屉
 * 支持 ESC 关闭、点击遮罩关闭；打开时锁定 body 滚动。
 */
import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface DrawerProps {
  open: boolean;
  title: string;
  subtitle?: string;
  width?: number;
  onClose: () => void;
  footer?: React.ReactNode;
  children: React.ReactNode;
}

export default function Drawer({
  open,
  title,
  subtitle,
  width = 620,
  onClose,
  footer,
  children,
}: DrawerProps) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <>
      <div
        className={`ac-drawer-mask ${open ? 'ac-drawer-mask--open' : ''}`}
        onClick={onClose}
        role="presentation"
      />
      <aside
        className={`ac-drawer ${open ? 'ac-drawer--open' : ''}`}
        style={{ width }}
        aria-hidden={!open}
      >
        <div className="ac-drawer-head">
          <div className="ac-col ac-gap-2">
            <span className="ac-drawer-title">{title}</span>
            {subtitle ? <span className="ac-drawer-subtitle">{subtitle}</span> : null}
          </div>
          <button type="button" className="ac-drawer-close" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </div>
        <div className="ac-drawer-body">{children}</div>
        {footer ? <div className="ac-drawer-foot">{footer}</div> : null}
      </aside>
    </>
  );
}

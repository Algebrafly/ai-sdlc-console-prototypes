/**
 * AI 研发协作控制台 — 录入表单基础控件
 *
 * 供「项目管理 / 人员管理 / 团队管理 / 需求管理」等页面的录入弹窗统一使用。
 * 全部复用 style.css 既有原子类（.ac-field / .ac-input / .ac-select / .ac-textarea /
 * .ac-grid-2 / .ac-grid-3 / .ac-multi-pick*），不引入新依赖，也不新增样式体系。
 *
 * 约定：
 *  - 受控组件，值与 onChange 由调用方持有（页面内的 useState），本文件不保存任何状态；
 *  - error 非空时输入框标红并显示错误文案，此时 hint 不展示；
 *  - full=true 时该字段在 FormGrid 中占满整行。
 */
import React from 'react';

/** 下拉 / 多选项 */
export interface FieldOption {
  value: string;
  label: string;
  /** 悬浮说明，缺省用 label */
  title?: string;
  disabled?: boolean;
}

interface ShellProps {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  full?: boolean;
  children: React.ReactNode;
}

/** 字段外壳：标签 + 控件 + 错误/提示 */
export function FieldShell({ label, required, hint, error, full, children }: ShellProps) {
  return (
    <div className={`ac-field${full ? ' ac-field--full' : ''}`}>
      <span className={`ac-field-label${required ? ' ac-field-req' : ''}`}>{label}</span>
      {children}
      {error ? (
        <span className="ac-field-error">{error}</span>
      ) : hint ? (
        <span className="ac-field-hint">{hint}</span>
      ) : null}
    </div>
  );
}

/** 表单分组标题（占满整行） */
export function FormGroupTitle({ title, note }: { title: string; note?: string }) {
  return (
    <div className="ac-form-group-title">
      {title}
      {note ? <span>{note}</span> : null}
    </div>
  );
}

/** 栅格容器：cols=2 → .ac-grid-2，cols=3 → .ac-grid-3 */
export function FormGrid({ cols = 2, children }: { cols?: 2 | 3; children: React.ReactNode }) {
  return <div className={cols === 3 ? 'ac-grid-3' : 'ac-grid-2'}>{children}</div>;
}

interface TextProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  hint?: string;
  error?: string;
  full?: boolean;
  placeholder?: string;
  maxLength?: number;
  /** 等宽字体（编号、账号、日期等） */
  mono?: boolean;
  disabled?: boolean;
  type?: 'text' | 'date' | 'email';
}

export function TextField({
  label,
  value,
  onChange,
  required,
  hint,
  error,
  full,
  placeholder,
  maxLength,
  mono,
  disabled,
  type = 'text',
}: TextProps) {
  return (
    <FieldShell label={label} required={required} hint={hint} error={error} full={full}>
      <input
        type={type}
        className={`ac-input${error ? ' ac-input--invalid' : ''}${mono ? ' ac-input--mono' : ''}`}
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    </FieldShell>
  );
}

interface NumberProps {
  label: string;
  /** 空串表示未填写，便于必填校验 */
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  hint?: string;
  error?: string;
  full?: boolean;
  min?: number;
  max?: number;
  step?: number;
  /** 单位后缀，如「万元」「点」 */
  unit?: string;
  disabled?: boolean;
}

export function NumberField({
  label,
  value,
  onChange,
  required,
  hint,
  error,
  full,
  min,
  max,
  step,
  unit,
  disabled,
}: NumberProps) {
  return (
    <FieldShell
      label={label}
      required={required}
      hint={hint}
      error={error}
      full={full}
    >
      <div className="ac-row ac-gap-2">
        <input
          type="number"
          className={`ac-input${error ? ' ac-input--invalid' : ''}`}
          style={{ flex: '1 1 auto', minWidth: 0 }}
          value={value}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
        {unit ? <span className="ac-xs ac-muted">{unit}</span> : null}
      </div>
    </FieldShell>
  );
}

interface SelectProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: FieldOption[];
  required?: boolean;
  hint?: string;
  error?: string;
  full?: boolean;
  placeholder?: string;
  disabled?: boolean;
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  required,
  hint,
  error,
  full,
  placeholder,
  disabled,
}: SelectProps) {
  return (
    <FieldShell label={label} required={required} hint={hint} error={error} full={full}>
      <select
        className={`ac-select${error ? ' ac-select--invalid' : ''}`}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

interface TextareaProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  hint?: string;
  error?: string;
  full?: boolean;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
}

export function TextareaField({
  label,
  value,
  onChange,
  required,
  hint,
  error,
  full,
  placeholder,
  rows = 3,
  maxLength,
}: TextareaProps) {
  return (
    <FieldShell label={label} required={required} hint={hint} error={error} full={full}>
      <textarea
        className={`ac-textarea${error ? ' ac-textarea--invalid' : ''}`}
        rows={rows}
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
      />
    </FieldShell>
  );
}

interface MultiPickProps {
  label: string;
  value: string[];
  onChange: (v: string[]) => void;
  options: FieldOption[];
  required?: boolean;
  hint?: string;
  error?: string;
  full?: boolean;
  /** 最多可选数量，超出后未选项禁用 */
  max?: number;
}

/** 多选 chips：点击切换选中态，达到 max 后未选项置灰 */
export function MultiPickField({
  label,
  value,
  onChange,
  options,
  required,
  hint,
  error,
  full,
  max,
}: MultiPickProps) {
  const toggle = (v: string) => {
    if (value.includes(v)) onChange(value.filter((x) => x !== v));
    else if (max === undefined || value.length < max) onChange([...value, v]);
  };
  const reachedMax = max !== undefined && value.length >= max;
  return (
    <FieldShell
      label={label}
      required={required}
      hint={hint ?? (max !== undefined ? `已选 ${value.length} / ${max}` : `已选 ${value.length} 项`)}
      error={error}
      full={full}
    >
      <div className="ac-multi-pick">
        {options.map((o) => {
          const on = value.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              title={o.title ?? o.label}
              className={`ac-multi-pick-item${on ? ' ac-multi-pick-item--on' : ''}`}
              disabled={o.disabled || (!on && reachedMax)}
              onClick={() => toggle(o.value)}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </FieldShell>
  );
}

/* ==================== 校验工具 ==================== */

/** 把 { 字段: 错误文案 } 中空串/undefined 过滤掉，便于判断表单是否可提交 */
export function cleanErrors(errors: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  Object.keys(errors).forEach((k) => {
    const v = errors[k];
    if (v) out[k] = v;
  });
  return out;
}

/** 必填校验：空串或纯空白 → 返回「请填写{label}」 */
export function requireText(value: string, label: string): string {
  return value.trim() ? '' : `请填写${label}`;
}

/** 数值校验：非数字 / 越界 → 返回错误文案；空串按必填处理 */
export function requireNumber(
  value: string,
  label: string,
  min?: number,
  max?: number,
): string {
  const raw = value.trim();
  if (!raw) return `请填写${label}`;
  const n = Number(raw);
  if (!Number.isFinite(n)) return `${label}必须是数字`;
  if (min !== undefined && n < min) return `${label}不得小于 ${min}`;
  if (max !== undefined && n > max) return `${label}不得大于 ${max}`;
  return '';
}

/** 日期区间校验：end 早于 start → 返回错误文案 */
export function checkDateRange(start: string, end: string, label: string): string {
  if (!start || !end) return '';
  return end < start ? `${label}：结束日期不得早于开始日期` : '';
}

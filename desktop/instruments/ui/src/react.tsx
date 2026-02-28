import React, { useEffect, useState } from "react";
import type {
  UIButtonSize,
  UIButtonVariant,
  UIGroupItemMeta,
  UIGroupSubtitle,
  UIGroupTitle,
} from "./index.ts";
import { ensureInstrumentUI } from "./index.ts";

type BadgeTone = "neutral" | "info" | "success" | "warning" | "danger";

export function useInstrumentUIStyles(): void {
  useEffect(() => {
    ensureInstrumentUI();
  }, []);
}

export function UIRoot(props: {
  className?: string;
  children?: React.ReactNode;
}): JSX.Element {
  useInstrumentUIStyles();
  return <div className={`tui-root ${props.className ?? ""}`.trim()}>{props.children}</div>;
}

export function UIPanelHeader(props: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  rightActions?: React.ReactNode;
}): JSX.Element {
  return (
    <div className="tui-header tui-spread">
      <div className="tui-header-left">
        {props.onBack ? (
          <button
            type="button"
            className="tui-btn tui-btn-ghost tui-btn-sm"
            aria-label="Back"
            onClick={props.onBack}
          >
            ←
          </button>
        ) : null}
        <div>
          <div className="tui-header-title">{props.title}</div>
          {props.subtitle ? <div className="tui-header-subtitle">{props.subtitle}</div> : null}
        </div>
      </div>
      <div className="tui-row">{props.rightActions}</div>
    </div>
  );
}

export function UISection(props: {
  title?: string;
  description?: string;
  children?: React.ReactNode;
}): JSX.Element {
  return (
    <section className="tui-section">
      {props.title ? <div className="tui-section-title">{props.title}</div> : null}
      {props.description ? <div className="tui-section-description">{props.description}</div> : null}
      {props.children}
    </section>
  );
}

export function UICard(props: {
  className?: string;
  children?: React.ReactNode;
}): JSX.Element {
  return <div className={`tui-card ${props.className ?? ""}`.trim()}>{props.children}</div>;
}

export function UIButton(props: {
  label: string;
  variant?: UIButtonVariant;
  size?: UIButtonSize;
  disabled?: boolean;
  onClick?: () => void;
}): JSX.Element {
  const variant = props.variant ?? "secondary";
  const size = props.size ?? "md";
  return (
    <button
      type="button"
      className={`tui-btn tui-btn-${variant} tui-btn-${size}`}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      {props.label}
    </button>
  );
}

export function UIInput(props: {
  value?: string;
  placeholder?: string;
  onInput?: (value: string) => void;
}): JSX.Element {
  return (
    <input
      className="tui-input"
      value={props.value ?? ""}
      placeholder={props.placeholder ?? ""}
      onInput={(event) => props.onInput?.((event.target as HTMLInputElement).value)}
    />
  );
}

export function UITextarea(props: {
  value?: string;
  placeholder?: string;
  rows?: number;
  onInput?: (value: string) => void;
}): JSX.Element {
  return (
    <textarea
      className="tui-textarea"
      rows={props.rows ?? 6}
      value={props.value ?? ""}
      placeholder={props.placeholder ?? ""}
      onInput={(event) => props.onInput?.((event.target as HTMLTextAreaElement).value)}
    />
  );
}

export function UISelect(props: {
  options: Array<{ value: string; label: string }>;
  value?: string;
  onChange?: (value: string) => void;
}): JSX.Element {
  return (
    <select
      className="tui-select"
      value={props.value}
      onChange={(event) => props.onChange?.(event.currentTarget.value)}
    >
      {props.options.map((option) => (
        <option value={option.value} key={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export function UIBadge(props: {
  label: string;
  tone?: BadgeTone;
}): JSX.Element {
  return (
    <span className={`tui-badge tui-badge-${props.tone ?? "neutral"}`}>
      {props.label}
    </span>
  );
}

export function UIEmptyState(props: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}): JSX.Element {
  return (
    <div className="tui-empty">
      <div className="tui-empty-title">{props.title}</div>
      {props.description ? <div className="tui-empty-description">{props.description}</div> : null}
      {props.action ? <div className="tui-row">{props.action}</div> : null}
    </div>
  );
}

export function UIList(props: {
  children?: React.ReactNode;
}): JSX.Element {
  return <div className="tui-list">{props.children}</div>;
}

export function UIListItem(props: {
  title: string;
  subtitle?: string;
  active?: boolean;
  onClick?: () => void;
}): JSX.Element {
  const className = `tui-list-item${props.active ? " tui-list-item-active" : ""}`;
  if (props.onClick) {
    return (
      <button type="button" className={className} onClick={props.onClick}>
        <span className="tui-list-item-title">{props.title}</span>
        {props.subtitle ? <span className="tui-list-item-subtitle">{props.subtitle}</span> : null}
      </button>
    );
  }
  return (
    <div className={className}>
      <span className="tui-list-item-title">{props.title}</span>
      {props.subtitle ? <span className="tui-list-item-subtitle">{props.subtitle}</span> : null}
    </div>
  );
}

export function UIToggle(props: {
  label: string;
  checked?: boolean;
  onChange?: (checked: boolean) => void;
}): JSX.Element {
  return (
    <label className="tui-toggle">
      <input
        type="checkbox"
        checked={Boolean(props.checked)}
        onChange={(event) => props.onChange?.(event.currentTarget.checked)}
      />
      <span className="tui-toggle-slider" />
      <span className="tui-toggle-label">{props.label}</span>
    </label>
  );
}

export function UICheckbox(props: {
  label: string;
  checked?: boolean;
  onChange?: (checked: boolean) => void;
}): JSX.Element {
  return (
    <label className="tui-checkbox">
      <input
        type="checkbox"
        checked={Boolean(props.checked)}
        onChange={(event) => props.onChange?.(event.currentTarget.checked)}
      />
      <span>{props.label}</span>
    </label>
  );
}

export function UIRadioGroup(props: {
  name: string;
  options: Array<{ value: string; label: string }>;
  value?: string;
  onChange?: (value: string) => void;
}): JSX.Element {
  return (
    <div className="tui-radio-group">
      {props.options.map((option) => (
        <label className="tui-radio" key={option.value}>
          <input
            type="radio"
            name={props.name}
            checked={props.value === option.value}
            onChange={() => props.onChange?.(option.value)}
          />
          <span>{option.label}</span>
        </label>
      ))}
    </div>
  );
}

export function UISegmentedControl(props: {
  options: Array<{ value: string; label: string }>;
  value?: string;
  onChange?: (value: string) => void;
}): JSX.Element {
  return (
    <div className="tui-segmented">
      {props.options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`tui-segmented-item${props.value === option.value ? " is-active" : ""}`}
          onClick={() => props.onChange?.(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function UITabs(props: {
  tabs: Array<{
    value: string;
    label: string;
    content: React.ReactNode;
  }>;
  initialValue?: string;
}): JSX.Element {
  const initial = props.initialValue ?? props.tabs[0]?.value ?? "";
  const [value, setValue] = useState(initial);
  const selected = props.tabs.find((tab) => tab.value === value) ?? props.tabs[0] ?? null;
  return (
    <div className="tui-tabs">
      <div className="tui-tabs-list">
        {props.tabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            className={`tui-tabs-trigger${tab.value === value ? " is-active" : ""}`}
            onClick={() => setValue(tab.value)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="tui-tabs-panel">{selected?.content}</div>
    </div>
  );
}

export function UIColorToken(props: {
  label: string;
  tone?: BadgeTone;
}): JSX.Element {
  return <UIBadge label={props.label} tone={props.tone ?? "neutral"} />;
}

export function UIStatusTone(props: {
  label: string;
  tone?: BadgeTone;
}): JSX.Element {
  return <UIBadge label={props.label} tone={props.tone ?? "neutral"} />;
}

export function UISelectionList(props: {
  items: Array<{ value: string; title: string; subtitle?: string }>;
  selected: string[];
  multiple?: boolean;
  onChange?: (next: string[]) => void;
}): JSX.Element {
  return (
    <div className="tui-selection-list">
      {props.items.map((item) => {
        const active = props.selected.includes(item.value);
        return (
          <button
            key={item.value}
            type="button"
            className={`tui-selection-item${active ? " is-active" : ""}`}
            onClick={() => {
              if (props.multiple) {
                const next = active
                  ? props.selected.filter((value) => value !== item.value)
                  : [...props.selected, item.value];
                props.onChange?.(next);
              } else {
                props.onChange?.([item.value]);
              }
            }}
          >
            <span className="tui-selection-title">{item.title}</span>
            {item.subtitle ? <span className="tui-selection-subtitle">{item.subtitle}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

export type {
  UIGroupItemMeta,
  UIGroupSubtitle,
  UIGroupTitle,
};

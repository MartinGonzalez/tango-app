import React, { useEffect, useRef, useState } from "react";
import type {
  UIButtonSize,
  UIButtonVariant,
  UIGroupItemMeta,
  UIIconButtonSize,
  UIIconButtonVariant,
  UIGroupSubtitle,
  UIGroupTitle,
  UIIconName,
  UIIconPrimitive,
} from "./index.ts";
import {
  Icon as TangoIcons,
  ensureInstrumentUI,
  getIconPrimitives,
  isUIIconName,
} from "./index.ts";

type BadgeTone = "neutral" | "info" | "success" | "warning" | "danger";
export const Icon = TangoIcons;

function renderIconPrimitive(
  primitive: UIIconPrimitive,
  key: string
): JSX.Element {
  if (primitive.tag === "path") {
    return <path key={key} d={primitive.d} />;
  }
  if (primitive.tag === "circle") {
    return <circle key={key} cx={primitive.cx} cy={primitive.cy} r={primitive.r} />;
  }
  return (
    <line
      key={key}
      x1={primitive.x1}
      y1={primitive.y1}
      x2={primitive.x2}
      y2={primitive.y2}
    />
  );
}

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

export function UIIcon(props: {
  name: UIIconName;
  className?: string;
  size?: number;
  title?: string;
}): JSX.Element {
  const size = props.size ?? 16;
  return (
    <span
      className={`tui-icon ${props.className ?? ""}`.trim()}
      role={props.title ? "img" : undefined}
      aria-label={props.title}
      aria-hidden={props.title ? undefined : true}
      style={{ width: `${size}px`, height: `${size}px` }}
    >
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {getIconPrimitives(props.name).map((primitive, index) =>
          renderIconPrimitive(primitive, `${props.name}-${index}`))}
      </svg>
    </span>
  );
}

export function UIButton(props: {
  label: string;
  icon?: UIIconName | React.ReactNode;
  variant?: UIButtonVariant;
  size?: UIButtonSize;
  disabled?: boolean;
  onClick?: () => void;
}): JSX.Element {
  const variant = props.variant ?? "secondary";
  const size = props.size ?? "md";
  const iconNode = typeof props.icon === "string" && isUIIconName(props.icon)
    ? <UIIcon name={props.icon} className="tui-btn-icon" />
    : props.icon
      ? (
        <span className="tui-btn-icon" aria-hidden="true">
          {props.icon}
        </span>
      )
      : null;
  return (
    <button
      type="button"
      className={`tui-btn tui-btn-${variant} tui-btn-${size}`}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      {iconNode}
      <span className="tui-btn-label">{props.label}</span>
    </button>
  );
}

export function UIIconButton(props: {
  icon: UIIconName | React.ReactNode;
  label: string;
  title?: string;
  variant?: UIIconButtonVariant;
  size?: UIIconButtonSize;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}): JSX.Element {
  const variant = props.variant ?? "ghost";
  const size = props.size ?? "sm";
  const iconNode = typeof props.icon === "string" && isUIIconName(props.icon)
    ? <UIIcon name={props.icon} className="tui-icon-btn-icon" />
    : (
      <span className="tui-icon-btn-icon" aria-hidden="true">
        {props.icon}
      </span>
    );
  return (
    <button
      type="button"
      className={`tui-icon-btn tui-icon-btn-${variant} tui-icon-btn-${size}${props.active ? " is-active" : ""}`}
      aria-label={props.label}
      title={props.title ?? props.label}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      {iconNode}
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

export function UIDropdown(props: {
  options: Array<{ value: string; label: string }>;
  value?: string;
  initialValue?: string;
  placeholder?: string;
  disabled?: boolean;
  onChange?: (value: string) => void;
}): JSX.Element {
  const initial = props.initialValue ?? props.value ?? "";
  const [internalValue, setInternalValue] = useState(initial);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const controlled = typeof props.value === "string";
  const value = controlled ? (props.value as string) : internalValue;
  const selected = props.options.find((option) => option.value === value) ?? null;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const root = rootRef.current;
      const target = event.target;
      if (!root || !(target instanceof Node)) return;
      if (!root.contains(target)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (controlled) return;
    if (props.options.length === 0) return;
    if (!internalValue) return;
    const hasCurrent = props.options.some((option) => option.value === internalValue);
    if (!hasCurrent) {
      setInternalValue("");
    }
  }, [controlled, internalValue, props.options]);

  const selectValue = (next: string) => {
    if (!controlled) {
      setInternalValue(next);
    }
    props.onChange?.(next);
    setOpen(false);
  };

  const label = selected?.label ?? props.placeholder ?? "Select option";

  return (
    <div
      ref={rootRef}
      className={`tui-dropdown-select${open ? " is-open" : ""}${props.disabled ? " is-disabled" : ""}`}
    >
      <button
        type="button"
        className="tui-dropdown-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={Boolean(props.disabled)}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className={`tui-dropdown-select-value${selected ? "" : " is-placeholder"}`}>{label}</span>
        <span className="tui-dropdown-select-caret" aria-hidden="true" />
      </button>
      <div className="tui-dropdown-select-menu" role="listbox" hidden={!open}>
        {props.options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={active}
              className={`tui-dropdown-select-item${active ? " is-active" : ""}`}
              onClick={() => selectValue(option.value)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
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
      <span className="tui-checkbox-indicator" aria-hidden="true" />
      <span className="tui-checkbox-label">{props.label}</span>
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
  value?: string;
  initialValue?: string;
  onChange?: (value: string) => void;
}): JSX.Element {
  const initial = props.initialValue ?? props.value ?? props.tabs[0]?.value ?? "";
  const [internalValue, setInternalValue] = useState(initial);
  const controlled = typeof props.value === "string";
  const value = controlled ? (props.value as string) : internalValue;
  const selected = props.tabs.find((tab) => tab.value === value) ?? props.tabs[0] ?? null;

  useEffect(() => {
    if (controlled) return;
    if (props.tabs.length === 0) return;
    const hasCurrent = props.tabs.some((tab) => tab.value === internalValue);
    if (!hasCurrent) {
      setInternalValue(props.tabs[0]?.value ?? "");
    }
  }, [controlled, internalValue, props.tabs]);

  const selectTab = (next: string) => {
    if (!controlled) {
      setInternalValue(next);
    }
    props.onChange?.(next);
  };

  return (
    <div className="tui-tabs">
      <div className="tui-tabs-list" role="tablist">
        {props.tabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            className={`tui-tabs-trigger${tab.value === value ? " is-active" : ""}`}
            role="tab"
            aria-selected={tab.value === value}
            tabIndex={tab.value === value ? 0 : -1}
            onClick={() => selectTab(tab.value)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="tui-tabs-panel" role="tabpanel">{selected?.content}</div>
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

export function UIGroup(props: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  expanded?: boolean;
  active?: boolean;
  animate?: boolean;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  onToggle?: (nextExpanded: boolean) => void;
  children?: React.ReactNode;
}): JSX.Element {
  const expanded = props.expanded ?? true;
  const hasToggle = typeof props.onToggle === "function";

  const titleNode =
    typeof props.title === "string" ? (
      <span className="tui-group-title">{props.title}</span>
    ) : (
      props.title
    );
  const subtitleNode =
    typeof props.subtitle === "string" ? (
      <span className="tui-group-subtitle">{props.subtitle}</span>
    ) : (
      props.subtitle ?? null
    );

  const handleToggle = () => {
    props.onToggle?.(!expanded);
  };

  const headerClassParts = ["tui-group-header"];
  if (!expanded) headerClassParts.push("tui-group-header-collapsed");
  if (hasToggle) headerClassParts.push("tui-group-header-clickable");

  const groupClassParts = ["tui-group"];
  if (expanded) groupClassParts.push("tui-group-expanded");
  if (props.active) groupClassParts.push("tui-group-active");

  return (
    <div className={groupClassParts.join(" ")}>
      <div
        className={headerClassParts.join(" ")}
        role={hasToggle ? "button" : undefined}
        tabIndex={hasToggle ? 0 : undefined}
        onClick={hasToggle ? handleToggle : undefined}
        onKeyDown={
          hasToggle
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleToggle();
                }
              }
            : undefined
        }
      >
        <div className="tui-group-meta">
          <div className="tui-group-title-row">
            {titleNode}
            {props.meta}
          </div>
          {subtitleNode}
        </div>
        <div
          className="tui-group-actions"
          onClick={(e) => e.stopPropagation()}
        >
          {props.actions}
          {hasToggle ? (
            <span
              className={`tui-group-caret${expanded ? " tui-group-caret-expanded" : ""}`}
              aria-hidden="true"
            >
              ▾
            </span>
          ) : null}
        </div>
      </div>
      <div className={`tui-collapsible${!expanded ? " is-collapsed" : ""}`}>
        <div className="tui-collapsible-inner">
          <div className="tui-group-body">{props.children}</div>
        </div>
      </div>
    </div>
  );
}

export function UIGroupList(props: {
  children?: React.ReactNode;
}): JSX.Element {
  return <div className="tui-group-list">{props.children}</div>;
}

export function UIGroupEmpty(props: {
  text: string;
}): JSX.Element {
  return <div className="tui-group-empty">{props.text}</div>;
}

export function UIGroupItem(props: {
  title: string;
  subtitle?: string;
  meta?: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
}): JSX.Element {
  const className = `tui-group-item${props.active ? " tui-group-item-active" : ""}`;
  const main = (
    <div className="tui-group-item-main">
      <span className="tui-group-item-title">{props.title}</span>
      {props.subtitle ? (
        <span className="tui-group-item-subtitle">{props.subtitle}</span>
      ) : null}
    </div>
  );

  const metaNode = props.meta ? (
    <span className="tui-group-item-meta">{props.meta}</span>
  ) : null;

  if (props.onClick) {
    return (
      <button type="button" className={className} onClick={props.onClick}>
        {main}
        {metaNode}
      </button>
    );
  }

  return (
    <div className={className}>
      {main}
      {metaNode}
    </div>
  );
}

export function UIMarkdownRenderer(props: {
  content: string;
  renderMarkdown: (text: string) => string;
  rawViewEnabled?: boolean;
  className?: string;
}): JSX.Element {
  const [view, setView] = useState<"preview" | "raw">("preview");
  const bodyRef = useRef<HTMLDivElement | null>(null);

  const showRaw = view === "raw";
  const html = props.renderMarkdown(props.content);

  useEffect(() => {
    if (!showRaw && bodyRef.current) {
      bodyRef.current.innerHTML = html;
    }
  }, [html, showRaw]);

  const classes = [
    "tui-markdown-renderer",
    props.className ?? "",
  ].filter(Boolean).join(" ");

  if (!props.rawViewEnabled) {
    return (
      <div className={classes}>
        <div
          ref={bodyRef}
          className="tui-markdown-body chat-bubble assistant"
        />
      </div>
    );
  }

  return (
    <div className={classes}>
      <div className="tui-markdown-toolbar">
        <div className="tui-markdown-toggle">
          <button
            type="button"
            className={`tui-markdown-btn${!showRaw ? " active" : ""}`}
            title="Preview markdown"
            onClick={() => setView("preview")}
          >
            Preview
          </button>
          <button
            type="button"
            className={`tui-markdown-btn${showRaw ? " active" : ""}`}
            title="View raw markdown"
            onClick={() => setView("raw")}
          >
            Raw
          </button>
        </div>
      </div>
      {showRaw ? (
        <pre className="tui-markdown-raw">{props.content}</pre>
      ) : (
        <div
          ref={bodyRef}
          className="tui-markdown-body chat-bubble assistant"
        />
      )}
    </div>
  );
}

export type {
  UIGroupItemMeta,
  UIIconButtonSize,
  UIIconButtonVariant,
  UIIconName,
  UIGroupSubtitle,
  UIGroupTitle,
};

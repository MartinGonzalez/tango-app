export const UI_STYLE_ID = "tango-instrument-ui-v1";

export const UI_STYLES = `
.tui-root {
  --tui-bg: var(--bg, #1e1e1e);
  --tui-bg-secondary: var(--bg-secondary, #181818);
  --tui-bg-card: var(--bg-card, #252526);
  --tui-bg-hover: var(--bg-hover, #2a2d2e);
  --tui-text: var(--text, #e5e7eb);
  --tui-text-secondary: var(--text-secondary, #9ca3af);
  --tui-border: var(--border, #333333);
  --tui-primary: var(--primary, #d97757);
  --tui-primary-soft: rgba(217, 119, 87, 0.18);
  --tui-primary-border: rgba(217, 119, 87, 0.45);
  --tui-primary-hover: rgba(217, 119, 87, 0.52);
  --tui-focus-ring: rgba(217, 119, 87, 0.55);
  --tui-control-bg: rgba(12, 12, 12, 0.72);
  --tui-dropdown-bg: #202020;
  --tui-dropdown-border: rgba(255, 255, 255, 0.12);
  --tui-dropdown-hover-bg: rgba(172, 98, 75, 0.82);
  --tui-radius-control: 9px;
  --tui-radius-panel: 10px;
  --tui-radius-inner: 7px;
  --tui-radius-tight: 4px;
  --tui-blue: var(--blue, #3b82f6);
  --tui-green: var(--green, #10b981);
  --tui-amber: var(--amber, #f59e0b);
  --tui-red: var(--red, #ef4444);
  font-family: var(--font-sans, "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
  font-size: 13px;
  color: var(--tui-text);
  width: 100%;
  min-height: 100%;
}

.tui-root .tui-col {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.tui-root .tui-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tui-root .tui-spread {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.tui-root .tui-card {
  border: 1px solid var(--tui-border);
  border-radius: var(--tui-radius-panel);
  background: var(--tui-bg-card);
  padding: 10px;
}

.tui-root .tui-header {
  border-bottom: 1px solid var(--tui-border);
  padding-bottom: 10px;
  margin-bottom: 10px;
}

.tui-root .tui-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.tui-root .tui-header-title {
  font-size: 20px;
  font-weight: 600;
  line-height: 1.1;
}

.tui-root .tui-header-subtitle {
  color: var(--tui-text-secondary);
  font-size: 12px;
  margin-top: 4px;
}

.tui-root .tui-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tui-root .tui-section-title {
  font-size: 13px;
  font-weight: 600;
}

.tui-root .tui-section-description {
  font-size: 12px;
  color: var(--tui-text-secondary);
}

.tui-root .tui-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: var(--tui-radius-control);
  border: 1px solid transparent;
  background: transparent;
  color: var(--tui-text-secondary);
  cursor: pointer;
  transition: all 120ms ease;
  font-weight: 600;
}

.tui-root .tui-btn-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  flex-shrink: 0;
}

.tui-root .tui-btn-label {
  line-height: 1;
}

.tui-root .tui-icon-btn {
  border-radius: var(--tui-radius-control);
  border: 1px solid transparent;
  background: transparent;
  color: var(--tui-text-secondary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  cursor: pointer;
  transition: all 120ms ease;
  flex-shrink: 0;
}

.tui-root .tui-icon-btn-sm {
  width: 28px;
  height: 28px;
}

.tui-root .tui-icon-btn-md {
  width: 32px;
  height: 32px;
}

.tui-root .tui-icon-btn-ghost:hover:not(:disabled) {
  color: var(--tui-text);
  background: rgba(255, 255, 255, 0.05);
}

.tui-root .tui-icon-btn-secondary {
  border-color: var(--tui-border);
  background: var(--tui-bg-secondary);
  color: var(--tui-text);
}

.tui-root .tui-icon-btn-secondary:hover:not(:disabled) {
  background: var(--tui-bg-hover);
}

.tui-root .tui-icon-btn.is-active {
  color: var(--tui-text);
  background: rgba(255, 255, 255, 0.08);
}

.tui-root .tui-icon-btn:focus-visible {
  outline: 2px solid var(--tui-focus-ring);
  outline-offset: 2px;
}

.tui-root .tui-icon-btn:disabled {
  opacity: 0.55;
  cursor: default;
}

.tui-root .tui-icon-btn-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
}

.tui-root .tui-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: currentColor;
}

.tui-root .tui-icon svg {
  display: block;
  width: 100%;
  height: 100%;
}

.tui-root .tui-btn:hover:not(:disabled) {
  background: var(--tui-bg-hover);
  color: var(--tui-text);
}

.tui-root .tui-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.tui-root .tui-btn-sm {
  min-height: 28px;
  padding: 0 10px;
  font-size: 12px;
}

.tui-root .tui-btn-md {
  min-height: 32px;
  padding: 0 12px;
  font-size: 12px;
}

.tui-root .tui-btn-primary {
  background: var(--tui-primary);
  border-color: transparent;
  color: #ffffff;
}

.tui-root .tui-btn-primary:hover:not(:disabled) {
  background: #bc7159;
  color: #ffffff;
}

.tui-root .tui-btn-primary:active:not(:disabled) {
  background: #9f5f49;
  color: #ffffff;
}

.tui-root .tui-btn-secondary {
  border-color: var(--tui-border);
  color: var(--tui-text);
}

.tui-root .tui-btn-ghost {
  color: var(--tui-text-secondary);
}

.tui-root .tui-btn-danger {
  background: rgba(239, 68, 68, 0.12);
  border-color: rgba(239, 68, 68, 0.4);
  color: #fecaca;
}

.tui-root .tui-input,
.tui-root .tui-textarea,
.tui-root .tui-select {
  width: 100%;
  background: var(--tui-bg-secondary);
  border: 1px solid var(--tui-border);
  border-radius: var(--tui-radius-control);
  color: var(--tui-text);
  padding: 8px 10px;
  font-size: 12px;
  font-family: inherit;
  outline: none;
}

.tui-root .tui-textarea {
  resize: vertical;
  min-height: 100px;
}

.tui-root .tui-input:focus,
.tui-root .tui-textarea:focus,
.tui-root .tui-select:focus {
  border-color: var(--tui-primary);
  box-shadow: 0 0 0 1px var(--tui-primary-soft);
}

.tui-root .tui-badge {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  border: 1px solid transparent;
  padding: 2px 8px;
  font-size: 10px;
  text-transform: capitalize;
}

.tui-root .tui-badge-neutral {
  color: var(--tui-text-secondary);
  border-color: rgba(156, 163, 175, 0.35);
}

.tui-root .tui-badge-info {
  color: #93c5fd;
  border-color: rgba(59, 130, 246, 0.45);
}

.tui-root .tui-badge-success {
  color: #86efac;
  border-color: rgba(16, 185, 129, 0.45);
}

.tui-root .tui-badge-warning {
  color: #fcd34d;
  border-color: rgba(245, 158, 11, 0.45);
}

.tui-root .tui-badge-danger {
  color: #fca5a5;
  border-color: rgba(239, 68, 68, 0.45);
}

.tui-root .tui-empty {
  border: 1px dashed var(--tui-border);
  border-radius: var(--tui-radius-panel);
  padding: 16px;
  text-align: center;
}

.tui-root .tui-empty-title {
  font-size: 13px;
  font-weight: 600;
}

.tui-root .tui-empty-description {
  margin-top: 6px;
  font-size: 12px;
  color: var(--tui-text-secondary);
}

.tui-root .tui-group {
  border: 1px solid transparent;
  border-radius: var(--tui-radius-control);
  background: transparent;
  margin-bottom: 6px;
  overflow: visible;
  transition: border-color 100ms ease, background 100ms ease;
}

.tui-root .tui-group-expanded {
  border-color: var(--tui-border);
  background: var(--tui-bg-card);
}

.tui-root .tui-group-expanded:hover {
  border-color: rgba(255, 255, 255, 0.22);
}

.tui-root .tui-group-active .tui-group-header {
  background: rgba(217, 119, 87, 0.06);
}

.tui-root .tui-group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border-bottom: 1px solid var(--tui-border);
  border-radius: var(--tui-radius-control) var(--tui-radius-control) 0 0;
  padding: 8px 10px;
}

.tui-root .tui-group-header-clickable {
  cursor: pointer;
  user-select: none;
}

.tui-root .tui-group-header:hover {
  background: var(--tui-bg-hover);
}

.tui-root .tui-group-header:focus-visible {
  outline: 1px solid var(--tui-primary);
  outline-offset: 2px;
  border-radius: var(--tui-radius-inner);
}

.tui-root .tui-group-header-collapsed {
  border-bottom: 0;
  border-radius: var(--tui-radius-control);
}

.tui-root .tui-group-meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.tui-root .tui-group-title-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.tui-root .tui-group-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--tui-text-secondary);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tui-root .tui-group-subtitle {
  font-size: 11px;
  color: var(--tui-text-secondary);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tui-root .tui-group-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.tui-root .tui-group-caret {
  color: var(--tui-text-secondary);
  font-size: 12px;
  line-height: 1;
  transform: rotate(-90deg);
  transition: transform 120ms ease;
}

.tui-root .tui-group-caret-expanded {
  transform: rotate(0deg);
}

.tui-root .tui-collapsible {
  display: grid;
  grid-template-rows: 1fr;
  transition: grid-template-rows 200ms ease-out;
}

.tui-root .tui-collapsible.is-collapsed {
  grid-template-rows: 0fr;
}

.tui-root .tui-collapsible-inner {
  overflow: hidden;
}

.tui-root .tui-group-list {
  padding: 6px 0;
  display: flex;
  flex-direction: column;
}

.tui-root .tui-group-empty {
  font-size: 11px;
  color: var(--tui-text-secondary);
  padding: 8px 12px;
}

.tui-root .tui-group-item {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  position: relative;
  border: 0;
  background: transparent;
  color: var(--tui-text-secondary);
  padding: 6px 12px;
  text-align: left;
  transition: all 100ms ease;
}

.tui-root button.tui-group-item {
  cursor: pointer;
}

.tui-root .tui-group-item:hover {
  background: var(--tui-bg-hover);
}

.tui-root .tui-group-item:active {
  background: rgba(255, 255, 255, 0.08);
}

.tui-root .tui-group-item-active {
  color: var(--tui-text);
  background: rgba(217, 119, 87, 0.10);
}

.tui-root .tui-group-item-active::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: var(--tui-primary);
  border-radius: 0 2px 2px 0;
}

.tui-root .tui-group-item-active:hover {
  background: rgba(217, 119, 87, 0.14);
}

.tui-root .tui-group-item-main {
  min-width: 0;
}

.tui-root .tui-group-item-title {
  display: block;
  font-size: 12px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tui-root .tui-group-item-subtitle {
  display: block;
  font-size: 10px;
  color: var(--tui-text-secondary);
  margin-top: 4px;
}

.tui-root .tui-group-item-meta {
  font-size: 10px;
  color: var(--tui-text-secondary);
  flex-shrink: 0;
}

.tui-root .tui-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.tui-root .tui-list-item {
  width: 100%;
  border-radius: var(--tui-radius-control);
  border: 1px solid transparent;
  background: transparent;
  color: var(--tui-text-secondary);
  text-align: left;
  padding: 8px 10px;
}

.tui-root .tui-list-item:hover {
  background: var(--tui-bg-hover);
  color: var(--tui-text);
}

.tui-root .tui-list-item-active {
  border-color: rgba(217, 119, 87, 0.4);
  background: rgba(217, 119, 87, 0.12);
  color: var(--tui-text);
}

.tui-root .tui-list-item-title {
  display: block;
  font-size: 12px;
  font-weight: 600;
}

.tui-root .tui-list-item-subtitle {
  display: block;
  font-size: 11px;
  color: var(--tui-text-secondary);
  margin-top: 4px;
}

.tui-root .tui-toggle,
.tui-root .tui-checkbox,
.tui-root .tui-radio {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: var(--tui-text);
  font-size: 12px;
  user-select: none;
}

.tui-root .tui-toggle,
.tui-root .tui-checkbox {
  cursor: pointer;
}

.tui-root .tui-toggle input,
.tui-root .tui-checkbox input,
.tui-root .tui-radio input {
  margin: 0;
}

.tui-root .tui-toggle {
  position: relative;
}

.tui-root .tui-toggle input,
.tui-root .tui-checkbox input {
  opacity: 0;
  width: 0;
  height: 0;
  position: absolute;
  pointer-events: none;
}

.tui-root .tui-toggle-label,
.tui-root .tui-checkbox-label {
  color: var(--tui-text);
  font-size: 12px;
  line-height: 1.3;
}

.tui-root .tui-toggle-slider {
  width: 38px;
  height: 22px;
  border-radius: 999px;
  border: 1px solid var(--tui-border);
  background: var(--tui-control-bg);
  display: inline-flex;
  align-items: center;
  padding: 2px;
  transition: border-color 120ms ease, background 120ms ease, box-shadow 120ms ease;
}

.tui-root .tui-toggle-slider::after {
  content: "";
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #6b7280;
  transition: transform 120ms ease, background 120ms ease;
}

.tui-root .tui-toggle input:checked + .tui-toggle-slider {
  border-color: var(--tui-primary-border);
  background: var(--tui-primary-soft);
  box-shadow:
    inset 0 0 0 1px rgba(217, 119, 87, 0.2),
    0 0 10px rgba(217, 119, 87, 0.25);
}

.tui-root .tui-toggle input:checked + .tui-toggle-slider::after {
  transform: translateX(16px);
  background: var(--tui-primary);
}

.tui-root .tui-checkbox {
  position: relative;
}

.tui-root .tui-toggle input:focus-visible + .tui-toggle-slider,
.tui-root .tui-checkbox input:focus-visible + .tui-checkbox-indicator {
  outline: 2px solid var(--tui-focus-ring);
  outline-offset: 2px;
}

.tui-root .tui-toggle input:disabled + .tui-toggle-slider,
.tui-root .tui-checkbox input:disabled + .tui-checkbox-indicator {
  opacity: 0.55;
}

.tui-root .tui-checkbox-indicator {
  width: 18px;
  height: 18px;
  border-radius: var(--tui-radius-tight);
  border: 1px solid var(--tui-border);
  background: var(--tui-control-bg);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: border-color 120ms ease, background 120ms ease, box-shadow 120ms ease;
}

.tui-root .tui-checkbox-indicator::after {
  content: "";
  width: 4px;
  height: 9px;
  border-right: 2px solid rgba(255, 255, 255, 0.95);
  border-bottom: 2px solid rgba(255, 255, 255, 0.95);
  transform: rotate(45deg);
  transform-origin: center;
  margin-top: -2px;
  opacity: 0;
  transition: opacity 120ms ease;
}

.tui-root .tui-checkbox:hover .tui-checkbox-indicator {
  border-color: rgba(255, 255, 255, 0.2);
}

.tui-root .tui-checkbox input:checked + .tui-checkbox-indicator {
  border-color: var(--tui-primary);
  background: var(--tui-primary);
  box-shadow: none;
}

.tui-root .tui-checkbox input:checked + .tui-checkbox-indicator::after {
  opacity: 1;
}

.tui-root .tui-radio-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.tui-root .tui-radio input {
  accent-color: var(--tui-primary);
}

.tui-root .tui-segmented {
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--tui-border);
  border-radius: var(--tui-radius-control);
  padding: 3px;
  background: var(--tui-control-bg);
  gap: 4px;
}

.tui-root .tui-segmented-item {
  border: none;
  background: transparent;
  color: var(--tui-text-secondary);
  border-radius: var(--tui-radius-inner);
  min-height: 28px;
  padding: 0 20px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  cursor: pointer;
  white-space: nowrap;
  transition: color 120ms ease, background 120ms ease;
}

.tui-root .tui-segmented-item:hover {
  color: rgba(255, 255, 255, 0.86);
  background: rgba(255, 255, 255, 0.05);
}

.tui-root .tui-segmented-item.is-active {
  background: var(--tui-primary);
  color: #fff;
}

.tui-root .tui-tabs {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.tui-root .tui-tabs-list {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: var(--tui-control-bg);
  border: 1px solid var(--tui-border);
  border-radius: var(--tui-radius-control);
  padding: 4px;
  overflow-x: auto;
  scrollbar-width: none;
}

.tui-root .tui-tabs-list::-webkit-scrollbar {
  display: none;
}

.tui-root .tui-tabs-trigger {
  border: none;
  border-radius: var(--tui-radius-inner);
  background: transparent;
  color: var(--tui-text-secondary);
  min-height: 28px;
  padding: 0 20px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  cursor: pointer;
  white-space: nowrap;
  transition: color 120ms ease, background 120ms ease;
}

.tui-root .tui-tabs-trigger:hover {
  color: rgba(255, 255, 255, 0.86);
  background: rgba(255, 255, 255, 0.05);
}

.tui-root .tui-tabs-trigger:focus-visible {
  outline: 2px solid var(--tui-focus-ring);
  outline-offset: 2px;
}

.tui-root .tui-tabs-trigger.is-active {
  background: var(--tui-primary);
  color: #fff;
}

.tui-root .tui-tabs-panel {
  border: 1px solid var(--tui-border);
  border-radius: var(--tui-radius-panel);
  background: var(--tui-bg-card);
  padding: 12px;
}

.tui-root .tui-dropdown-select {
  width: 100%;
  position: relative;
}

.tui-root .tui-dropdown-select-trigger {
  width: 100%;
  border: 1px solid var(--tui-dropdown-border);
  border-radius: var(--tui-radius-control);
  background: var(--tui-dropdown-bg);
  color: var(--tui-text);
  min-height: 42px;
  padding: 7px 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  cursor: pointer;
  transition: border-color 120ms ease, background 120ms ease;
  outline: none;
}

.tui-root .tui-dropdown-select-trigger:focus-visible {
  border-color: var(--tui-primary);
  box-shadow: 0 0 0 2px var(--tui-focus-ring);
}

.tui-root .tui-dropdown-select.is-open .tui-dropdown-select-trigger {
  border-color: var(--tui-primary-border);
}

.tui-root .tui-dropdown-select.is-disabled .tui-dropdown-select-trigger {
  opacity: 0.55;
  cursor: default;
}

.tui-root .tui-dropdown-select-value {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: left;
  font-size: 14px;
  font-weight: 500;
}

.tui-root .tui-dropdown-select-value.is-placeholder {
  color: rgba(255, 255, 255, 0.92);
}

.tui-root .tui-dropdown-select-caret {
  width: 10px;
  height: 10px;
  color: #8d94a3;
  flex-shrink: 0;
  position: relative;
  transition: color 120ms ease;
}

.tui-root .tui-dropdown-select-caret::before {
  content: "";
  position: absolute;
  inset: 1px;
  border-right: 2px solid currentColor;
  border-bottom: 2px solid currentColor;
  transform: rotate(45deg);
  transform-origin: center;
  transition: transform 120ms ease;
}

.tui-root .tui-dropdown-select.is-open .tui-dropdown-select-caret {
  color: var(--tui-primary);
}

.tui-root .tui-dropdown-select.is-open .tui-dropdown-select-caret::before {
  transform: rotate(-135deg);
}

.tui-root .tui-dropdown-select-menu {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  right: 0;
  border: 1px solid var(--tui-dropdown-border);
  border-radius: var(--tui-radius-control);
  background: var(--tui-dropdown-bg);
  box-shadow: 0 14px 24px rgba(0, 0, 0, 0.5);
  overflow: hidden;
  z-index: 40;
}

.tui-root .tui-dropdown-select-menu[hidden] {
  display: none;
}

.tui-root .tui-dropdown-select-item {
  width: 100%;
  border: 0;
  background: transparent;
  color: var(--tui-text);
  min-height: 40px;
  padding: 7px 14px;
  text-align: left;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: background 120ms ease, color 120ms ease;
}

.tui-root .tui-dropdown-select-item:hover:not(.is-active) {
  background: var(--tui-dropdown-hover-bg);
  color: #fff;
}

.tui-root .tui-dropdown-select-item.is-active {
  background: var(--tui-primary);
  color: #fff;
}

.tui-root .tui-dropdown {
  position: relative;
}

.tui-root .tui-dropdown-trigger {
  list-style: none;
  border: 1px solid var(--tui-border);
  border-radius: var(--tui-radius-control);
  background: var(--tui-bg-secondary);
  color: var(--tui-text);
  min-height: 30px;
  padding: 6px 10px;
  cursor: pointer;
  outline: none;
}

.tui-root .tui-dropdown-trigger:focus-visible {
  border-color: var(--tui-primary);
  box-shadow: 0 0 0 2px var(--tui-focus-ring);
}

.tui-root .tui-dropdown-menu {
  margin-top: 6px;
  border: 1px solid var(--tui-border);
  border-radius: var(--tui-radius-control);
  background: var(--tui-bg-card);
  overflow: hidden;
  min-width: 180px;
}

.tui-root .tui-dropdown-item {
  width: 100%;
  border: 0;
  background: transparent;
  color: var(--tui-text);
  text-align: left;
  min-height: 30px;
  padding: 0 10px;
}

.tui-root .tui-dropdown-item:hover {
  background: var(--tui-bg-hover);
}

.tui-root .tui-dropdown-item.is-danger {
  color: #fecaca;
}

.tui-root .tui-selection-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.tui-root .tui-selection-item {
  width: 100%;
  border: 1px solid var(--tui-border);
  border-radius: var(--tui-radius-control);
  background: transparent;
  color: var(--tui-text-secondary);
  text-align: left;
  padding: 8px 10px;
}

.tui-root .tui-selection-item:hover {
  background: var(--tui-bg-hover);
}

.tui-root .tui-selection-item.is-active {
  border-color: rgba(217, 119, 87, 0.4);
  color: var(--tui-text);
  background: rgba(217, 119, 87, 0.12);
}

.tui-root .tui-selection-title {
  display: block;
  font-size: 12px;
  font-weight: 600;
}

.tui-root .tui-selection-subtitle {
  display: block;
  margin-top: 4px;
  font-size: 11px;
  color: var(--tui-text-secondary);
}

.tui-root .tui-markdown-renderer {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: auto;
}

.tui-root .tui-markdown-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 44px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--tui-border);
  flex-shrink: 0;
}

.tui-root .tui-markdown-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.tui-root .tui-markdown-btn {
  min-width: 34px;
  height: 30px;
  border-radius: 9px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--tui-text-secondary);
  font-size: 12px;
  font-weight: 600;
  padding: 0 12px;
  cursor: pointer;
  transition: all 120ms ease;
}

.tui-root .tui-markdown-btn:hover:not(:disabled) {
  color: var(--tui-text);
  background: var(--tui-bg-hover);
}

.tui-root .tui-markdown-btn.active {
  color: var(--tui-text);
  border-color: rgba(59, 130, 246, 0.45);
  background: rgba(59, 130, 246, 0.14);
}

.tui-root .tui-markdown-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 16px 18px 18px;
}

.tui-root .tui-markdown-raw {
  margin: 0;
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 16px 18px 18px;
  font-family: var(--font-mono, "SF Mono", "Fira Code", "Cascadia Code", monospace);
  font-size: 12px;
  line-height: 1.6;
  color: var(--tui-text-secondary);
  white-space: pre-wrap;
  word-break: break-word;
}
`;

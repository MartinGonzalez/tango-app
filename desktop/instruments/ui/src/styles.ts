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
  border-radius: 10px;
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
  border-radius: 9px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--tui-text-secondary);
  cursor: pointer;
  transition: all 120ms ease;
  font-weight: 600;
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
  background: rgba(217, 119, 87, 0.14);
  border-color: rgba(217, 119, 87, 0.45);
  color: var(--tui-text);
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
  border-radius: 8px;
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
  border-color: var(--tui-blue);
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
  border-radius: 10px;
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
  border-radius: 8px;
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
  border-radius: 8px 8px 0 0;
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
  border-radius: 6px;
}

.tui-root .tui-group-header-collapsed {
  border-bottom: 0;
  border-radius: 8px;
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
  border-radius: 8px;
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
  gap: 8px;
  color: var(--tui-text);
  font-size: 12px;
}

.tui-root .tui-toggle input,
.tui-root .tui-checkbox input,
.tui-root .tui-radio input {
  margin: 0;
}

.tui-root .tui-toggle {
  position: relative;
}

.tui-root .tui-toggle input {
  opacity: 0;
  width: 0;
  height: 0;
  position: absolute;
}

.tui-root .tui-toggle-slider {
  width: 34px;
  height: 20px;
  border-radius: 999px;
  border: 1px solid var(--tui-border);
  background: var(--tui-bg-secondary);
  display: inline-flex;
  align-items: center;
  padding: 2px;
  transition: all 120ms ease;
}

.tui-root .tui-toggle-slider::after {
  content: "";
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--tui-text-secondary);
  transition: transform 120ms ease, background 120ms ease;
}

.tui-root .tui-toggle input:checked + .tui-toggle-slider {
  border-color: rgba(217, 119, 87, 0.45);
  background: rgba(217, 119, 87, 0.15);
}

.tui-root .tui-toggle input:checked + .tui-toggle-slider::after {
  transform: translateX(14px);
  background: var(--tui-primary);
}

.tui-root .tui-radio-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.tui-root .tui-segmented {
  display: inline-flex;
  border: 1px solid var(--tui-border);
  border-radius: 8px;
  padding: 2px;
  background: var(--tui-bg-secondary);
  gap: 2px;
}

.tui-root .tui-segmented-item {
  border: 0;
  background: transparent;
  color: var(--tui-text-secondary);
  border-radius: 6px;
  min-height: 28px;
  padding: 0 10px;
}

.tui-root .tui-segmented-item.is-active {
  background: rgba(217, 119, 87, 0.12);
  color: var(--tui-text);
}

.tui-root .tui-tabs {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tui-root .tui-tabs-list {
  display: flex;
  align-items: center;
  gap: 6px;
}

.tui-root .tui-tabs-trigger {
  border: 1px solid var(--tui-border);
  border-radius: 8px;
  background: var(--tui-bg-secondary);
  color: var(--tui-text-secondary);
  min-height: 28px;
  padding: 0 10px;
}

.tui-root .tui-tabs-trigger.is-active {
  border-color: rgba(217, 119, 87, 0.45);
  color: var(--tui-text);
}

.tui-root .tui-tabs-panel {
  border: 1px solid var(--tui-border);
  border-radius: 8px;
  background: var(--tui-bg-card);
  padding: 10px;
}

.tui-root .tui-dropdown {
  position: relative;
}

.tui-root .tui-dropdown-trigger {
  list-style: none;
  border: 1px solid var(--tui-border);
  border-radius: 8px;
  background: var(--tui-bg-secondary);
  color: var(--tui-text);
  min-height: 30px;
  padding: 6px 10px;
  cursor: pointer;
}

.tui-root .tui-dropdown-menu {
  margin-top: 6px;
  border: 1px solid var(--tui-border);
  border-radius: 8px;
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
  border-radius: 8px;
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
`;

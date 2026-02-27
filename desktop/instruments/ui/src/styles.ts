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
`;

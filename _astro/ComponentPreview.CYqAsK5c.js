import{a as I,r as p}from"./client.DQNo7nBM.js";var h={exports:{}},m={};/**
 * @license React
 * react-jsx-runtime.production.min.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */var k;function L(){if(k)return m;k=1;var t=I(),e=Symbol.for("react.element"),i=Symbol.for("react.fragment"),n=Object.prototype.hasOwnProperty,a=t.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentOwner,u={key:!0,ref:!0,__self:!0,__source:!0};function c(d,r,s){var l,g={},x=null,v=null;s!==void 0&&(x=""+s),r.key!==void 0&&(x=""+r.key),r.ref!==void 0&&(v=r.ref);for(l in r)n.call(r,l)&&!u.hasOwnProperty(l)&&(g[l]=r[l]);if(d&&d.defaultProps)for(l in r=d.defaultProps,r)g[l]===void 0&&(g[l]=r[l]);return{$$typeof:e,type:d,key:x,ref:v,props:g,_owner:a.current}}return m.Fragment=i,m.jsx=c,m.jsxs=c,m}var y;function E(){return y||(y=1,h.exports=L()),h.exports}var o=E();const w="tango-instrument-ui-v1",f=`
.tui-root {
  --tui-bg: var(--bg, #1e1e1e);
  --tui-bg-secondary: var(--bg-secondary, #181818);
  --tui-bg-card: var(--bg-card, #252526);
  --tui-bg-hover: var(--bg-hover, #2a2d2e);
  --tui-text: var(--text, #e5e7eb);
  --tui-text-secondary: var(--text-secondary, #9ca3af);
  --tui-text-tertiary: var(--text-tertiary, #6b7280);
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

.tui-root.tui-root-fixed {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.tui-root .tui-scroll-area {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.tui-root .tui-footer {
  flex-shrink: 0;
  padding: 12px 16px 16px;
  background: var(--tui-bg);
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
  overflow: hidden;
}

.tui-root .tui-header {
  border-bottom: 1px solid var(--tui-border);
  padding: 6px 12px;
  margin-bottom: 10px;
}

.tui-root .tui-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.tui-root .tui-header-title {
  font-size: 13px;
  font-weight: 500;
  line-height: 1.2;
}

.tui-root .tui-header-subtitle {
  color: var(--tui-text-tertiary);
  font-size: 11px;
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

.tui-root .tui-btn-full {
  width: 100%;
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

.tui-root .tui-icon-btn-primary {
  background: var(--tui-primary);
  border-color: var(--tui-primary);
  color: #fff;
}

.tui-root .tui-icon-btn-primary:hover:not(:disabled) {
  filter: brightness(1.15);
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

.tui-root .tui-btn-success {
  background: rgba(16, 185, 129, 0.12);
  border-color: rgba(16, 185, 129, 0.4);
  color: #a7f3d0;
}

.tui-root .tui-btn-success:hover:not(:disabled) {
  background: rgba(16, 185, 129, 0.22);
  color: #a7f3d0;
}

.tui-root .tui-btn-success:active:not(:disabled) {
  background: rgba(16, 185, 129, 0.32);
  color: #a7f3d0;
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

.tui-root .tui-tabs-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
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
  padding: 0;
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
  min-height: 34px;
  padding: 6px 11px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
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
  font-size: 12px;
  font-weight: 500;
}

.tui-root .tui-dropdown-select-value.is-placeholder {
  color: rgba(255, 255, 255, 0.92);
}

.tui-root .tui-dropdown-select-caret {
  width: 8px;
  height: 8px;
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
  top: calc(100% + 6px);
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
  min-height: 32px;
  padding: 6px 11px;
  text-align: left;
  cursor: pointer;
  font-size: 12px;
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
  min-width: 0;
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
  min-width: 0;
  overflow: auto;
  padding: 16px 0 18px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--tui-text);
}

.tui-root .tui-markdown-body p {
  margin: 0 0 10px;
}

.tui-root .tui-markdown-body h1,
.tui-root .tui-markdown-body h2,
.tui-root .tui-markdown-body h3,
.tui-root .tui-markdown-body h4,
.tui-root .tui-markdown-body h5,
.tui-root .tui-markdown-body h6 {
  margin: 14px 0 6px;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.tui-root .tui-markdown-body h1 { font-size: 18px; }
.tui-root .tui-markdown-body h2 { font-size: 16px; }
.tui-root .tui-markdown-body h3 { font-size: 14px; }

.tui-root .tui-markdown-body ul,
.tui-root .tui-markdown-body ol {
  margin: 0 0 10px 20px;
}

.tui-root .tui-markdown-body li {
  margin: 4px 0;
}

.tui-root .tui-markdown-body blockquote {
  margin: 10px 0;
  padding: 4px 0 4px 12px;
  border-left: 3px solid var(--tui-border);
  color: var(--tui-text-secondary);
}

.tui-root .tui-markdown-body a {
  color: var(--tui-link-color, var(--tui-primary));
  text-decoration: none;
  cursor: pointer;
}

.tui-root .tui-markdown-body a:hover {
  color: var(--tui-link-color, var(--tui-primary));
  filter: brightness(1.2);
  text-decoration: underline;
}

.tui-root .tui-markdown-body code:not(.code-block code) {
  font-family: var(--font-mono, "SF Mono", "Fira Code", "Cascadia Code", monospace);
  font-size: 0.9em;
  background: #3A2929;
  border: 1px solid #714545;
  border-radius: var(--tui-radius-tight);
  padding: 1px 5px;
  color: #F28888;
  white-space: nowrap;
}

.tui-root .tui-markdown-body .code-block {
  --code-token-comment: #8f8d88;
  --code-token-string: #9fd379;
  --code-token-number: #dfb676;
  --code-token-keyword: #8db8ff;
  --code-token-function: #89c9f4;
  --code-token-punctuation: #cfcdc6;
  --code-token-property: #9ec2ff;
  --code-token-variable: #e3c89b;
  --code-token-builtin: #90c2ff;
  position: relative;
  background: #1a1a1a;
  border: 1px solid var(--tui-border);
  border-radius: var(--tui-radius-panel);
  padding: 0;
  margin: 8px 0;
  overflow: hidden;
}

.tui-root .tui-markdown-body .code-block .code-block-lang {
  display: none;
}

.tui-root .tui-markdown-body .code-block .tui-code-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  border-bottom: 1px solid var(--tui-border);
  background: #222;
}

.tui-root .tui-markdown-body .code-block .tui-code-header-lang {
  font-family: var(--font-mono, "SF Mono", "Fira Code", "Cascadia Code", monospace);
  font-size: 11px;
  color: var(--tui-text-secondary);
  text-transform: lowercase;
}

.tui-root .tui-markdown-body .code-block .tui-code-copy {
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--tui-text-secondary);
  cursor: pointer;
  padding: 2px;
  border-radius: var(--tui-radius-tight);
  width: 22px;
  height: 22px;
}

.tui-root .tui-markdown-body .code-block .tui-code-copy:hover {
  background: rgba(255, 255, 255, 0.08);
  color: var(--tui-text);
}

.tui-root .tui-markdown-body .code-block .tui-code-copy.copied {
  color: #3fb950;
}

.tui-root .tui-markdown-body .code-block code {
  display: block;
  background: none;
  border: none;
  border-radius: 0;
  padding: 14px 16px;
  color: #f0efeb;
  white-space: pre;
  font-size: 13px;
  line-height: 1.62;
  font-family: "SF Mono", "JetBrains Mono", "Fira Code", ui-monospace, monospace;
  overflow-x: auto;
  max-height: 58vh;
}

.tui-root .tui-markdown-body .code-block .token.comment { color: var(--code-token-comment); }
.tui-root .tui-markdown-body .code-block .token.string { color: var(--code-token-string); }
.tui-root .tui-markdown-body .code-block .token.number,
.tui-root .tui-markdown-body .code-block .token.boolean { color: var(--code-token-number); }
.tui-root .tui-markdown-body .code-block .token.keyword,
.tui-root .tui-markdown-body .code-block .token.operator { color: var(--code-token-keyword); }
.tui-root .tui-markdown-body .code-block .token.function,
.tui-root .tui-markdown-body .code-block .token.class-name { color: var(--code-token-function); }
.tui-root .tui-markdown-body .code-block .token.punctuation { color: var(--code-token-punctuation); }
.tui-root .tui-markdown-body .code-block .token.property,
.tui-root .tui-markdown-body .code-block .token.attr-name,
.tui-root .tui-markdown-body .code-block .token.parameter { color: var(--code-token-property); }
.tui-root .tui-markdown-body .code-block .token.variable,
.tui-root .tui-markdown-body .code-block .token.constant,
.tui-root .tui-markdown-body .code-block .token.symbol { color: var(--code-token-variable); }
.tui-root .tui-markdown-body .code-block .token.builtin { color: var(--code-token-builtin); }

.tui-root .tui-container {
  background: #181818;
  border: 1px solid #323232;
  border-radius: 12px;
  padding: 16px;
}

.tui-root .tui-kv {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.tui-root .tui-kv-row {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
}

.tui-root .tui-kv-label {
  color: var(--tui-text-secondary);
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  flex-shrink: 0;
  min-width: 80px;
}

.tui-root .tui-kv-value {
  color: var(--tui-text);
  font-size: 12px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tui-root .tui-link {
  color: var(--tui-link-color, var(--tui-primary));
  text-decoration: none;
  cursor: pointer;
  transition: color 120ms ease;
}

.tui-root .tui-link:hover {
  color: var(--tui-link-color, var(--tui-primary));
  filter: brightness(1.2);
  text-decoration: underline;
}

.tui-root .tui-link:focus-visible {
  outline: 2px solid var(--tui-focus-ring);
  outline-offset: 2px;
  border-radius: 2px;
}

.tui-root .tui-inline-code {
  font-family: var(--font-mono, "SF Mono", "Fira Code", "Cascadia Code", monospace);
  font-size: 0.9em;
  background: #3A2929;
  border: 1px solid #714545;
  border-radius: var(--tui-radius-tight);
  padding: 1px 5px;
  color: #F28888;
  white-space: nowrap;
}

.tui-markdown-body img {
  max-width: 100%;
  max-height: 300px;
  border-radius: var(--tui-radius-tight);
  cursor: pointer;
  transition: filter 0.15s ease;
}
.tui-markdown-body img:hover {
  filter: brightness(0.85);
}

.tui-lightbox-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  cursor: pointer;
}

.tui-lightbox-img {
  max-width: 90vw;
  max-height: 90vh;
  object-fit: contain;
  border-radius: 6px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.5);
  cursor: default;
}

.tui-root .tui-markdown-raw {
  margin: 0;
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 16px 0 18px;
  font-family: var(--font-mono, "SF Mono", "Fira Code", "Cascadia Code", monospace);
  font-size: 12px;
  line-height: 1.6;
  color: var(--tui-text-secondary);
  white-space: pre-wrap;
  word-break: break-word;
}

/* ── Tree View ─────────────────────────────────────────────── */

.tui-root .tui-tree-view {
  padding: 4px 0;
}

.tui-root .tui-tree-folder {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 6px;
  border: 0;
  background: transparent;
  color: var(--tui-text-secondary);
  text-align: left;
  padding: 5px 10px;
  cursor: pointer;
  transition: background 80ms ease;
  font-family: inherit;
  font-size: 12px;
}

.tui-root .tui-tree-folder:hover {
  background: var(--tui-bg-hover);
}

.tui-root .tui-tree-caret {
  font-size: 10px;
  color: var(--tui-text-secondary);
  transition: transform 120ms ease;
  transform-origin: center;
  flex-shrink: 0;
}

.tui-root .tui-tree-folder-name {
  font-size: 12px;
  font-weight: 500;
  color: var(--tui-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
  flex: 1;
}

.tui-root .tui-tree-folder-count {
  margin-left: auto;
  font-size: 10px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  color: var(--tui-text-secondary);
  flex-shrink: 0;
}

.tui-root .tui-tree-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  cursor: pointer;
  transition: background 80ms ease;
}

.tui-root .tui-tree-item:hover {
  background: var(--tui-bg-hover);
}

.tui-root .tui-tree-item-active {
  background: var(--tui-bg-active);
}

.tui-root .tui-tree-item-active:hover {
  background: var(--tui-bg-active);
}

.tui-root .tui-tree-item-name {
  font-size: 12px;
  font-weight: 500;
  color: var(--tui-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  flex: 1;
}

.tui-root .tui-tree-item-active .tui-tree-item-name {
  color: var(--tui-text);
}

.tui-root .tui-tree-item-meta {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
}
`,b={Branch:"branch",Play:"play",Post:"post",AI:"ai",Check:"check",Pause:"pause",ExternalLink:"external-link",Send:"send",Pencil:"pencil"},S=new Set(Object.values(b)),j={[b.Branch]:[{tag:"line",x1:6,y1:4,x2:6,y2:20},{tag:"line",x1:6,y1:12,x2:18,y2:12},{tag:"circle",cx:6,cy:4,r:2.2},{tag:"circle",cx:18,cy:12,r:2.2},{tag:"circle",cx:6,cy:20,r:2.2}],[b.Play]:[{tag:"path",d:"M9 6 L19 12 L9 18 Z"}],[b.Post]:[{tag:"path",d:"M4 6 H20 V18 H4 Z"},{tag:"line",x1:7,y1:10,x2:17,y2:10},{tag:"line",x1:7,y1:14,x2:15,y2:14}],[b.AI]:[{tag:"path",d:"M12 3.5 L14.2 9.2 L20 12 L14.2 14.8 L12 20.5 L9.8 14.8 L4 12 L9.8 9.2 Z"}],[b.Check]:[{tag:"path",d:"M5 12.5 L10 17 L19 8"}],[b.Pause]:[{tag:"line",x1:9,y1:6,x2:9,y2:18},{tag:"line",x1:15,y1:6,x2:15,y2:18}],[b.ExternalLink]:[{tag:"path",d:"M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"},{tag:"line",x1:15,y1:3,x2:21,y2:3},{tag:"line",x1:21,y1:3,x2:21,y2:9},{tag:"line",x1:10,y1:14,x2:21,y2:3}],[b.Send]:[{tag:"line",x1:22,y1:2,x2:11,y2:13},{tag:"path",d:"M22 2 L15 22 L11 13 L2 9 Z"}],[b.Pencil]:[{tag:"path",d:"M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"},{tag:"path",d:"m15 5 4 4"}]};function C(t){return S.has(t)}function U(t){return j[t]??j[b.AI]}function _(t=document){if(!t||!t.head)return;const e=t.getElementById(w);if(e){e.textContent!==f&&(e.textContent=f);return}const i=t.createElement("style");i.id=w,i.textContent=f,t.head.appendChild(i)}const M=p.createContext(null);p.createContext({});function R(){return p.useContext(M)}const q=b;function P(t,e){return t.tag==="path"?o.jsx("path",{d:t.d},e):t.tag==="circle"?o.jsx("circle",{cx:t.cx,cy:t.cy,r:t.r},e):o.jsx("line",{x1:t.x1,y1:t.y1,x2:t.x2,y2:t.y2},e)}function $(){p.useEffect(()=>{_()},[])}function B(t){$();const e=["tui-root"];return t.fixed&&e.push("tui-root-fixed"),t.className&&e.push(t.className),o.jsx("div",{className:e.join(" "),children:t.children})}function V(t){return o.jsxs("div",{className:"tui-header tui-spread",children:[o.jsxs("div",{className:"tui-header-left",children:[t.onBack?o.jsx("button",{type:"button",className:"tui-btn tui-btn-ghost tui-btn-sm","aria-label":"Back",onClick:t.onBack,children:"←"}):null,o.jsxs("div",{children:[o.jsx("div",{className:"tui-header-title",children:t.title}),t.subtitle?o.jsx("div",{className:"tui-header-subtitle",children:t.subtitle}):null]})]}),o.jsx("div",{className:"tui-row",children:t.rightActions})]})}function H(t){return o.jsx("div",{className:`tui-card ${t.className??""}`.trim(),children:t.children})}function z(t){const e=t.size??16;return o.jsx("span",{className:`tui-icon ${t.className??""}`.trim(),role:t.title?"img":void 0,"aria-label":t.title,"aria-hidden":t.title?void 0:!0,style:{width:`${e}px`,height:`${e}px`},children:o.jsx("svg",{viewBox:"0 0 24 24",width:e,height:e,fill:"none",stroke:"currentColor",strokeWidth:"1.8",strokeLinecap:"round",strokeLinejoin:"round",children:U(t.name).map((i,n)=>P(i,`${t.name}-${n}`))})})}function D(t){const e=t.variant??"secondary",i=t.size??"md",n=`tui-btn tui-btn-${e} tui-btn-${i}${t.fullWidth?" tui-btn-full":""}`,a=typeof t.icon=="string"&&C(t.icon)?o.jsx(z,{name:t.icon,className:"tui-btn-icon"}):t.icon?o.jsx("span",{className:"tui-btn-icon","aria-hidden":"true",children:t.icon}):null;return o.jsxs("button",{type:"button",className:n,disabled:t.disabled,onClick:t.onClick,children:[a,o.jsx("span",{className:"tui-btn-label",children:t.label})]})}function J(t){const e=R(),i=t.variant??"ghost",n=t.size??"sm",a=typeof t.icon=="string"&&C(t.icon)?o.jsx(z,{name:t.icon,className:"tui-icon-btn-icon"}):o.jsx("span",{className:"tui-icon-btn-icon","aria-hidden":"true",children:t.icon}),u=()=>{t.onClick?.(),t.href&&e?.ui?.openUrl&&e.ui.openUrl(t.href)};return o.jsx("button",{type:"button",className:`tui-icon-btn tui-icon-btn-${i} tui-icon-btn-${n}${t.active?" is-active":""}`,"aria-label":t.label,title:t.title??t.label,disabled:t.disabled,onClick:u,children:a})}function W(t){return o.jsx("span",{className:`tui-badge tui-badge-${t.tone??"neutral"}`,children:t.label})}function Z(t){return o.jsxs("div",{className:"tui-empty",children:[o.jsx("div",{className:"tui-empty-title",children:t.title}),t.description?o.jsx("div",{className:"tui-empty-description",children:t.description}):null,t.action?o.jsx("div",{className:"tui-row",children:t.action}):null]})}function G(t){const e=t.initialValue??t.value??t.tabs[0]?.value??"",[i,n]=p.useState(e),a=typeof t.value=="string",u=a?t.value:i,c=t.tabs.find(r=>r.value===u)??t.tabs[0]??null;p.useEffect(()=>{if(a||t.tabs.length===0)return;t.tabs.some(s=>s.value===i)||n(t.tabs[0]?.value??"")},[a,i,t.tabs]);const d=r=>{a||n(r),t.onChange?.(r)};return o.jsxs("div",{className:"tui-tabs",children:[o.jsxs("div",{className:"tui-tabs-header",children:[o.jsx("div",{className:"tui-tabs-list",role:"tablist",children:t.tabs.map(r=>o.jsx("button",{type:"button",className:`tui-tabs-trigger${r.value===u?" is-active":""}`,role:"tab","aria-selected":r.value===u,tabIndex:r.value===u?0:-1,onClick:()=>d(r.value),children:r.label},r.value))}),t.rightActions?o.jsx("div",{className:"tui-tabs-actions",children:t.rightActions}):null]}),o.jsx("div",{className:"tui-tabs-panel",role:"tabpanel",children:c?.content})]})}function K(t){return o.jsx("div",{className:"tui-selection-list",children:t.items.map(e=>{const i=t.selected.includes(e.value);return o.jsxs("button",{type:"button",className:`tui-selection-item${i?" is-active":""}`,onClick:()=>{if(t.multiple){const n=i?t.selected.filter(a=>a!==e.value):[...t.selected,e.value];t.onChange?.(n)}else t.onChange?.([e.value])},children:[o.jsx("span",{className:"tui-selection-title",children:e.title}),e.subtitle?o.jsx("span",{className:"tui-selection-subtitle",children:e.subtitle}):null]},e.value)})})}function Y(t){const e=t.expanded??!0,i=typeof t.onToggle=="function",n=t.showCaret??!0,a=typeof t.title=="string"?o.jsx("span",{className:"tui-group-title",children:t.title}):t.title,u=typeof t.subtitle=="string"?o.jsx("span",{className:"tui-group-subtitle",children:t.subtitle}):t.subtitle??null,c=()=>{t.onToggle?.(!e)},d=["tui-group-header"];e||d.push("tui-group-header-collapsed"),i&&d.push("tui-group-header-clickable");const r=["tui-group"];return e&&r.push("tui-group-expanded"),t.active&&r.push("tui-group-active"),o.jsxs("div",{className:r.join(" "),children:[o.jsxs("div",{className:d.join(" "),role:i?"button":void 0,tabIndex:i?0:void 0,onClick:i?c:void 0,onKeyDown:i?s=>{(s.key==="Enter"||s.key===" ")&&(s.preventDefault(),c())}:void 0,children:[o.jsxs("div",{className:"tui-group-meta",children:[o.jsxs("div",{className:"tui-group-title-row",children:[a,t.meta]}),u]}),o.jsxs("div",{className:"tui-group-actions",onClick:s=>s.stopPropagation(),children:[t.actions,i&&n?o.jsx("span",{className:`tui-group-caret${e?" tui-group-caret-expanded":""}`,"aria-hidden":"true",children:"▾"}):null]})]}),o.jsx("div",{className:`tui-collapsible${e?"":" is-collapsed"}`,children:o.jsx("div",{className:"tui-collapsible-inner",children:o.jsx("div",{className:"tui-group-body",children:t.children})})})]})}function X(t){return o.jsx("div",{className:"tui-group-list",children:t.children})}function Q(t){return o.jsx("div",{className:"tui-group-empty",children:t.text})}function tt(t){const e=`tui-group-item${t.active?" tui-group-item-active":""}`,i=o.jsxs("div",{className:"tui-group-item-main",children:[o.jsx("span",{className:"tui-group-item-title",children:t.title}),t.subtitle?o.jsx("span",{className:"tui-group-item-subtitle",children:t.subtitle}):null]}),n=t.meta?o.jsx("span",{className:"tui-group-item-meta",children:t.meta}):null;return t.onClick?o.jsxs("button",{type:"button",className:e,onClick:t.onClick,children:[i,n]}):o.jsxs("div",{className:e,children:[i,n]})}const N='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',T='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';function A(t){const e=t.querySelectorAll("pre.code-block");for(const i of e){if(i.querySelector(".tui-code-header"))continue;const n=i.querySelector("code");if(!n)continue;let a="";const u=i.querySelector(".code-block-lang");if(u)a=u.textContent??"";else for(const s of n.classList){const l=s.match(/^(?:language-|lang-)(.+)$/);if(l){a=l[1];break}}const c=document.createElement("div");c.className="tui-code-header";const d=document.createElement("span");d.className="tui-code-header-lang",d.textContent=a||"code",c.appendChild(d);const r=document.createElement("button");r.type="button",r.className="tui-code-copy",r.innerHTML=N,r.title="Copy code",r.addEventListener("click",()=>{const s=n.textContent??"";navigator.clipboard.writeText(s).then(()=>{r.innerHTML=T,r.classList.add("copied"),setTimeout(()=>{r.innerHTML=N,r.classList.remove("copied")},1500)})}),c.appendChild(r),i.insertBefore(c,i.firstChild)}}function F(t,e){const i=t.querySelectorAll("img");for(const n of i)e&&!n.hasAttribute("data-proxy-attempted")&&n.addEventListener("error",()=>{if(n.hasAttribute("data-proxy-attempted"))return;n.setAttribute("data-proxy-attempted","true");const a=n.src;!a||a.startsWith("data:")||e(a).then(u=>{n.src=u}).catch(()=>{})}),n.addEventListener("click",()=>{const a=document.createElement("div");a.className="tui-lightbox-overlay";const u=document.createElement("img");u.className="tui-lightbox-img",u.src=n.src,u.alt=n.alt,u.addEventListener("click",d=>d.stopPropagation()),a.addEventListener("click",()=>a.remove());const c=d=>{d.key==="Escape"&&(a.remove(),document.removeEventListener("keydown",c))};document.addEventListener("keydown",c),a.appendChild(u),document.body.appendChild(a)})}function ot(t){const[e,i]=p.useState("preview"),n=p.useRef(null),a=e==="raw",u=t.renderMarkdown(t.content);p.useEffect(()=>{!a&&n.current&&(n.current.innerHTML=u,A(n.current),F(n.current,t.proxyImage))},[u,a]),p.useEffect(()=>{const d=n.current,r=t.openUrl;if(!d||!r)return;const s=l=>{const g=l.target.closest("a");if(!g)return;const x=g.getAttribute("href");x&&/^https?:\/\//.test(x)&&(l.preventDefault(),r(x))};return d.addEventListener("click",s),()=>d.removeEventListener("click",s)},[t.openUrl]);const c=["tui-markdown-renderer",t.className??""].filter(Boolean).join(" ");return t.rawViewEnabled?o.jsxs("div",{className:c,children:[o.jsx("div",{className:"tui-markdown-toolbar",children:o.jsxs("div",{className:"tui-markdown-toggle",children:[o.jsx("button",{type:"button",className:`tui-markdown-btn${a?"":" active"}`,title:"Preview markdown",onClick:()=>i("preview"),children:"Preview"}),o.jsx("button",{type:"button",className:`tui-markdown-btn${a?" active":""}`,title:"View raw markdown",onClick:()=>i("raw"),children:"Raw"})]})}),a?o.jsx("pre",{className:"tui-markdown-raw",children:t.content}):o.jsx("div",{ref:n,className:"tui-markdown-body"})]}):o.jsx("div",{className:c,children:o.jsx("div",{ref:n,className:"tui-markdown-body"})})}function et(t){return o.jsx("div",{className:"tui-kv",children:t.items.map((e,i)=>o.jsxs("div",{className:"tui-kv-row",children:[o.jsx("span",{className:"tui-kv-label",style:t.labelWidth?{width:t.labelWidth}:void 0,children:e.label}),o.jsx("span",{className:"tui-kv-value",children:e.value})]},i))})}function it({children:t,label:e}){return o.jsxs("div",{style:{borderRadius:"8px",overflow:"hidden",border:"1px solid #333",marginBlock:"1rem"},children:[e&&o.jsx("div",{style:{padding:"6px 12px",fontSize:"12px",color:"#888",background:"#1a1a1a",borderBottom:"1px solid #333",fontFamily:"monospace"},children:e}),o.jsx(B,{children:o.jsx("div",{style:{padding:"16px"},children:t})})]})}export{it as C,q as I,H as U,W as a,et as b,Z as c,D as d,Y as e,X as f,tt as g,Q as h,J as i,o as j,ot as k,V as l,K as m,G as n};

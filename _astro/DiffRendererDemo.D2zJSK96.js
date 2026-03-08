import{j as t,C as H}from"./ComponentPreview.CYqAsK5c.js";import{r as w,R}from"./client.DQNo7nBM.js";function F(i){return`${i.filePath}:${i.side}:${i.lineNumber}`}function B(i){const e=[],n=i.split(/^diff --git /m).filter(Boolean);for(const o of n){const a=P(o);a&&e.push(a)}return e}function P(i){const e=i.split(`
`);if(e.length===0)return null;const n=e[0].match(/^a\/(.+?)\s+b\/(.+?)$/);if(!n)return null;const o=n[1],a=n[2];if(i.includes("Binary files "))return{path:a,oldPath:o!==a?o:null,status:"modified",hunks:[],isBinary:!0};let r="modified";i.includes("new file mode")?r="added":i.includes("deleted file mode")?r="deleted":(i.includes("rename from")||o!==a)&&(r="renamed");const s=[],h=/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/;let u=null,l=0,c=0;for(let d=1;d<e.length;d++){const x=e[d],g=x.match(h);if(g){u={header:x,oldStart:parseInt(g[1],10),oldCount:parseInt(g[2]??"1",10),newStart:parseInt(g[3],10),newCount:parseInt(g[4]??"1",10),lines:[]},s.push(u),l=u.oldStart,c=u.newStart;continue}u&&(x.startsWith("+")?u.lines.push({type:"add",content:x.slice(1),oldLineNo:null,newLineNo:c++}):x.startsWith("-")?u.lines.push({type:"delete",content:x.slice(1),oldLineNo:l++,newLineNo:null}):x.startsWith(" ")&&u.lines.push({type:"context",content:x.slice(1),oldLineNo:l++,newLineNo:c++}))}return{path:a,oldPath:o!==a?o:null,status:r,hunks:s,isBinary:!1}}function G(i){let e=0,n=0;for(const o of i.hunks)for(const a of o.lines)a.type==="add"&&e++,a.type==="delete"&&n++;return{adds:e,dels:n}}function U(i){const e=[],n=[],o=[],a=()=>{const r=Math.max(n.length,o.length);for(let s=0;s<r;s++)e.push([n[s]??null,o[s]??null]);n.length=0,o.length=0};for(const r of i)r.type==="context"?(a(),e.push([r,r])):r.type==="delete"?n.push(r):r.type==="add"&&o.push(r);return a(),e}const z="tango-diff-ui-v1",A=`
/* ---- UIDiffRenderer ---- */

.tui-root .tui-diff {
  display: flex;
  flex-direction: column;
  width: 100%;
  font-family: var(--font-mono, "SF Mono", "Fira Code", "Fira Mono", Menlo, Consolas, monospace);
  font-size: 12px;
  line-height: 1.5;
}

/* Toolbar */

.tui-root .tui-diff-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  border-bottom: 1px solid var(--tui-border);
  font-family: var(--font-sans, "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
  font-size: 12px;
  color: var(--tui-text-secondary);
}

.tui-root .tui-diff-toolbar-label {
  user-select: none;
}

.tui-root .tui-diff-toolbar-actions {
  display: flex;
  gap: 2px;
}

.tui-root .tui-diff-view-btn {
  padding: 2px 8px;
  border: 1px solid var(--tui-border);
  background: transparent;
  color: var(--tui-text-secondary);
  font-size: 11px;
  cursor: pointer;
  transition: background 0.1s, color 0.1s;
}

.tui-root .tui-diff-view-btn:first-child {
  border-radius: var(--tui-radius-tight) 0 0 var(--tui-radius-tight);
}

.tui-root .tui-diff-view-btn:last-child {
  border-radius: 0 var(--tui-radius-tight) var(--tui-radius-tight) 0;
}

.tui-root .tui-diff-view-btn:not(:first-child) {
  border-left: none;
}

.tui-root .tui-diff-view-btn.active {
  background: var(--tui-primary-soft);
  color: var(--tui-text);
  border-color: var(--tui-primary-border);
}

/* File sections */

.tui-root .tui-diff-file {
  border-bottom: 1px solid var(--tui-border);
}

.tui-root .tui-diff-file:last-child {
  border-bottom: none;
}

.tui-root .tui-diff-file-header {
  display: flex;
  align-items: center;
  padding: 6px 10px;
  user-select: none;
  font-family: var(--font-sans, "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
  font-size: 12px;
  color: var(--tui-text);
  background: rgba(255, 255, 255, 0.08);
  border-bottom: 1px solid rgba(255, 255, 255, 0.14);
  transition: background 0.15s;
}

.tui-root .tui-diff-file-header:hover {
  background: var(--tui-bg-hover);
}

.tui-root .tui-diff-file-header-main {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
  cursor: pointer;
}

.tui-root .tui-diff-file-chevron {
  font-size: 10px;
  color: var(--tui-text-secondary);
  transition: transform 0.15s;
  flex-shrink: 0;
}

.tui-root .tui-diff-file.expanded > .tui-diff-file-header .tui-diff-file-chevron {
  transform: rotate(90deg);
}

.tui-root .tui-diff-file-status {
  font-weight: 700;
  font-size: 15px;
  flex-shrink: 0;
  width: 18px;
  text-align: center;
  line-height: 1;
}

/* Three-dot menu */

.tui-root .tui-diff-file-menu {
  position: relative;
  flex-shrink: 0;
}

.tui-root .tui-diff-file-menu-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: var(--tui-text-secondary);
  font-size: 16px;
  cursor: pointer;
  border-radius: var(--tui-radius-tight);
  transition: background 0.1s, color 0.1s;
  line-height: 1;
}

.tui-root .tui-diff-file-menu-btn:hover {
  background: var(--tui-bg-hover);
  color: var(--tui-text);
}

.tui-root .tui-diff-file-dropdown {
  position: absolute;
  top: 100%;
  right: 0;
  z-index: 100;
  min-width: 140px;
  margin-top: 2px;
  padding: 4px 0;
  background: var(--tui-dropdown-bg);
  border: 1px solid var(--tui-dropdown-border);
  border-radius: var(--tui-radius-inner);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.tui-root .tui-diff-file-dropdown-item {
  display: block;
  width: 100%;
  padding: 6px 12px;
  border: none;
  background: transparent;
  color: var(--tui-text);
  font-size: 12px;
  text-align: left;
  cursor: pointer;
  font-family: inherit;
}

.tui-root .tui-diff-file-dropdown-item:hover {
  background: var(--tui-dropdown-hover-bg);
}

.tui-root .tui-diff-file-status-added { color: var(--tui-green); }
.tui-root .tui-diff-file-status-deleted { color: var(--tui-red); }
.tui-root .tui-diff-file-status-modified { color: var(--tui-amber); }
.tui-root .tui-diff-file-status-renamed { color: var(--tui-blue); }

.tui-root .tui-diff-file-path {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tui-root .tui-diff-file-delta {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
  font-size: 11px;
}

.tui-root .tui-diff-delta-add { color: var(--tui-green); }
.tui-root .tui-diff-delta-del { color: var(--tui-red); }

.tui-root .tui-diff-file-binary {
  font-size: 10px;
  color: var(--tui-text-secondary);
  padding: 1px 5px;
  border: 1px solid var(--tui-border);
  border-radius: var(--tui-radius-tight);
}

.tui-root .tui-diff-file-body {
  overflow-x: auto;
}

/* Empty state */

.tui-root .tui-diff-empty {
  padding: 20px;
  text-align: center;
  color: var(--tui-text-secondary);
  font-family: var(--font-sans, "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
  font-size: 13px;
}

.tui-root .tui-diff-file-empty {
  padding: 10px;
  text-align: center;
  color: var(--tui-text-secondary);
  font-size: 12px;
}

/* Diff table */

.tui-root .tui-diff-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

/* Hunk header */

.tui-root .tui-diff-hunk-header td {
  padding: 4px 10px;
  color: var(--tui-text-secondary);
  background: rgba(59, 130, 246, 0.06);
  font-size: 11px;
  border-top: 1px solid var(--tui-border);
  border-bottom: 1px solid var(--tui-border);
}

/* Line rows */

.tui-root .tui-diff-line {
  transition: background 0.08s;
}

.tui-root .tui-diff-line:hover {
  filter: brightness(1.15);
}

.tui-root .tui-diff-line-add {
  background: rgba(16, 185, 129, 0.08);
}

.tui-root .tui-diff-line-delete {
  background: rgba(239, 68, 68, 0.08);
}

.tui-root .tui-diff-line-context {
  background: transparent;
}

/* Gutter column */

.tui-root .tui-diff-gutter {
  width: 20px;
  min-width: 20px;
  max-width: 20px;
  text-align: center;
  vertical-align: middle;
  padding: 0;
  user-select: none;
}

/* Line numbers */

.tui-root .tui-diff-line-no {
  width: 32px;
  min-width: 32px;
  max-width: 32px;
  padding: 0 6px 0 0;
  text-align: right;
  color: var(--tui-text-secondary);
  user-select: none;
  opacity: 0.6;
  font-size: 11px;
  vertical-align: top;
  border-right: 1px solid var(--tui-border);
}

.tui-root .tui-diff-line-no.tui-diff-line-no-add {
  color: #34d399;
  opacity: 1;
}

.tui-root .tui-diff-line-no.tui-diff-line-no-delete {
  color: #f87171;
  opacity: 1;
}

/* Line content */

.tui-root .tui-diff-line-content {
  padding: 0 12px;
  white-space: pre;
  word-break: break-all;
  tab-size: 4;
}

/* Split view specifics */

.tui-root .tui-diff-table.split .tui-diff-line-content {
  width: 50%;
}

.tui-root .tui-diff-split-divider {
  width: 1px;
  min-width: 1px;
  max-width: 1px;
  background: var(--tui-border);
  padding: 0;
}

/* After-line decoration row */

.tui-root .tui-diff-after-line td {
  padding: 0;
}

.tui-root .tui-diff-after-line-content {
  padding: 8px 12px;
  border-top: 1px solid var(--tui-border);
  border-bottom: 1px solid var(--tui-border);
  background: var(--tui-bg-card);
}

/* Addon: selection */

.tui-root .tui-diff-line-selected {
  background: rgba(59, 130, 246, 0.12) !important;
}

.tui-root .tui-diff-line-selected:hover {
  background: rgba(59, 130, 246, 0.18) !important;
}

/* Compact mode */

.tui-root .tui-diff.compact .tui-diff-file-header {
  display: none;
}

.tui-root .tui-diff.compact .tui-diff-line-no {
  width: 36px;
  min-width: 36px;
  max-width: 36px;
  padding: 0 4px;
}

.tui-root .tui-diff.compact .tui-diff-gutter {
  display: none;
}

/* Full file view */

.tui-root .tui-diff-full-file {
  border-top: 1px solid var(--tui-border);
}

.tui-root .tui-diff-full-file-header {
  padding: 6px 10px;
  font-family: var(--font-sans, "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
  font-size: 11px;
  font-weight: 600;
  color: var(--tui-text-secondary);
  background: var(--tui-bg-secondary);
  border-bottom: 1px solid var(--tui-border);
}

.tui-root .tui-diff-full-file-note {
  margin-left: 8px;
  font-weight: 400;
  font-style: italic;
  opacity: 0.7;
}

.tui-root .tui-diff-full-file-status {
  padding: 10px;
  text-align: center;
  color: var(--tui-text-secondary);
  font-size: 12px;
  border-top: 1px solid var(--tui-border);
}

.tui-root .tui-diff-full-file-error {
  color: var(--tui-red);
}

/* Thread comments (addon: diff-comments) */

.tui-root .tui-diff-after-line-content:has(.tui-diff-thread-bubble),
.tui-root .tui-diff-after-line-content:has(.tui-diff-inline-comment-bubble) {
  padding: 0;
  border-top: none;
  border-bottom: none;
  background: transparent;
}

.tui-root .tui-diff-thread-bubble {
  margin: 8px 10px 10px 22px;
  border: 1px solid var(--tui-border-heavy, var(--tui-border));
  border-radius: 12px;
  background: var(--tui-bg-card);
  overflow: hidden;
  font-family: var(--font-sans, "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
}

.tui-root .tui-diff-thread-card + .tui-diff-thread-card {
  border-top: 1px solid var(--tui-border);
}

.tui-root .tui-diff-thread-card-head {
  padding: 8px 12px;
  border-bottom: 1px solid var(--tui-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  user-select: none;
  list-style: none;
}

.tui-root .tui-diff-thread-card-head::-webkit-details-marker {
  display: none;
}

.tui-root .tui-diff-thread-card-head-left,
.tui-root .tui-diff-thread-card-head-right {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.tui-root .tui-diff-thread-card-caret {
  font-size: 10px;
  color: var(--tui-text-secondary);
  transition: transform 120ms ease;
  transform-origin: center;
}

.tui-root .tui-diff-thread-card[open] > .tui-diff-thread-card-head .tui-diff-thread-card-caret {
  transform: rotate(90deg);
}

.tui-root .tui-diff-thread-card-label {
  font-size: 12px;
  color: var(--tui-text-secondary);
}

.tui-root .tui-diff-thread-card-count {
  font-size: 11px;
  color: var(--tui-text-secondary);
  opacity: 0.7;
}

.tui-root .tui-diff-thread-card-resolved {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--tui-text-secondary);
  opacity: 0.7;
  border: 1px solid var(--tui-border);
  border-radius: 4px;
  padding: 2px 6px;
}

.tui-root .tui-diff-thread-comment {
  padding: 10px 12px;
}

.tui-root .tui-diff-thread-comment + .tui-diff-thread-comment {
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.tui-root .tui-diff-thread-comment-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.tui-root .tui-diff-thread-comment-author {
  font-size: 12px;
  font-weight: 600;
  color: var(--tui-text);
}

.tui-root .tui-diff-thread-comment-time {
  font-size: 11px;
  color: var(--tui-text-secondary);
  opacity: 0.7;
}

.tui-root .tui-diff-thread-comment-body {
  font-size: 13px;
  line-height: 1.55;
  color: var(--tui-text-secondary);
  white-space: normal;
  word-break: break-word;
  padding: 0;
  overflow: visible;
}

.tui-root .tui-diff-thread-comment-body > :first-child { margin-top: 0; }
.tui-root .tui-diff-thread-comment-body > :last-child { margin-bottom: 0; }
.tui-root .tui-diff-thread-comment-body p { margin: 0 0 8px; }

.tui-root .tui-diff-thread-reply {
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  padding: 10px 12px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.tui-root .tui-diff-thread-reply-trigger {
  border: 1px solid var(--tui-border);
  border-radius: 8px;
  background: transparent;
  color: var(--tui-text-secondary);
  font-size: 12px;
  cursor: pointer;
  padding: 5px 10px;
}

.tui-root .tui-diff-thread-reply-trigger:hover {
  border-color: var(--tui-border-heavy, var(--tui-border));
  color: var(--tui-text);
  background: var(--tui-bg-hover, rgba(255, 255, 255, 0.04));
}

.tui-root .tui-diff-thread-reply-input {
  width: 100%;
  box-sizing: border-box;
  resize: vertical;
  min-height: 72px;
  border: 1px solid var(--tui-border);
  border-radius: 10px;
  background: var(--tui-control-bg, rgba(0, 0, 0, 0.2));
  color: var(--tui-text);
  font-family: inherit;
  font-size: 13px;
  line-height: 1.5;
  padding: 10px 11px;
}

.tui-root .tui-diff-thread-reply-input:focus {
  outline: none;
  border-color: rgba(59, 130, 246, 0.6);
  box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.35);
}

.tui-root .tui-diff-thread-reply-input:disabled {
  opacity: 0.75;
}

.tui-root .tui-diff-thread-reply-actions {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.tui-root .tui-diff-thread-reply-btn {
  border: 1px solid rgba(59, 130, 246, 0.6);
  border-radius: 8px;
  background: rgba(59, 130, 246, 0.18);
  color: var(--tui-text);
  font-size: 12px;
  cursor: pointer;
  padding: 5px 10px;
}

.tui-root .tui-diff-thread-reply-btn:hover {
  background: rgba(59, 130, 246, 0.26);
}

.tui-root .tui-diff-thread-reply-btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.tui-root .tui-diff-thread-reply-btn.ghost {
  border-color: var(--tui-border);
  background: transparent;
  color: var(--tui-text-secondary);
}

.tui-root .tui-diff-thread-reply-btn.ghost:hover {
  border-color: var(--tui-border-heavy, var(--tui-border));
  background: var(--tui-bg-hover, rgba(255, 255, 255, 0.04));
  color: var(--tui-text);
}

.tui-root .tui-diff-thread-reply-error {
  color: #fca5a5;
  font-size: 11px;
}

/* Inline comment composer (addon: diff-comments) */

.tui-root .tui-diff-inline-comment-bubble {
  margin: 8px 10px 10px 22px;
  border: 1px solid var(--tui-border-heavy, var(--tui-border));
  border-radius: 12px;
  background: var(--tui-bg-card);
  overflow: hidden;
  padding: 12px;
  font-family: var(--font-sans, "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tui-root .tui-diff-inline-comment-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.tui-root .tui-diff-inline-comment-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--tui-text-secondary);
}

.tui-root .tui-diff-inline-comment-input {
  width: 100%;
  box-sizing: border-box;
  resize: vertical;
  min-height: 72px;
  border: 1px solid var(--tui-border);
  border-radius: 10px;
  background: var(--tui-control-bg, rgba(0, 0, 0, 0.2));
  color: var(--tui-text);
  font-family: inherit;
  font-size: 13px;
  line-height: 1.5;
  padding: 8px 10px;
}

.tui-root .tui-diff-inline-comment-input:focus {
  outline: none;
  border-color: var(--tui-border-heavy, var(--tui-border));
}

.tui-root .tui-diff-inline-comment-input:disabled {
  opacity: 0.75;
}

.tui-root .tui-diff-inline-comment-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.tui-root .tui-diff-inline-comment-btn {
  border: 1px solid var(--tui-border);
  border-radius: 8px;
  background: transparent;
  color: var(--tui-text);
  font-size: 12px;
  cursor: pointer;
  padding: 5px 10px;
}

.tui-root .tui-diff-inline-comment-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.05);
}

.tui-root .tui-diff-inline-comment-btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.tui-root .tui-diff-inline-comment-btn.ghost {
  border-color: var(--tui-border);
  color: var(--tui-text-secondary);
}

.tui-root .tui-diff-inline-comment-error {
  color: #fca5a5;
  font-size: 11px;
}

/* Syntax highlight tokens (fallback) */

.tui-root .tui-diff .token.keyword { color: #c678dd; }
.tui-root .tui-diff .token.string { color: #98c379; }
.tui-root .tui-diff .token.number { color: #d19a66; }
.tui-root .tui-diff .token.comment { color: #5c6370; font-style: italic; }
.tui-root .tui-diff .token.function { color: #61afef; }
.tui-root .tui-diff .token.operator { color: #56b6c2; }
.tui-root .tui-diff .token.punctuation { color: #abb2bf; }
`;function I(i){return i.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}const O=/\b(import|from|export|default|class|interface|type|enum|public|private|protected|function|const|let|var|return|if|else|for|while|switch|case|break|continue|new|async|await|try|catch|finally|throw|extends|implements|static|readonly|true|false|null|undefined|using|namespace|void|string|number|int|bool|boolean|this|base|super|of|in|do|yield|typeof|instanceof|delete)\b/g,V=/\b\d+(?:\.\d+)?\b/g,X=/`(?:\\.|[^`\\])*`|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g,q=/\/\/.*$/g;function K(i,e){if(i.length>8e3)return I(i);let n=I(i);const o=[],a=(r,s)=>`\0TK${o.push(`<span class="token ${s}">${r}</span>`)-1}\0`;return n=n.replace(X,r=>a(r,"string")),n=n.replace(q,r=>a(r,"comment")),n=n.replace(O,'<span class="token keyword">$1</span>'),n=n.replace(V,'<span class="token number">$&</span>'),n.replace(/\x00TK(\d+)\x00/g,(r,s)=>o[Number(s)]??"")}let E=!1;function W(){if(E||typeof document>"u")return;if(document.getElementById(z)){E=!0;return}const i=document.createElement("style");i.id=z,i.textContent=A,document.head.appendChild(i),E=!0}const Y=40;function J(i){const e=new Map,n=o=>{let a=e.get(o);return a||(a={lineClasses:[],gutters:[],afterLines:[],inlines:[]},e.set(o,a)),a};for(const o of i)for(const a of o.decorations){const r=F(a.address),s=n(r);switch(a.zone){case"line-class":s.lineClasses.push(a);break;case"gutter":s.gutters.push(a);break;case"after-line":s.afterLines.push(a);break;case"inline":s.inlines.push(a);break}}for(const o of e.values())o.afterLines.length>1&&o.afterLines.sort((a,r)=>(a.priority??0)-(r.priority??0));return e}function Q(i){return{onClick(e,n){for(const o of i)o.lineEventHandlers?.onClick?.(e,n)},onContextMenu(e,n){for(const o of i)o.lineEventHandlers?.onContextMenu?.(e,n)},onMouseEnter(e,n){for(const o of i)o.lineEventHandlers?.onMouseEnter?.(e,n)},onMouseLeave(e,n){for(const o of i)o.lineEventHandlers?.onMouseLeave?.(e,n)}}}function S(i){return i.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}function Z(i,e,n){if(n.length===0)return e;const o=S(i),a=[...n].sort((h,u)=>h.range[0]-u.range[0]);let r="",s=0;for(const h of a){const[u,l]=h.range;if(u>=o.length||l<=s)continue;const c=Math.max(u,s),d=Math.min(l,o.length);r+=o.slice(s,c),r+=`<span class="${S(h.className)}">`,r+=o.slice(c,d),r+="</span>",s=d}return r+=o.slice(s),r}function T(i){const{files:e,viewMode:n="unified",activeFile:o=null,expandedFiles:a,onToggleFile:r,onViewModeChange:s,syntaxHighlighter:h,onRequestFullFile:u,addons:l=[],showToolbar:c=!0,compact:d=!1,className:x,lineRef:g}=i,k=h===void 0?K:h??void 0;w.useEffect(()=>{W()},[]);const b=a instanceof Set,[j,L]=w.useState(()=>a==="none"?new Set:a===void 0||a==="all"?e.length<=Y?new Set(e.map(v=>v.path)):new Set:new Set(a)),m=b?a:j,N=w.useCallback(v=>{const f=!m.has(v);r?.(v,f),b||L($=>{const p=new Set($);return f?p.add(v):p.delete(v),p})},[m,r,b]),M=w.useMemo(()=>J(l),[l]),y=w.useMemo(()=>Q(l),[l]),C=w.useMemo(()=>l.some(v=>v.decorations.some(f=>f.zone==="gutter")),[l]);return e.length===0?t.jsx("div",{className:`tui-diff${d?" compact":""} ${x??""}`.trim(),children:t.jsx("div",{className:"tui-diff-empty",children:"No changes"})}):t.jsxs("div",{className:`tui-diff${d?" compact":""} ${x??""}`.trim(),children:[c&&!d&&t.jsx(tt,{fileCount:e.length,viewMode:n,onViewModeChange:s}),e.map(v=>t.jsx(et,{file:v,isExpanded:m.has(v.path),isActive:v.path===o,onToggle:()=>N(v.path),viewMode:n,syntaxHighlighter:k,onRequestFullFile:u,decorationMap:M,lineHandlers:y,hasGutter:C,compact:d,lineRef:g},v.path))]})}function tt(i){return t.jsxs("div",{className:"tui-diff-toolbar",children:[t.jsxs("span",{className:"tui-diff-toolbar-label",children:[i.fileCount," file",i.fileCount!==1?"s":""," changed"]}),i.onViewModeChange&&t.jsxs("div",{className:"tui-diff-toolbar-actions",children:[t.jsx("button",{type:"button",className:`tui-diff-view-btn${i.viewMode==="unified"?" active":""}`,onClick:()=>i.onViewModeChange("unified"),children:"Unified"}),t.jsx("button",{type:"button",className:`tui-diff-view-btn${i.viewMode==="split"?" active":""}`,onClick:()=>i.onViewModeChange("split"),children:"Split"})]})]})}function et(i){const{file:e,isExpanded:n,isActive:o,onToggle:a,onRequestFullFile:r,syntaxHighlighter:s,compact:h}=i,{adds:u,dels:l}=w.useMemo(()=>G(e),[e]),c={added:"+",deleted:"−",modified:"∙",renamed:"R"},d=w.useRef(null),[x,g]=w.useState(!1),[k,b]=w.useState(null),j=w.useRef(null);w.useEffect(()=>{if(!x)return;const m=N=>{j.current&&!j.current.contains(N.target)&&g(!1)};return document.addEventListener("mousedown",m),()=>document.removeEventListener("mousedown",m)},[x]),w.useEffect(()=>{o&&d.current&&d.current.scrollIntoView({behavior:"smooth",block:"nearest"})},[o]);const L=w.useCallback(async()=>{if(g(!1),!!r){if(k){b(null);return}b({status:"loading",content:"",message:"Loading..."});try{const m=await r(e.path);m.isBinary?b({status:"loaded",content:"",message:"Binary file"}):b({status:"loaded",content:m.content,message:m.truncated?"File truncated":""})}catch(m){const N=m instanceof Error?m.message:"Failed to load file";b({status:"error",content:"",message:N})}}},[r,e.path,k]);return t.jsxs("div",{ref:d,className:`tui-diff-file${n?" expanded":""}${o?" active":""}`,children:[!h&&t.jsxs("div",{className:"tui-diff-file-header",children:[t.jsxs("div",{className:"tui-diff-file-header-main",onClick:a,children:[t.jsx("span",{className:"tui-diff-file-chevron",children:"▶"}),t.jsx("span",{className:`tui-diff-file-status tui-diff-file-status-${e.status}`,children:c[e.status]??"∙"}),t.jsx("span",{className:"tui-diff-file-path",children:e.oldPath&&e.status==="renamed"?`${e.oldPath} → ${e.path}`:e.path}),t.jsxs("span",{className:"tui-diff-file-delta",children:[u>0&&t.jsxs("span",{className:"tui-diff-delta-add",children:["+",u]}),l>0&&t.jsxs("span",{className:"tui-diff-delta-del",children:["-",l]})]}),e.isBinary&&t.jsx("span",{className:"tui-diff-file-binary",children:"bin"})]}),r&&t.jsxs("div",{className:"tui-diff-file-menu",ref:j,children:[t.jsx("button",{type:"button",className:"tui-diff-file-menu-btn",onClick:m=>{m.stopPropagation(),g(!x)},"aria-label":"File actions",children:"⋮"}),x&&t.jsx("div",{className:"tui-diff-file-dropdown",children:t.jsx("button",{type:"button",className:"tui-diff-file-dropdown-item",onClick:m=>{m.stopPropagation(),L()},children:k?"Hide full file":"Show full file"})})]})]}),(n||h)&&t.jsxs("div",{className:"tui-diff-file-body",children:[t.jsx(ot,{...i}),k&&t.jsx(it,{state:k,filePath:e.path,syntaxHighlighter:s})]})]})}function it(i){const{state:e,filePath:n,syntaxHighlighter:o}=i;if(e.status==="loading")return t.jsx("div",{className:"tui-diff-full-file-status",children:"Loading full file..."});if(e.status==="error")return t.jsx("div",{className:"tui-diff-full-file-status tui-diff-full-file-error",children:e.message});if(!e.content)return t.jsx("div",{className:"tui-diff-full-file-status",children:e.message||"Empty file"});const a=e.content.split(`
`);return t.jsxs("div",{className:"tui-diff-full-file",children:[t.jsxs("div",{className:"tui-diff-full-file-header",children:["Full file",e.message&&t.jsx("span",{className:"tui-diff-full-file-note",children:e.message})]}),t.jsx("table",{className:"tui-diff-table unified",children:t.jsx("tbody",{children:a.map((r,s)=>{const h=s+1,u=o?o(r||" ",n):S(r||" ");return t.jsxs("tr",{className:"tui-diff-line tui-diff-line-context",children:[t.jsx("td",{className:"tui-diff-line-no",children:h}),t.jsx("td",{className:"tui-diff-line-content",dangerouslySetInnerHTML:{__html:u}})]},s)})})})]})}function ot(i){const{file:e,viewMode:n}=i;return e.isBinary?t.jsx("div",{className:"tui-diff-file-empty",children:"Binary file changed"}):e.hunks.length===0?t.jsx("div",{className:"tui-diff-file-empty",children:"Empty diff"}):n==="unified"?t.jsx(nt,{...i}):t.jsx(at,{...i})}function nt(i){const{file:e,syntaxHighlighter:n,decorationMap:o,lineHandlers:a,hasGutter:r,lineRef:s}=i;return t.jsx("table",{className:"tui-diff-table unified",children:t.jsx("tbody",{children:e.hunks.map((h,u)=>t.jsx(rt,{hunk:h,filePath:e.path,syntaxHighlighter:n,decorationMap:o,lineHandlers:a,hasGutter:r,lineRef:s},u))})})}function rt(i){const{hunk:e,filePath:n,syntaxHighlighter:o,decorationMap:a,lineHandlers:r,hasGutter:s,lineRef:h}=i,u=s?3:2;return t.jsxs(t.Fragment,{children:[t.jsxs("tr",{className:"tui-diff-hunk-header",children:[s&&t.jsx("td",{className:"tui-diff-gutter"}),t.jsx("td",{className:"tui-diff-line-no"}),t.jsx("td",{className:"tui-diff-line-content hunk-label",children:e.header})]}),e.lines.map((l,c)=>{const d={filePath:n,side:l.type==="delete"?"old":"new",lineNumber:(l.type==="delete"?l.oldLineNo:l.newLineNo)??0},x=F(d),g=a.get(x),k=l.type==="context"&&l.oldLineNo!=null?{filePath:n,side:"old",lineNumber:l.oldLineNo}:null,b=k?a.get(F(k)):null,j=[...(g?.lineClasses??[]).map(f=>f.className),...(b?.lineClasses??[]).map(f=>f.className)].join(" "),m=`tui-diff-line ${`tui-diff-line-${l.type}`}${j?` ${j}`:""}`,N=l.content||" ";let M=o?o(N,n):S(N);const y=[...g?.inlines??[],...b?.inlines??[]];y.length>0&&(M=Z(N,M,y));const C=[...g?.afterLines??[],...b?.afterLines??[]],v=[...g?.gutters??[],...b?.gutters??[]];return t.jsxs(R.Fragment,{children:[t.jsxs("tr",{className:m,onClick:f=>r.onClick(d,f),onContextMenu:f=>r.onContextMenu(d,f),onMouseEnter:f=>r.onMouseEnter(d,f),onMouseLeave:f=>r.onMouseLeave(d,f),ref:h?f=>h(d,f):void 0,children:[s&&t.jsx("td",{className:"tui-diff-gutter",children:v.map(f=>t.jsx("span",{title:f.title,children:f.content},f.key))}),t.jsx("td",{className:`tui-diff-line-no tui-diff-line-no-${l.type}`,children:l.type==="delete"?l.oldLineNo:l.type==="add"?l.newLineNo:l.newLineNo??l.oldLineNo}),t.jsx("td",{className:"tui-diff-line-content",dangerouslySetInnerHTML:{__html:M}})]}),C.map(f=>t.jsx("tr",{className:"tui-diff-after-line",children:t.jsx("td",{colSpan:u,children:t.jsx("div",{className:"tui-diff-after-line-content",children:f.content})})},f.key))]},c)})]})}function at(i){const{file:e,syntaxHighlighter:n,decorationMap:o,lineHandlers:a,hasGutter:r,lineRef:s}=i;return t.jsx("table",{className:"tui-diff-table split",children:t.jsx("tbody",{children:e.hunks.map((h,u)=>t.jsx(st,{hunk:h,filePath:e.path,syntaxHighlighter:n,decorationMap:o,lineHandlers:a,hasGutter:r,lineRef:s},u))})})}function st(i){const{hunk:e,filePath:n,syntaxHighlighter:o,decorationMap:a,lineHandlers:r,hasGutter:s,lineRef:h}=i,u=w.useMemo(()=>U(e.lines),[e.lines]),l=s?6:5;return t.jsxs(t.Fragment,{children:[t.jsxs("tr",{className:"tui-diff-hunk-header",children:[s&&t.jsx("td",{className:"tui-diff-gutter"}),t.jsx("td",{className:"tui-diff-line-no"}),t.jsx("td",{className:"tui-diff-line-content hunk-label"}),t.jsx("td",{className:"tui-diff-split-divider"}),t.jsx("td",{className:"tui-diff-line-no"}),t.jsx("td",{className:"tui-diff-line-content hunk-label",children:e.header})]}),u.map(([c,d],x)=>{const g=c&&c.oldLineNo!=null?{filePath:n,side:"old",lineNumber:c.oldLineNo}:null,k=g?a.get(F(g)):null,b=d&&d.newLineNo!=null?{filePath:n,side:"new",lineNumber:d.newLineNo}:null,j=b?a.get(F(b)):null,L=(k?.lineClasses??[]).map(p=>p.className).join(" "),m=(j?.lineClasses??[]).map(p=>p.className).join(" "),N=c?`tui-diff-line-${c.type}`:"",M=d?`tui-diff-line-${d.type}`:"",y=b??g,C=c?o?o(c.content||" ",n):S(c.content||" "):"",v=d?o?o(d.content||" ",n):S(d.content||" "):"",f=[...k?.afterLines??[],...j?.afterLines??[]].sort((p,_)=>(p.priority??0)-(_.priority??0)),$=k?.gutters??[];return j?.gutters,t.jsxs(R.Fragment,{children:[t.jsxs("tr",{className:`tui-diff-line ${N} ${M} ${L} ${m}`.replace(/\s+/g," ").trim(),onClick:y?p=>r.onClick(y,p):void 0,onContextMenu:y?p=>r.onContextMenu(y,p):void 0,onMouseEnter:y?p=>r.onMouseEnter(y,p):void 0,onMouseLeave:y?p=>r.onMouseLeave(y,p):void 0,ref:y&&h?p=>h(y,p):void 0,children:[s&&t.jsx("td",{className:"tui-diff-gutter",children:$.map(p=>t.jsx("span",{title:p.title,children:p.content},p.key))}),t.jsx("td",{className:`tui-diff-line-no ${N}${c?` tui-diff-line-no-${c.type}`:""}`,children:c?.oldLineNo!=null?c.oldLineNo:""}),t.jsx("td",{className:`tui-diff-line-content ${N}`,dangerouslySetInnerHTML:c?{__html:C}:void 0}),t.jsx("td",{className:"tui-diff-split-divider"}),t.jsx("td",{className:`tui-diff-line-no ${M}${d?` tui-diff-line-no-${d.type}`:""}`,children:d?.newLineNo!=null?d.newLineNo:""}),t.jsx("td",{className:`tui-diff-line-content ${M}`,dangerouslySetInnerHTML:d?{__html:v}:void 0})]}),f.map(p=>t.jsx("tr",{className:"tui-diff-after-line",children:t.jsx("td",{colSpan:l,children:t.jsx("div",{className:"tui-diff-after-line-content",children:p.content})})},p.key))]},x)})]})}const dt=`diff --git a/src/index.ts b/src/index.ts
index abc1234..def5678 100644
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,5 +1,6 @@
 import { serve } from "bun";
+import { logger } from "./logger";

 const server = serve({
-  port: 3000,
+  port: process.env.PORT || 3000,
   fetch(req) {
diff --git a/src/logger.ts b/src/logger.ts
new file mode 100644
--- /dev/null
+++ b/src/logger.ts
@@ -0,0 +1,4 @@
+export function logger(msg: string) {
+  const timestamp = new Date().toISOString();
+  console.log(\`[\${timestamp}] \${msg}\`);
+}
`,D=B(dt);function ft(){return t.jsx(H,{label:"Unified diff",children:t.jsx(T,{files:D,viewMode:"unified"})})}function ct(){return t.jsx(H,{label:"Split diff",children:t.jsx(T,{files:D,viewMode:"split"})})}export{ct as DiffSplitDemo,ft as DiffUnifiedDemo};

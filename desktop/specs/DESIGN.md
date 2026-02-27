# Design System

## Color Palette

### Core

| Token | Value | Usage |
|---|---|---|
| `--bg` | `#1e1e1e` | App background |
| `--bg-secondary` | `#181818` | Recessed surfaces |
| `--bg-card` | `#252526` | Card / group container background |
| `--bg-hover` | `#2a2d2e` | Hover state background |
| `--bg-active` | `#37373d` | Pressed / active state background |

### Text

| Token | Value | Usage |
|---|---|---|
| `--text` | `#e5e7eb` | Primary text |
| `--text-secondary` | `#9ca3af` | Labels, unselected items |
| `--text-tertiary` | `#6b7280` | Metadata, timestamps, counts |

### Borders

| Token | Value | Usage |
|---|---|---|
| `--border` | `#333333` | Default border (cards, dividers) |
| `--border-heavy` | `#404040` | Hover-elevated border |

### Accent

| Token | Value | Usage |
|---|---|---|
| `--primary` | `#d97757` | Primary accent (selection bar, active borders, buttons) |

### Semantic

| Token | Value | Usage |
|---|---|---|
| `--green` | `#10b981` | Success, active/running states |
| `--amber` | `#f59e0b` | Warnings, pending states |
| `--blue` | `#3b82f6` | Info, links |
| `--red` | `#ef4444` | Errors, destructive actions |
| `--purple` | `#a855f7` | Supplementary accent |

### Derived Colors (hardcoded)

| Value | Usage |
|---|---|
| `rgba(217, 119, 87, 0.06)` | Group header tint when group contains selected item |
| `rgba(217, 119, 87, 0.10)` | Selected item background |
| `rgba(217, 119, 87, 0.14)` | Hover on selected item |

---

## Typography

| Property | Value |
|---|---|
| Sans font | `Inter`, system fallback stack |
| Mono font | `SF Mono`, `Fira Code`, `JetBrains Mono` |
| Base size | `13px` |
| Group header title | `12px`, weight `600`, `--text-secondary` |
| Item label | `12px`, weight `500` |
| Metadata / timestamps | `10px`, `--text-tertiary` |
| Section titles | `10-11px`, uppercase, `letter-spacing: 0.06em`, `--text-tertiary` |
| Sidebar page title | `22px`, weight `600`, `letter-spacing: -0.01em` |

---

## Border Radius

| Token | Value | Usage |
|---|---|---|
| `--radius-sm` | `4px` | Small elements |
| `--radius-md` | `6px` | Buttons, inputs |
| `--radius-lg` | `12px` | Modals, large panels |
| Group cards | `8px` | All sidebar group containers |
| Last item in group | `0 0 7px 7px` | Bottom corners match card minus border |

---

## Grouping

All sidebar content is organized into **group cards** with a consistent structure:

```
[Group Container]
  [Group Header]    <- clickable, toggles expand/collapse
  [Group List]      <- contains selectable items
```

### Group Container

```css
border: 1px solid var(--border);
border-radius: 8px;
background: var(--bg-card);
margin-bottom: 6px;
overflow: visible;
transition: border-color 100ms ease;
```

- **Default**: `--border` border
- **Hover**: border elevates to `--border-heavy`
- **Active** (contains selected item): border becomes `--primary`

### Group Header

```css
padding: 8px 10px;
border-bottom: 1px solid var(--border);
border-radius: 8px 8px 0 0;
cursor: pointer;
user-select: none;
```

- **Expanded**: top border-radius, bottom border visible
- **Collapsed**: full `8px` border-radius, bottom border hidden
- **Active group**: light orange tint `rgba(217, 119, 87, 0.06)`
- **Focus-visible**: `outline: 1px solid var(--primary)`, `offset: 2px`

### Group List

```css
padding: 6px 0;
```

Zero horizontal padding so items can span full width (full-bleed pattern).

---

## Selection

Selection follows a **full-bleed** pattern across all sidebars. Items stretch edge-to-edge within their group container, with no gaps at left/right edges.

### Selected Item

```css
background: rgba(217, 119, 87, 0.10);   /* orange tint */
```

Plus a left accent bar via `::before`:

```css
content: "";
position: absolute;
left: 0;
top: 0;
bottom: 0;
width: 3px;
background: var(--primary);             /* #d97757 */
border-radius: 0 2px 2px 0;
```

### Interaction States

| State | Background |
|---|---|
| Default | `transparent` |
| Hover | `var(--bg-hover)` |
| Pressed (`:active`) | `var(--bg-active)` |
| Selected (`.active`) | `rgba(217, 119, 87, 0.10)` |
| Selected + hover | `rgba(217, 119, 87, 0.14)` |

### Item Layout

```css
padding: 6px 12px;           /* items own their horizontal inset */
position: relative;           /* anchor for ::before accent bar */
transition: all 100ms ease;
```

The last item in a group gets `border-radius: 0 0 7px 7px` to match the container's bottom corners.

### Selection Scope

- Selection highlight applies **only to items**, never to group headers
- When an item is selected, its parent group gets the **active group** treatment (orange border + header tint)
- Group headers are clickable for expand/collapse, not for selection

---

## Layout

| Token | Value |
|---|---|
| `--titlebar-height` | `38px` |
| `--panel-header-height` | `48px` |
| `--panel-header-padding-x` | `16px` |
| `--dv-sidepanel-fixed-width` | `320px` |

Title bar uses `hiddenInset` style for macOS-native traffic lights.

---

## Sidebar Structure

All secondary sidebars (PRs, Tasks, Plugins, Connectors) share this header:

```
[Back Button ←]  [Title]  [Optional Action Button]
```

- Back button: `26x26px`, `border-radius: 7px`
- Title: `22px`, weight `600`
- Header padding: `12px 12px 10px`
- Separated from content by `1px solid var(--border)`

The primary sidebar (Stages) has a simpler header with a `10px` uppercase section title.

---

## VCS Branch Label (shared component)

Reusable inline component for displaying a VCS branch name with icon. Used in Stages sidebar group headers, Tasks sidebar group headers, and anywhere a branch name is shown.

### Structure

```
span.vcs-branch
  span.vcs-branch-icon
    span.material-symbols-outlined  "fork_left"
  span.vcs-branch-text              "main"
```

### JS Helper

```ts
import { vcsBranchLabel } from "../lib/icons.ts";

// Returns the full .vcs-branch element
vcsBranchLabel("main");
vcsBranchLabel(branch ?? "No branch");
```

### CSS

```css
.vcs-branch {
  display: inline-flex;
  align-items: center;
  gap: 0;
  min-width: 0;
  font-size: 11px;
  color: var(--text-tertiary);
  line-height: 1.2;
}

.vcs-branch-icon .material-symbols-outlined {
  font-size: 14px;
  width: 14px;         /* clips Material Symbols glyph padding */
  overflow: hidden;
}

.vcs-branch-text {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

### Notes

- `gap: 0` + `width: 14px; overflow: hidden` on the icon eliminates the built-in glyph padding from Material Symbols, keeping icon and text flush.
- Supports Git, SVN, and any future VCS — the label is VCS-agnostic.
- The `stageBranchIcon()` function (in `icons.ts`) can still be used standalone with a custom class for non-label contexts (e.g. diff-view toolbar button).

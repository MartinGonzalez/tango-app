import { clearChildren, h } from "../lib/dom.ts";
import type { InstalledPlugin, PluginItem } from "../../shared/types.ts";
import type { PluginSidebarSelection } from "./plugins-sidebar.ts";
import { renderMarkdown } from "./chat-view.ts";

export class PluginsPreview {
  #el: HTMLElement;
  #bodyEl: HTMLElement;
  #onSelect: ((selection: PluginSidebarSelection) => void) | null;
  #plugins: InstalledPlugin[] = [];
  #selection: PluginSidebarSelection | null = null;
  #loading = false;
  #contentView: "preview" | "raw" = "preview";

  constructor(
    container: HTMLElement,
    opts?: {
      onSelect?: (selection: PluginSidebarSelection) => void;
    }
  ) {
    this.#onSelect = opts?.onSelect ?? null;
    this.#bodyEl = h("div", { class: "plugins-preview-body" });

    this.#el = h("section", { class: "plugins-preview", hidden: true }, [
      this.#bodyEl,
    ]);

    container.appendChild(this.#el);
  }

  render(
    plugins: InstalledPlugin[],
    selection: PluginSidebarSelection | null,
    opts?: { loading?: boolean }
  ): void {
    this.#plugins = plugins;
    this.#selection = selection;
    this.#loading = Boolean(opts?.loading);
    this.#renderContent();
  }

  #renderContent(): void {
    clearChildren(this.#bodyEl);
    this.#bodyEl.classList.remove("plugins-preview-body-item-mode");

    if (this.#loading) {
      this.#bodyEl.appendChild(
        h("div", { class: "plugins-preview-empty" }, ["Loading plugins..."])
      );
      return;
    }

    if (this.#plugins.length === 0) {
      this.#bodyEl.appendChild(
        h("div", { class: "plugins-preview-empty" }, ["No plugins installed"])
      );
      return;
    }

    const activePlugin = resolveActivePlugin(this.#plugins, this.#selection);
    if (!activePlugin) {
      this.#bodyEl.appendChild(
        h("div", { class: "plugins-preview-empty" }, ["Select a plugin"])
      );
      return;
    }

    if (!this.#selection || this.#selection.kind === "plugin") {
      this.#renderPluginCard(activePlugin);
      return;
    }

    const item = findSelectedItem(activePlugin, this.#selection);
    if (!item) {
      this.#renderPluginCard(activePlugin);
      return;
    }

    this.#renderItemCard(activePlugin, item, this.#selection.kind);
  }

  setVisible(visible: boolean): void {
    this.#el.hidden = !visible;
  }

  #renderPluginCard(plugin: InstalledPlugin): void {
    const totalCommands = plugin.commands.length;
    const totalAgents = plugin.agents.length;
    const totalSkills = plugin.skills.length;

    this.#bodyEl.appendChild(
      h("div", { class: "plugins-preview-card" }, [
        h("div", { class: "plugins-preview-head" }, [
          h("h2", { class: "plugins-preview-title" }, [plugin.displayName]),
          h("span", {
            class: `plugins-preview-status${plugin.status === "disabled" ? " is-disabled" : ""}`,
          }, [plugin.status === "disabled" ? "Disabled" : "Enabled"]),
        ]),
        h("div", { class: "plugins-preview-meta" }, [
          metaCell("Source", plugin.sourceLabel),
          metaCell("Version", plugin.version ?? "-") ,
          metaCell("Author", plugin.authorName ?? "-") ,
          metaCell("Updated", formatDate(plugin.lastUpdated) ?? "-") ,
        ]),
        plugin.description
          ? h("p", { class: "plugins-preview-description" }, [plugin.description])
          : h("p", { class: "plugins-preview-description plugins-preview-description-empty" }, [
              "No description",
            ]),
        h("div", { class: "plugins-preview-tags" }, [
          h("span", { class: "plugins-preview-tag" }, [`Commands ${totalCommands}`]),
          h("span", { class: "plugins-preview-tag" }, [`Agents ${totalAgents}`]),
          h("span", { class: "plugins-preview-tag" }, [`Skills ${totalSkills}`]),
        ]),
        h("div", { class: "plugins-preview-group" }, [
          this.#sectionList(plugin, "command", "Commands", plugin.commands),
          this.#sectionList(plugin, "agent", "Agents", plugin.agents),
          this.#sectionList(plugin, "skill", "Skills", plugin.skills),
        ]),
      ])
    );
  }

  #renderItemCard(
    plugin: InstalledPlugin,
    item: PluginItem,
    kind: "command" | "agent" | "skill"
  ): void {
    const label = kindLabel(kind);
    const markdownBody = stripMarkdownFrontmatter(item.content);
    const rendered = renderMarkdown(markdownBody || "_No content_");
    const showRaw = this.#contentView === "raw";
    this.#bodyEl.classList.add("plugins-preview-body-item-mode");

    this.#bodyEl.appendChild(
      h("div", { class: "plugins-preview-card plugins-preview-card-item" }, [
        h("div", { class: "plugins-detail-header" }, [
          h("div", { class: "plugins-preview-head" }, [
            h("div", { class: "plugins-preview-breadcrumb" }, [
              h("span", { class: "plugins-preview-breadcrumb-plugin" }, [plugin.displayName]),
              h("span", { class: "plugins-preview-breadcrumb-sep" }, ["/"]),
              h("span", { class: "plugins-preview-breadcrumb-kind" }, [label]),
            ]),
            h("h2", { class: "plugins-preview-title" }, [item.name]),
          ]),
        ]),
        h("div", { class: "plugins-preview-meta" }, [
          metaCell("Plugin", plugin.displayName),
          metaCell("Type", label),
          metaCell("Added by", "User"),
          metaCell("Last updated", formatDate(item.updatedAt) ?? "-"),
          metaCell("Path", item.relativePath),
        ]),
        item.description
          ? h("p", { class: "plugins-preview-description" }, [item.description])
          : h("p", { class: "plugins-preview-description plugins-preview-description-empty" }, [
              "No description",
            ]),
        h("div", { class: "plugins-preview-divider" }),
        h("section", { class: "plugins-content-panel" }, [
          h("div", { class: "plugins-content-toolbar" }, [
            h("div", { class: "plugins-content-view-toggle" }, [
              h("button", {
                class: `plugins-content-btn${!showRaw ? " active" : ""}`,
                type: "button",
                title: "Preview markdown",
                onclick: () => {
                  this.#contentView = "preview";
                  this.#renderContent();
                },
              }, ["Preview"]),
              h("button", {
                class: `plugins-content-btn${showRaw ? " active" : ""}`,
                type: "button",
                title: "View raw markdown",
                onclick: () => {
                  this.#contentView = "raw";
                  this.#renderContent();
                },
              }, ["Raw"]),
            ]),
            h("button", {
              class: "plugins-content-btn",
              type: "button",
              title: "Copy markdown",
              onclick: (event: Event) => {
                void this.#copyToClipboard(item.content, event.currentTarget as HTMLButtonElement);
              },
            }, ["Copy"]),
          ]),
          showRaw
            ? h("pre", { class: "plugins-preview-raw" }, [item.content])
            : h("div", {
                class: "plugins-preview-markdown chat-bubble assistant",
                innerHTML: rendered,
              }),
        ]),
      ])
    );
  }

  async #copyToClipboard(value: string, button: HTMLButtonElement): Promise<void> {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        copyWithSelectionFallback(value);
      }
      const prev = button.textContent;
      button.textContent = "Copied";
      button.disabled = true;
      setTimeout(() => {
        button.textContent = prev;
        button.disabled = false;
      }, 1100);
    } catch {
      // noop
    }
  }

  get element(): HTMLElement {
    return this.#el;
  }

  #sectionList(
    plugin: InstalledPlugin,
    kind: "command" | "agent" | "skill",
    title: string,
    items: PluginItem[]
  ): HTMLElement {
    const list = h("div", { class: "plugins-preview-section" }, [
      h("h3", { class: "plugins-preview-section-title" }, [title]),
    ]);

    if (items.length === 0) {
      list.appendChild(h("div", { class: "plugins-preview-section-empty" }, ["None"]));
      return list;
    }

    const first = items.slice(0, 8);
    for (const item of first) {
      list.appendChild(h("button", {
        class: "plugins-preview-section-row plugins-preview-section-link",
        type: "button",
        title: item.name,
        onclick: () => {
          this.#onSelect?.({
            kind,
            pluginId: plugin.id,
            itemId: item.id,
          });
        },
      }, [item.name]));
    }

    if (items.length > first.length) {
      list.appendChild(
        h("div", { class: "plugins-preview-section-more" }, [
          `+${items.length - first.length} more`,
        ])
      );
    }

    return list;
  }
}

function resolveActivePlugin(
  plugins: InstalledPlugin[],
  selection: PluginSidebarSelection | null
): InstalledPlugin | null {
  if (selection) {
    const selected = plugins.find((plugin) => plugin.id === selection.pluginId);
    if (selected) return selected;
  }
  return plugins[0] ?? null;
}

function findSelectedItem(
  plugin: InstalledPlugin,
  selection: PluginSidebarSelection
): PluginItem | null {
  if (selection.kind === "plugin") return null;

  const list = selection.kind === "command"
    ? plugin.commands
    : selection.kind === "agent"
      ? plugin.agents
      : plugin.skills;

  return list.find((item) => item.id === selection.itemId) ?? null;
}

function kindLabel(kind: "command" | "agent" | "skill"): string {
  if (kind === "command") return "Command";
  if (kind === "agent") return "Agent";
  return "Skill";
}

function metaCell(label: string, value: string): HTMLElement {
  return h("div", { class: "plugins-preview-meta-cell" }, [
    h("span", { class: "plugins-preview-meta-label" }, [label]),
    h("span", { class: "plugins-preview-meta-value", title: value }, [value]),
  ]);
}

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function stripMarkdownFrontmatter(source: string): string {
  const normalized = String(source ?? "").replace(/\r\n?/g, "\n");
  return normalized.replace(/^---\n[\s\S]*?\n---\n?/, "").trim();
}

function copyWithSelectionFallback(value: string): void {
  const textArea = document.createElement("textarea");
  textArea.value = value;
  textArea.setAttribute("readonly", "");
  textArea.style.position = "fixed";
  textArea.style.left = "-9999px";
  textArea.style.opacity = "0";
  document.body.appendChild(textArea);
  textArea.select();
  document.execCommand("copy");
  textArea.remove();
}

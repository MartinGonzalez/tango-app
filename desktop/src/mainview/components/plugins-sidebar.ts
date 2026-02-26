import { clearChildren, h } from "../lib/dom.ts";
import type { InstalledPlugin, PluginItemKind } from "../../shared/types.ts";

export type PluginSidebarSelection =
  | {
      kind: "plugin";
      pluginId: string;
    }
  | {
      kind: PluginItemKind;
      pluginId: string;
      itemId: string;
    };

export type PluginsSidebarCallbacks = {
  onSelect: (selection: PluginSidebarSelection) => void;
  onBack: () => void;
};

export class PluginsSidebar {
  #el: HTMLElement;
  #listEl: HTMLElement;
  #callbacks: PluginsSidebarCallbacks;
  #plugins: InstalledPlugin[] = [];
  #selection: PluginSidebarSelection | null = null;
  #loading = false;

  constructor(container: HTMLElement, callbacks: PluginsSidebarCallbacks) {
    this.#callbacks = callbacks;

    const header = h("div", { class: "plugins-sidebar-header" }, [
      h("button", {
        class: "plugins-sidebar-back-btn",
        title: "Back to workspaces",
        onclick: () => this.#callbacks.onBack(),
      }, ["\u2190"]),
      h("span", { class: "plugins-sidebar-title" }, ["Plugins"]),
    ]);

    this.#listEl = h("div", { class: "plugins-sidebar-list" });

    this.#el = h("div", { class: "plugins-sidebar" }, [
      header,
      this.#listEl,
    ]);

    container.appendChild(this.#el);
  }

  render(plugins: InstalledPlugin[], opts?: { loading?: boolean }): void {
    this.#plugins = plugins;
    this.#loading = Boolean(opts?.loading);
    this.#renderContent();
  }

  setSelection(selection: PluginSidebarSelection | null): void {
    this.#selection = selection;
    this.#renderContent();
  }

  #renderContent(): void {
    clearChildren(this.#listEl);

    if (this.#loading) {
      this.#listEl.appendChild(
        h("div", { class: "plugins-sidebar-empty" }, ["Loading plugins..."])
      );
      return;
    }

    if (this.#plugins.length === 0) {
      this.#listEl.appendChild(
        h("div", { class: "plugins-sidebar-empty" }, ["No plugins installed"])
      );
      return;
    }

    for (const plugin of this.#plugins) {
      this.#listEl.appendChild(this.#renderPlugin(plugin));
    }
  }

  #renderPlugin(plugin: InstalledPlugin): HTMLElement {
    const selectedPluginId = this.#selection?.pluginId;
    const isExpanded = selectedPluginId === plugin.id;
    const isPluginSelected = this.#selection?.kind === "plugin"
      && selectedPluginId === plugin.id;

    const pluginRow = h(
      "button",
      {
        class: `plugin-row${isPluginSelected ? " active" : ""}`,
        onclick: () => {
          this.#callbacks.onSelect({
            kind: "plugin",
            pluginId: plugin.id,
          });
        },
      },
      [
        h("span", { class: "plugin-row-name", title: plugin.id }, [plugin.displayName]),
        plugin.status === "disabled"
          ? h("span", { class: "plugin-row-status" }, ["Disabled"])
          : h("span", { class: "plugin-row-status plugin-row-status-enabled" }, ["Enabled"]),
      ]
    );

    const group = h("div", { class: `plugin-group${isExpanded ? " expanded" : ""}` }, [pluginRow]);

    if (!isExpanded) {
      return group;
    }

    const itemsWrap = h("div", { class: "plugin-items" });
    const rows = [
      this.#renderItemGroup(plugin, "command", "Commands", plugin.commands),
      this.#renderItemGroup(plugin, "agent", "Agents", plugin.agents),
      this.#renderItemGroup(plugin, "skill", "Skills", plugin.skills),
    ].filter((entry): entry is HTMLElement => Boolean(entry));

    if (rows.length === 0) {
      itemsWrap.appendChild(
        h("div", { class: "plugin-items-empty" }, ["No commands, agents, or skills"])
      );
    } else {
      for (const row of rows) {
        itemsWrap.appendChild(row);
      }
    }

    group.appendChild(itemsWrap);
    return group;
  }

  #renderItemGroup(
    plugin: InstalledPlugin,
    kind: PluginItemKind,
    label: string,
    items: InstalledPlugin["commands"]
  ): HTMLElement | null {
    if (items.length === 0) return null;

    const section = h("div", { class: "plugin-item-group" }, [
      h("div", { class: "plugin-item-group-title" }, [
        h("span", { class: "plugin-item-group-label" }, [label]),
        h("span", { class: "plugin-item-group-count" }, [String(items.length)]),
      ]),
    ]);

    for (const item of items) {
      const isActive = this.#selection?.kind === kind
        && this.#selection.pluginId === plugin.id
        && "itemId" in this.#selection
        && this.#selection.itemId === item.id;

      section.appendChild(
        h(
          "button",
          {
            class: `plugin-item-row${isActive ? " active" : ""}`,
            onclick: () => {
              this.#callbacks.onSelect({
                kind,
                pluginId: plugin.id,
                itemId: item.id,
              });
            },
            title: item.name,
          },
          [item.name]
        )
      );
    }

    return section;
  }

  get element(): HTMLElement {
    return this.#el;
  }
}

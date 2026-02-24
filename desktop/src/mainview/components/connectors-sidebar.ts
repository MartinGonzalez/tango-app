import { h } from "../lib/dom.ts";

export type ConnectorsSidebarCallbacks = {
  onBack: () => void;
};

export class ConnectorsSidebar {
  #el: HTMLElement;

  constructor(container: HTMLElement, callbacks: ConnectorsSidebarCallbacks) {
    const header = h("div", { class: "connectors-sidebar-header" }, [
      h("button", {
        class: "connectors-sidebar-back-btn",
        title: "Back to workspaces",
        onclick: () => callbacks.onBack(),
      }, ["\u2190"]),
      h("span", { class: "connectors-sidebar-title" }, ["Connectors"]),
    ]);

    const body = h("div", { class: "connectors-sidebar-body" });

    this.#el = h("div", { class: "connectors-sidebar" }, [
      header,
      body,
    ]);

    container.appendChild(this.#el);
  }

  get element(): HTMLElement {
    return this.#el;
  }
}

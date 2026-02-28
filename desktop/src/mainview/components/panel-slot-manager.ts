import { h } from "../lib/dom.ts";

export type SlotName = "sidebar" | "first" | "second";

export type SlotContent = {
  node: HTMLElement;
  onUnmount?: () => void | Promise<void>;
};

type RegionState = {
  host: HTMLElement;
  owner: string | null;
  onUnmount: (() => void | Promise<void>) | null;
};

type SlotState = {
  header: RegionState;
  body: RegionState;
};

/**
 * Manages content mounting/unmounting per panel slot.
 *
 * Each slot has a header region and a body region.
 * Consumers mount content into either region independently.
 * Panel show/hide (Cmd+1, Cmd+2) stays on PanelLayout — this class
 * only manages what's _inside_ each panel.
 */
export class PanelSlotManager {
  #slots: Map<SlotName, SlotState> = new Map();

  constructor(panels: Record<SlotName, HTMLElement>) {
    for (const [name, panel] of Object.entries(panels) as [SlotName, HTMLElement][]) {
      const headerHost = h("div", { class: `slot-header slot-header-${name}` });
      headerHost.style.flexShrink = "0";

      const bodyHost = h("div", { class: `slot-body slot-body-${name}` });
      bodyHost.style.flex = "1";
      bodyHost.style.minHeight = "0";
      bodyHost.style.display = "flex";
      bodyHost.style.flexDirection = "column";

      const root = h("div", { class: `slot-host slot-host-${name}` });
      root.style.height = "100%";
      root.style.width = "100%";
      root.style.display = "flex";
      root.style.flexDirection = "column";
      root.appendChild(headerHost);
      root.appendChild(bodyHost);
      panel.appendChild(root);

      this.#slots.set(name, {
        header: { host: headerHost, owner: null, onUnmount: null },
        body: { host: bodyHost, owner: null, onUnmount: null },
      });
    }
  }

  /**
   * Mount content into a slot's body region. Unmounts previous body content first.
   */
  async mount(
    slot: SlotName,
    owner: string,
    content: SlotContent
  ): Promise<void> {
    const state = this.#slots.get(slot);
    if (!state) throw new Error(`Unknown slot: ${slot}`);

    const region = state.body;
    if (region.owner === owner && region.host.firstChild === content.node) {
      return;
    }

    await this.#unmountRegion(region);
    region.owner = owner;
    region.onUnmount = content.onUnmount ?? null;
    region.host.replaceChildren(content.node);
  }

  /**
   * Mount content into a slot's header region. Unmounts previous header content first.
   */
  async mountHeader(
    slot: SlotName,
    owner: string,
    content: SlotContent
  ): Promise<void> {
    const state = this.#slots.get(slot);
    if (!state) throw new Error(`Unknown slot: ${slot}`);

    const region = state.header;
    if (region.owner === owner && region.host.firstChild === content.node) {
      return;
    }

    await this.#unmountRegion(region);
    region.owner = owner;
    region.onUnmount = content.onUnmount ?? null;
    region.host.replaceChildren(content.node);
  }

  /**
   * Unmount both header and body content from a slot.
   */
  async unmount(slot: SlotName): Promise<void> {
    const state = this.#slots.get(slot);
    if (!state) return;
    await this.#unmountRegion(state.header);
    await this.#unmountRegion(state.body);
  }

  /**
   * Unmount only the header content from a slot.
   */
  async unmountHeader(slot: SlotName): Promise<void> {
    const state = this.#slots.get(slot);
    if (!state) return;
    await this.#unmountRegion(state.header);
  }

  /**
   * Unmount all regions (header + body) owned by a specific consumer.
   */
  async unmountConsumer(owner: string): Promise<void> {
    for (const state of this.#slots.values()) {
      if (state.header.owner === owner) {
        await this.#unmountRegion(state.header);
      }
      if (state.body.owner === owner) {
        await this.#unmountRegion(state.body);
      }
    }
  }

  /**
   * Unmount all regions (header + body) from all slots.
   */
  async unmountAll(): Promise<void> {
    for (const state of this.#slots.values()) {
      await this.#unmountRegion(state.header);
      await this.#unmountRegion(state.body);
    }
  }

  /**
   * Get the current body owner of a slot.
   */
  getOwner(slot: SlotName): string | null {
    return this.#slots.get(slot)?.body.owner ?? null;
  }

  /**
   * Get the body host element for a slot (escape hatch during migration).
   */
  getHost(slot: SlotName): HTMLElement {
    const state = this.#slots.get(slot);
    if (!state) throw new Error(`Unknown slot: ${slot}`);
    return state.body.host;
  }

  /**
   * Get the header host element for a slot.
   */
  getHeaderHost(slot: SlotName): HTMLElement {
    const state = this.#slots.get(slot);
    if (!state) throw new Error(`Unknown slot: ${slot}`);
    return state.header.host;
  }

  async #unmountRegion(region: RegionState): Promise<void> {
    if (region.onUnmount) {
      try {
        await Promise.resolve(region.onUnmount());
      } catch (err) {
        console.error("Slot unmount callback failed:", err);
      }
    }
    region.owner = null;
    region.onUnmount = null;
    region.host.replaceChildren();
  }
}

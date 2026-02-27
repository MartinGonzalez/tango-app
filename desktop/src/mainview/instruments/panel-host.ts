import type { InstrumentPanelSlot, PanelAPI } from "../../shared/types.ts";

export type InstrumentPanelElements = {
  sidebar: HTMLElement;
  first: HTMLElement;
  second: HTMLElement;
  right: HTMLElement;
};

export class InstrumentPanelHost implements PanelAPI {
  #slots: InstrumentPanelElements;

  constructor(slots: InstrumentPanelElements) {
    this.#slots = slots;
  }

  mount(slot: InstrumentPanelSlot, node: HTMLElement): void {
    const host = this.#slots[slot];
    host.replaceChildren(node);
  }

  unmount(slot: InstrumentPanelSlot): void {
    const host = this.#slots[slot];
    host.replaceChildren();
  }

  setVisible(slot: InstrumentPanelSlot, visible: boolean): void {
    this.#slots[slot].hidden = !visible;
  }

  clearAll(): void {
    this.#slots.sidebar.replaceChildren();
    this.#slots.first.replaceChildren();
    this.#slots.second.replaceChildren();
    this.#slots.right.replaceChildren();
  }
}

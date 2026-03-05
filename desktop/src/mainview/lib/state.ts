type Listener<T> = (state: T) => void;

/**
 * Simple reactive store. Calls all listeners on set().
 */
export class Store<T> {
  #state: T;
  #listeners = new Set<Listener<T>>();

  constructor(initial: T) {
    this.#state = initial;
  }

  get(): T {
    return this.#state;
  }

  set(next: T): void {
    if (next === this.#state) return;
    this.#state = next;
    for (const fn of this.#listeners) {
      fn(next);
    }
  }

  update(fn: (prev: T) => T): void {
    this.set(fn(this.#state));
  }

  subscribe(fn: Listener<T>): () => void {
    this.#listeners.add(fn);
    return () => this.#listeners.delete(fn);
  }
}

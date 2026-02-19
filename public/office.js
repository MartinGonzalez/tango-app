/**
 * OfficeAdapter — reconciles /api/snapshot data into spawn/move/remove commands
 * for the Phaser pixel office scene.
 *
 * Each reconcile() call compares current snapshot against known agents and
 * produces a minimal set of commands. Includes debounce (2 consecutive polls
 * with same zone) before issuing a move.
 */
export class OfficeAdapter {
  /** @type {Map<string, {zone: string, deskIndex: number, name: string, pendingZone: string|null, pendingCount: number}>} */
  #knownAgents = new Map();
  #nextDesk = 0;

  /**
   * @param {{ processes: Array }} snapshot — from /api/snapshot
   * @returns {{ spawn: Array, move: Array, remove: Array }}
   */
  reconcile(snapshot) {
    const spawn = [];
    const move = [];
    const remove = [];

    const currentIds = new Set();

    for (const process of snapshot.processes) {
      const id = this.#deriveId(process);
      const name = this.#deriveName(process);
      const targetZone = activityToZone(process.activity);

      currentIds.add(id);

      const known = this.#knownAgents.get(id);

      if (!known) {
        // New agent — spawn it directly at the target zone
        const deskIndex = this.#nextDesk++;
        this.#knownAgents.set(id, {
          zone: targetZone,
          deskIndex,
          name,
          pendingZone: null,
          pendingCount: 0
        });
        spawn.push({ id, name, zone: targetZone, deskIndex });
        continue;
      }

      // Existing agent — check if zone changed
      if (targetZone === known.zone) {
        // Same zone, reset any pending debounce
        known.pendingZone = null;
        known.pendingCount = 0;
        continue;
      }

      // Zone differs — apply debounce
      if (known.pendingZone === targetZone) {
        known.pendingCount++;
      } else {
        // New pending zone, start debounce counter
        known.pendingZone = targetZone;
        known.pendingCount = 1;
      }

      if (known.pendingCount >= 2) {
        // Debounce satisfied — issue move
        known.zone = targetZone;
        known.pendingZone = null;
        known.pendingCount = 0;
        move.push({ id, zone: targetZone, deskIndex: known.deskIndex });
      }
    }

    // Remove agents that disappeared from the snapshot
    for (const [id] of this.#knownAgents) {
      if (!currentIds.has(id)) {
        remove.push({ id });
        this.#knownAgents.delete(id);
      }
    }

    return { spawn, move, remove };
  }

  #deriveId(process) {
    return process.task?.sessionId ?? `pid-${process.pid}`;
  }

  #deriveName(process) {
    const cwd = process.task?.cwd;
    if (cwd) {
      const basename = cwd.split("/").pop() || cwd;
      return basename.length > 15 ? basename.slice(0, 15) : basename;
    }
    const fallback = process.appName ?? `pid-${process.pid}`;
    return fallback.length > 15 ? fallback.slice(0, 15) : fallback;
  }
}

/**
 * Maps server activity strings to office zones.
 * @param {string} activity
 * @returns {'work' | 'plan' | 'lounge'}
 */
export function activityToZone(activity) {
  switch (activity) {
    case "working":
      return "work";
    case "waiting_for_input":
    case "waiting":
      return "plan";
    default:
      return "lounge";
  }
}

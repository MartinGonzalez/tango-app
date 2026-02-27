import type { InstrumentPermission, InstrumentRegistryEntry } from "../../shared/types.ts";

export function hasPermission(
  entry: InstrumentRegistryEntry,
  permission: InstrumentPermission
): boolean {
  return entry.permissions.includes(permission);
}

export function requirePermission(
  entry: InstrumentRegistryEntry,
  permission: InstrumentPermission
): void {
  if (hasPermission(entry, permission)) return;
  throw new Error(
    `Instrument '${entry.id}' does not declare required permission: ${permission}`
  );
}

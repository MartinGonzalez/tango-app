/**
 * Detects installed applications and extracts their icons.
 */
import { existsSync } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir, tmpdir } from "node:os";

export type DetectedApp = {
  id: string;
  name: string;
  appName: string;
  icon?: string; // base64 data URI (image/png)
};

const ICON_CACHE_DIR = join(homedir(), ".tango", "app-icons");
const ICON_SIZE = 32;

const KNOWN_APPS: Array<{ id: string; name: string; appName: string; path: string }> = [
  { id: "cursor",         name: "Cursor",          appName: "Cursor",              path: "/Applications/Cursor.app" },
  { id: "finder",         name: "Finder",          appName: "Finder",              path: "/System/Library/CoreServices/Finder.app" },
  { id: "terminal",       name: "Terminal",         appName: "Terminal",            path: "/System/Applications/Utilities/Terminal.app" },
  { id: "iterm2",         name: "iTerm2",           appName: "iTerm",              path: "/Applications/iTerm.app" },
  { id: "ghostty",        name: "Ghostty",          appName: "Ghostty",            path: "/Applications/Ghostty.app" },
  { id: "warp",           name: "Warp",             appName: "Warp",               path: "/Applications/Warp.app" },
  { id: "vscode",         name: "VS Code",          appName: "Visual Studio Code", path: "/Applications/Visual Studio Code.app" },
  { id: "xcode",          name: "Xcode",            appName: "Xcode",              path: "/Applications/Xcode.app" },
  { id: "android-studio", name: "Android Studio",   appName: "Android Studio",     path: "/Applications/Android Studio.app" },
  { id: "rider",          name: "Rider",            appName: "Rider",              path: "/Applications/Rider.app" },
];

let cachedApps: DetectedApp[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60_000;

/** Detect installed apps (synchronous, fast). */
export function getAvailableApps(): DetectedApp[] {
  const now = Date.now();
  if (cachedApps && now - cacheTimestamp < CACHE_TTL) return cachedApps;

  cachedApps = KNOWN_APPS
    .filter((app) => existsSync(app.path))
    .map(({ id, name, appName }) => ({ id, name, appName }));

  cacheTimestamp = now;
  return cachedApps;
}

/** Detect installed apps with their real icons (async, cached to disk). */
export async function getAvailableAppsWithIcons(): Promise<DetectedApp[]> {
  const apps = getAvailableApps();
  await mkdir(ICON_CACHE_DIR, { recursive: true });

  const results = await Promise.all(
    apps.map(async (app) => {
      const icon = await getAppIcon(app.id);
      return { ...app, icon: icon ?? undefined };
    })
  );

  return results;
}

async function getAppIcon(appId: string): Promise<string | null> {
  // Check disk cache first
  const cachePath = join(ICON_CACHE_DIR, `${appId}.png`);
  try {
    const cached = await readFile(cachePath);
    return `data:image/png;base64,${cached.toString("base64")}`;
  } catch {
    // Not cached yet
  }

  // Find the app entry
  const entry = KNOWN_APPS.find((a) => a.id === appId);
  if (!entry) return null;

  try {
    // Read Info.plist to get the icon file name
    const plistPath = join(entry.path, "Contents", "Info.plist");
    const proc = Bun.spawn(
      ["plutil", "-convert", "json", "-o", "-", plistPath],
      { stdout: "pipe", stderr: "ignore" }
    );
    const plistJson = await new Response(proc.stdout).text();
    await proc.exited;

    const plist = JSON.parse(plistJson);
    let iconName: string = plist.CFBundleIconFile || plist.CFBundleIconName || "";
    if (!iconName) return null;

    // Ensure .icns extension
    if (!iconName.endsWith(".icns")) iconName += ".icns";

    const icnsPath = join(entry.path, "Contents", "Resources", iconName);
    if (!existsSync(icnsPath)) return null;

    // Convert to PNG with sips
    const tmpPath = join(tmpdir(), `tango-icon-${appId}-${Date.now()}.png`);
    const sips = Bun.spawn(
      ["sips", "-s", "format", "png", "--resampleWidth", String(ICON_SIZE), icnsPath, "--out", tmpPath],
      { stdout: "ignore", stderr: "ignore" }
    );
    await sips.exited;

    const pngData = await readFile(tmpPath);
    // Cache to disk for next time
    await writeFile(cachePath, pngData).catch(() => {});
    // Clean up temp file
    await Bun.file(tmpPath).exists() && Bun.spawn(["rm", tmpPath], { stdout: "ignore", stderr: "ignore" });

    return `data:image/png;base64,${pngData.toString("base64")}`;
  } catch {
    return null;
  }
}

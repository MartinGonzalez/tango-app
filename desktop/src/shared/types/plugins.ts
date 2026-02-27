export type PluginItemKind = "command" | "agent" | "skill";

export type PluginItem = {
  id: string;
  kind: PluginItemKind;
  name: string;
  description: string;
  content: string;
  relativePath: string;
  updatedAt: string | null;
};

export type InstalledPlugin = {
  id: string;
  pluginName: string;
  displayName: string;
  marketplace: string;
  sourceLabel: string;
  version: string | null;
  description: string;
  authorName: string | null;
  installPath: string;
  installedAt: string | null;
  lastUpdated: string | null;
  status: "enabled" | "disabled";
  commands: PluginItem[];
  agents: PluginItem[];
  skills: PluginItem[];
};

import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "Claude Sessions",
    identifier: "dev.claude-sessions.app",
    version: "0.1.0",
  },
  build: {
    bun: {
      entrypoint: "src/bun/index.ts",
    },
    views: {
      mainview: {
        entrypoint: "src/mainview/index.ts",
      },
    },
    copy: {
      "src/mainview/index.html": "views/mainview/index.html",
      "src/mainview/styles.css": "views/mainview/styles.css",
    },
  },
} satisfies ElectrobunConfig;

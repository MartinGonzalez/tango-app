import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "Tango",
    identifier: "dev.tango.app",
    version: "0.0.0",
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
    mac: {
      icons: "icon.iconset",
    },
    linux: {
      icon: "assets/app-icon.png",
    },
    win: {
      icon: "assets/app-icon.ico",
    },
  },
} satisfies ElectrobunConfig;

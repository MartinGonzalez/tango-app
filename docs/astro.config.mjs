import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  integrations: [
    starlight({
      title: "Tango Instruments",
      description: "Build custom instruments for the Tango desktop app.",
      sidebar: [
        {
          label: "Getting Started",
          items: [
            { label: "Installation", slug: "getting-started/installation" },
            {
              label: "Project Structure",
              slug: "getting-started/project-structure",
            },
          ],
        },
        {
          label: "Tutorials",
          items: [
            { label: "Hello World", slug: "tutorials/01-hello-world" },
            { label: "UI Components", slug: "tutorials/02-ui-components" },
            { label: "Multiple Panels", slug: "tutorials/03-multiple-panels" },
            {
              label: "Backend Actions",
              slug: "tutorials/04-backend-actions",
            },
            { label: "Storage", slug: "tutorials/05-storage" },
            {
              label: "Events & Hooks",
              slug: "tutorials/06-events-and-hooks",
            },
          ],
        },
        {
          label: "Reference",
          items: [
            { label: "Manifest", slug: "reference/manifest" },
            { label: "Frontend API", slug: "reference/frontend-api" },
            { label: "Backend API", slug: "reference/backend-api" },
            { label: "UI Components", slug: "reference/ui-components" },
            { label: "Hooks", slug: "reference/hooks" },
            { label: "Permissions", slug: "reference/permissions" },
            { label: "Background Refresh", slug: "reference/background-refresh" },
            { label: "CLI", slug: "reference/cli" },
          ],
        },
      ],
    }),
  ],
});

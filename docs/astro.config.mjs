import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import react from "@astrojs/react";

const isCI = !!process.env.GITHUB_ACTIONS;

export default defineConfig({
  site: isCI ? "https://martingonzalez.github.io" : undefined,
  base: isCI ? "/tango-app" : undefined,
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
            {
              label: "Testing Your Instrument",
              slug: "tutorials/07-testing-your-instrument",
            },
            {
              label: "Publishing",
              slug: "tutorials/08-publishing",
            },
          ],
        },
        {
          label: "Reference",
          items: [
            { label: "AI Overview", slug: "reference/ai-overview" },
            { label: "Manifest", slug: "reference/manifest" },
            { label: "Frontend API", slug: "reference/frontend-api" },
            { label: "Backend API", slug: "reference/backend-api" },
            { label: "UI Components", slug: "reference/ui-components" },
            { label: "Hooks", slug: "reference/hooks" },
            { label: "Permissions", slug: "reference/permissions" },
            { label: "Background Refresh", slug: "reference/background-refresh" },
            { label: "CLI", slug: "reference/cli" },
            { label: "tango-create", slug: "reference/tango-create" },
          ],
        },
        {
          label: "Components",
          items: [
            { label: "Overview", slug: "components" },
            { label: "UIBadge", slug: "components/badge" },
            { label: "UIButton", slug: "components/button" },
            { label: "UICard", slug: "components/card" },
            { label: "UICheckbox", slug: "components/checkbox" },
            { label: "UIContainer", slug: "components/container" },
            { label: "UIDiffRenderer", slug: "components/diff-renderer" },
            { label: "UIDropdown", slug: "components/dropdown" },
            { label: "UIEmptyState", slug: "components/empty-state" },
            { label: "UIFooter", slug: "components/footer" },
            { label: "UIGroup", slug: "components/group" },
            { label: "UIIcon", slug: "components/icon" },
            { label: "UIIconButton", slug: "components/icon-button" },
            { label: "UIInlineCode", slug: "components/inline-code" },
            { label: "UIInput", slug: "components/input" },
            { label: "UIKeyValue", slug: "components/key-value" },
            { label: "UILink", slug: "components/link" },
            { label: "UIList", slug: "components/list" },
            { label: "UIMarkdownRenderer", slug: "components/markdown-renderer" },
            { label: "UIPanelHeader", slug: "components/panel-header" },
            { label: "UIRadioGroup", slug: "components/radio-group" },
            { label: "UIRoot", slug: "components/root" },
            { label: "UIScrollArea", slug: "components/scroll-area" },
            { label: "UISection", slug: "components/section" },
            { label: "UISegmentedControl", slug: "components/segmented-control" },
            { label: "UISelect", slug: "components/select" },
            { label: "UISelectionList", slug: "components/selection-list" },
            { label: "UITabs", slug: "components/tabs" },
            { label: "UITextarea", slug: "components/textarea" },
            { label: "UIToggle", slug: "components/toggle" },
            { label: "UITreeView", slug: "components/tree-view" },
          ],
        },
      ],
    }),
    react(),
  ],
});

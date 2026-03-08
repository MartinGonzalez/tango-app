import{j as e,C as r,k as n}from"./ComponentPreview.CYqAsK5c.js";import"./client.DQNo7nBM.js";function o(t){return t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/^### (.+)$/gm,"<h3>$1</h3>").replace(/^## (.+)$/gm,"<h2>$1</h2>").replace(/^# (.+)$/gm,"<h1>$1</h1>").replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>").replace(/`(.+?)`/g,"<code>$1</code>").replace(/\n/g,"<br />")}const a=`## Hello World

This is a **markdown** preview with \`inline code\` and formatting.

### Features

- Preview and raw toggle
- Code block copy buttons
- Image lightbox on click`;function i(){return e.jsx(r,{label:"Preview mode",children:e.jsx(n,{content:a,renderMarkdown:o})})}function d(){return e.jsx(r,{label:"With raw toggle",children:e.jsx(n,{content:a,renderMarkdown:o,rawViewEnabled:!0})})}export{i as MarkdownPreviewDemo,d as MarkdownRawDemo};

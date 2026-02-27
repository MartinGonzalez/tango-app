const searchInput = document.getElementById("doc-search");
const sections = Array.from(document.querySelectorAll("main section"));
const sidebarLinks = Array.from(document.querySelectorAll("#sidebar-nav a"));
const toc = document.getElementById("toc-nav");

buildToc();
observeActiveSection();
wireSearch();

function buildToc() {
  if (!toc) return;
  const fragment = document.createDocumentFragment();
  for (const section of sections) {
    const id = section.id;
    const title = section.dataset.title || id;
    const link = document.createElement("a");
    link.href = `#${id}`;
    link.textContent = title;
    fragment.appendChild(link);
  }
  toc.appendChild(fragment);
}

function observeActiveSection() {
  const tocLinks = Array.from(document.querySelectorAll("#toc-nav a"));
  const allLinks = [...sidebarLinks, ...tocLinks];

  const observer = new IntersectionObserver(
    (entries) => {
      let activeId = "";
      for (const entry of entries) {
        if (entry.isIntersecting) {
          activeId = entry.target.id;
        }
      }
      if (!activeId) return;

      for (const link of allLinks) {
        const isMatch = link.getAttribute("href") === `#${activeId}`;
        link.classList.toggle("active", isMatch);
      }
    },
    {
      rootMargin: "-35% 0px -45% 0px",
      threshold: 0.1,
    }
  );

  for (const section of sections) {
    observer.observe(section);
  }
}

function wireSearch() {
  if (!searchInput) return;
  searchInput.addEventListener("input", () => {
    const term = searchInput.value.trim().toLowerCase();
    for (const section of sections) {
      const text = section.textContent?.toLowerCase() || "";
      const title = (section.dataset.title || "").toLowerCase();
      const show = !term || text.includes(term) || title.includes(term);
      section.hidden = !show;
    }
  });
}

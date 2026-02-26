import { describe, test, expect } from "bun:test";
import {
  parseSvnBranch,
  parseSvnLogXml,
  type SvnLogEntry,
} from "../src/bun/vcs/svn-strategy.ts";

describe("parseSvnBranch", () => {
  test("parses trunk as branch name", () => {
    expect(parseSvnBranch("^/trunk")).toBe("trunk");
  });

  test("parses branch name from branches path", () => {
    expect(parseSvnBranch("^/branches/feature-auth")).toBe("feature-auth");
  });

  test("parses tag name from tags path", () => {
    expect(parseSvnBranch("^/tags/v1.2.3")).toBe("v1.2.3");
  });

  test("extracts trunk with project prefix", () => {
    expect(parseSvnBranch("^/TactileLaunchpad/trunk")).toBe("trunk");
  });

  test("extracts branch name with project prefix", () => {
    expect(parseSvnBranch("^/HoleGame/branches/martin_test-notifications")).toBe("martin_test-notifications");
  });

  test("extracts tag with project prefix", () => {
    expect(parseSvnBranch("^/MyProject/tags/v2.0")).toBe("v2.0");
  });

  test("returns last path segment for non-standard layout", () => {
    expect(parseSvnBranch("^/custom/path/here")).toBe("here");
  });

  test("returns null for empty input", () => {
    expect(parseSvnBranch("")).toBeNull();
  });

  test("returns null for whitespace-only input", () => {
    expect(parseSvnBranch("   ")).toBeNull();
  });

  test("strips leading ^/ prefix", () => {
    expect(parseSvnBranch("^/branches/fix-bug")).toBe("fix-bug");
  });

  test("handles trailing slashes", () => {
    expect(parseSvnBranch("^/branches/fix-bug/")).toBe("fix-bug");
  });

  test("handles nested branch paths", () => {
    expect(parseSvnBranch("^/branches/release/2.0")).toBe("release/2.0");
  });
});

describe("parseSvnLogXml", () => {
  test("parses a single log entry", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<log>
<logentry revision="1234">
<author>alice</author>
<date>2024-06-15T10:30:00.000000Z</date>
<msg>Fix null pointer in auth module</msg>
</logentry>
</log>`;

    const entries = parseSvnLogXml(xml);
    expect(entries).toHaveLength(1);
    expect(entries[0].revision).toBe("1234");
    expect(entries[0].author).toBe("alice");
    expect(entries[0].date).toBe("2024-06-15T10:30:00.000000Z");
    expect(entries[0].message).toBe("Fix null pointer in auth module");
  });

  test("parses multiple log entries", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<log>
<logentry revision="1234">
<author>alice</author>
<date>2024-06-15T10:30:00.000000Z</date>
<msg>First commit</msg>
</logentry>
<logentry revision="1233">
<author>bob</author>
<date>2024-06-14T09:00:00.000000Z</date>
<msg>Second commit</msg>
</logentry>
</log>`;

    const entries = parseSvnLogXml(xml);
    expect(entries).toHaveLength(2);
    expect(entries[0].revision).toBe("1234");
    expect(entries[1].revision).toBe("1233");
    expect(entries[1].author).toBe("bob");
  });

  test("handles empty log", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<log>
</log>`;
    const entries = parseSvnLogXml(xml);
    expect(entries).toHaveLength(0);
  });

  test("handles missing author field", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<log>
<logentry revision="100">
<date>2024-01-01T00:00:00.000000Z</date>
<msg>Auto commit</msg>
</logentry>
</log>`;

    const entries = parseSvnLogXml(xml);
    expect(entries).toHaveLength(1);
    expect(entries[0].author).toBe("");
  });

  test("handles empty message", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<log>
<logentry revision="100">
<author>alice</author>
<date>2024-01-01T00:00:00.000000Z</date>
<msg></msg>
</logentry>
</log>`;

    const entries = parseSvnLogXml(xml);
    expect(entries).toHaveLength(1);
    expect(entries[0].message).toBe("");
  });

  test("handles missing msg tag", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<log>
<logentry revision="100">
<author>alice</author>
<date>2024-01-01T00:00:00.000000Z</date>
</logentry>
</log>`;

    const entries = parseSvnLogXml(xml);
    expect(entries).toHaveLength(1);
    expect(entries[0].message).toBe("");
  });

  test("returns empty array for invalid xml", () => {
    const entries = parseSvnLogXml("not xml at all");
    expect(entries).toHaveLength(0);
  });

  test("returns empty array for empty input", () => {
    const entries = parseSvnLogXml("");
    expect(entries).toHaveLength(0);
  });

  test("handles multiline commit messages", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<log>
<logentry revision="500">
<author>charlie</author>
<date>2024-03-01T12:00:00.000000Z</date>
<msg>First line

Second paragraph with details.</msg>
</logentry>
</log>`;

    const entries = parseSvnLogXml(xml);
    expect(entries).toHaveLength(1);
    expect(entries[0].message).toContain("First line");
    expect(entries[0].message).toContain("Second paragraph");
  });

  test("handles XML entities in message", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<log>
<logentry revision="600">
<author>dave</author>
<date>2024-04-01T00:00:00.000000Z</date>
<msg>Fix &amp; improve &lt;auth&gt; module</msg>
</logentry>
</log>`;

    const entries = parseSvnLogXml(xml);
    expect(entries).toHaveLength(1);
    expect(entries[0].message).toBe("Fix & improve <auth> module");
  });
});

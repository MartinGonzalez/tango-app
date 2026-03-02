import { describe, expect, it } from "bun:test";
import { parseVersion, compareSemver, isPreRelease } from "../src/shared/version.ts";
import type { ParsedVersion } from "../src/shared/version.ts";

describe("parseVersion", () => {
  it("parses a stable version", () => {
    const v = parseVersion("1.2.3");
    expect(v).toEqual({ major: 1, minor: 2, patch: 3, preRelease: null });
  });

  it("parses an rc pre-release", () => {
    const v = parseVersion("1.0.0-rc1");
    expect(v).toEqual({ major: 1, minor: 0, patch: 0, preRelease: { channel: "rc", num: 1 } });
  });

  it("parses a beta pre-release", () => {
    const v = parseVersion("2.1.0-beta3");
    expect(v).toEqual({ major: 2, minor: 1, patch: 0, preRelease: { channel: "beta", num: 3 } });
  });

  it("parses an alpha pre-release", () => {
    const v = parseVersion("0.1.0-alpha1");
    expect(v).toEqual({ major: 0, minor: 1, patch: 0, preRelease: { channel: "alpha", num: 1 } });
  });

  it("parses pre-release without number as num 0", () => {
    const v = parseVersion("1.0.0-rc");
    expect(v).toEqual({ major: 1, minor: 0, patch: 0, preRelease: { channel: "rc", num: 0 } });
  });

  it("handles missing minor and patch", () => {
    const v = parseVersion("1");
    expect(v).toEqual({ major: 1, minor: 0, patch: 0, preRelease: null });
  });

  it("handles missing patch", () => {
    const v = parseVersion("1.2");
    expect(v).toEqual({ major: 1, minor: 2, patch: 0, preRelease: null });
  });

  it("handles unknown pre-release tag", () => {
    const v = parseVersion("1.0.0-dev5");
    expect(v.preRelease).toEqual({ channel: "dev5", num: 0 });
  });

  it("is case-insensitive for pre-release channel", () => {
    const v = parseVersion("1.0.0-RC2");
    expect(v.preRelease).toEqual({ channel: "rc", num: 2 });
  });
});

describe("compareSemver", () => {
  describe("stable versions", () => {
    it("returns negative when a < b (major)", () => {
      expect(compareSemver("1.0.0", "2.0.0")).toBeLessThan(0);
    });

    it("returns positive when a > b (major)", () => {
      expect(compareSemver("3.0.0", "1.0.0")).toBeGreaterThan(0);
    });

    it("returns 0 for equal versions", () => {
      expect(compareSemver("1.0.0", "1.0.0")).toBe(0);
    });

    it("compares minor versions", () => {
      expect(compareSemver("1.1.0", "1.2.0")).toBeLessThan(0);
      expect(compareSemver("1.3.0", "1.2.0")).toBeGreaterThan(0);
    });

    it("compares patch versions", () => {
      expect(compareSemver("1.0.1", "1.0.2")).toBeLessThan(0);
      expect(compareSemver("1.0.3", "1.0.2")).toBeGreaterThan(0);
    });
  });

  describe("pre-release ordering", () => {
    it("alpha < beta", () => {
      expect(compareSemver("1.0.0-alpha1", "1.0.0-beta1")).toBeLessThan(0);
    });

    it("beta < rc", () => {
      expect(compareSemver("1.0.0-beta1", "1.0.0-rc1")).toBeLessThan(0);
    });

    it("alpha < rc", () => {
      expect(compareSemver("1.0.0-alpha1", "1.0.0-rc1")).toBeLessThan(0);
    });

    it("pre-release < stable (rc < release)", () => {
      expect(compareSemver("1.0.0-rc1", "1.0.0")).toBeLessThan(0);
    });

    it("pre-release < stable (alpha < release)", () => {
      expect(compareSemver("1.0.0-alpha1", "1.0.0")).toBeLessThan(0);
    });

    it("stable > pre-release", () => {
      expect(compareSemver("1.0.0", "1.0.0-rc1")).toBeGreaterThan(0);
    });
  });

  describe("numbered pre-releases", () => {
    it("rc1 < rc2", () => {
      expect(compareSemver("1.0.0-rc1", "1.0.0-rc2")).toBeLessThan(0);
    });

    it("rc2 < rc3", () => {
      expect(compareSemver("1.0.0-rc2", "1.0.0-rc3")).toBeLessThan(0);
    });

    it("beta1 < beta2", () => {
      expect(compareSemver("1.0.0-beta1", "1.0.0-beta2")).toBeLessThan(0);
    });

    it("rc0 == rc (no number)", () => {
      expect(compareSemver("1.0.0-rc", "1.0.0-rc0")).toBe(0);
    });
  });

  describe("cross-version with pre-releases", () => {
    it("0.0.1-rc1 < 0.0.1 (pre-release before stable)", () => {
      expect(compareSemver("0.0.1-rc1", "0.0.1")).toBeLessThan(0);
    });

    it("0.0.1-rc2 > 0.0.1-rc1", () => {
      expect(compareSemver("0.0.1-rc2", "0.0.1-rc1")).toBeGreaterThan(0);
    });

    it("2.0.0-alpha1 > 1.0.0 (higher major wins)", () => {
      expect(compareSemver("2.0.0-alpha1", "1.0.0")).toBeGreaterThan(0);
    });

    it("1.0.0-rc99 < 1.0.0 (any pre-release < stable same version)", () => {
      expect(compareSemver("1.0.0-rc99", "1.0.0")).toBeLessThan(0);
    });
  });

  describe("edge cases", () => {
    it("handles versions with missing parts", () => {
      expect(compareSemver("1", "1.0.0")).toBe(0);
    });

    it("handles unknown pre-release tags (sorted between known and stable)", () => {
      // unknown gets rank 50, rc gets rank 3, stable gets rank 99
      expect(compareSemver("1.0.0-foo", "1.0.0")).toBeLessThan(0);
      expect(compareSemver("1.0.0-foo", "1.0.0-rc1")).toBeGreaterThan(0);
    });
  });
});

describe("isPreRelease", () => {
  it("returns false for stable version", () => {
    expect(isPreRelease("1.0.0")).toBe(false);
  });

  it("returns true for rc version", () => {
    expect(isPreRelease("1.0.0-rc1")).toBe(true);
  });

  it("returns true for beta version", () => {
    expect(isPreRelease("2.0.0-beta3")).toBe(true);
  });

  it("returns true for alpha version", () => {
    expect(isPreRelease("0.1.0-alpha1")).toBe(true);
  });

  it("returns true for unknown pre-release tag", () => {
    expect(isPreRelease("1.0.0-dev")).toBe(true);
  });
});

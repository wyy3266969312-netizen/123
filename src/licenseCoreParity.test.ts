import { describe, expect, it } from "vitest";

import * as browser from "./licenseKeyFormat";
import * as server from "../api/license-core";

/**
 * The key format is implemented twice on purpose.
 *
 * The browser copy must not reach `node:crypto`, and the server copy must not
 * import across the `api/` boundary — an earlier attempt to share one module
 * built cleanly and then killed every serverless function at invocation. So
 * the duplication is deliberate, and this file is the price of it: anything
 * that changes one copy without the other fails here instead of shipping a
 * deployment where the page and the server disagree about what a key is.
 */

const CASES = [
  "",
  "   ",
  "SOP-ABCD-EFGH-JKMN-PQRS-TVWX",
  "sop-abcd-efgh-jkmn-pqrs-tvwx",
  "ABCDEFGHJKMNPQRSTVWX",
  "  SOP ABCD EFGH JKMN PQRS TVWX  ",
  "SOP-SPSP-SPSP-SPSP-SPSP-SPSP",
  "SOP-ABCD",
  "SOP-ABCD-EFGH-JKMN-PQRS-TVWX-EXTRA",
  "OILU01-ABCD",
  "——？？中文",
  "sop",
  "SOPSOPSOPSOPSOPSOPSOPSOP",
];

describe("browser and server agree on the key format", () => {
  it("exposes the same constants", () => {
    expect(server.LICENSE_KEY_ALPHABET).toBe(browser.LICENSE_KEY_ALPHABET);
    expect(server.LICENSE_KEY_PREFIX).toBe(browser.LICENSE_KEY_PREFIX);
    expect(server.LICENSE_SERIAL_LENGTH).toBe(browser.LICENSE_SERIAL_LENGTH);
    expect(server.LICENSE_SIGNATURE_LENGTH).toBe(
      browser.LICENSE_SIGNATURE_LENGTH,
    );
    expect(server.LICENSE_KEY_LENGTH).toBe(browser.LICENSE_KEY_LENGTH);
  });

  it("normalizes every hand-picked case identically", () => {
    for (const input of CASES) {
      expect(server.normalizeLicenseKey(input)).toBe(
        browser.normalizeLicenseKey(input),
      );
    }
  });

  it("formats, splits, and length-checks identically", () => {
    for (const input of CASES) {
      const normalized = browser.normalizeLicenseKey(input);
      expect(server.formatLicenseKey(normalized)).toBe(
        browser.formatLicenseKey(normalized),
      );
      expect(server.looksLikeLicenseKey(normalized)).toBe(
        browser.looksLikeLicenseKey(normalized),
      );
      expect(server.splitLicenseKey(normalized)).toEqual(
        browser.splitLicenseKey(normalized),
      );
    }
  });

  it("agrees on real issued keys, in every shape a buyer might paste", () => {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const key = server.issueLicenseKey("parity-secret");

      for (const variant of [
        key,
        key.toLowerCase(),
        key.replace(/-/g, ""),
        ` ${key} `,
        key.replace(/-/g, " "),
      ]) {
        const normalized = server.normalizeLicenseKey(variant);
        expect(normalized).toBe(browser.normalizeLicenseKey(variant));
        expect(browser.looksLikeLicenseKey(normalized)).toBe(true);
        expect(browser.formatLicenseKey(normalized)).toBe(key);
      }
    }
  });

  it("agrees on random junk", () => {
    const pool = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 -_.中文？";
    for (let attempt = 0; attempt < 500; attempt += 1) {
      const length = attempt % 30;
      let input = "";
      for (let i = 0; i < length; i += 1) {
        input += pool[Math.floor(Math.random() * pool.length)];
      }

      const normalized = server.normalizeLicenseKey(input);
      expect(normalized).toBe(browser.normalizeLicenseKey(input));
      expect(server.splitLicenseKey(normalized)).toEqual(
        browser.splitLicenseKey(normalized),
      );
    }
  });
});

describe("api/license-core stays self-contained", () => {
  it("imports nothing from outside the api directory", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile("api/license-core.ts", "utf8");

    const imports = [...source.matchAll(/^import\s[^;]*?from\s+"([^"]+)";/gm)]
      .map((match) => match[1])
      .filter((specifier) => specifier.startsWith("."));

    expect(imports).toEqual([]);
  });

  it("keeps every api route importing only same-directory files", async () => {
    const { readFile, readdir } = await import("node:fs/promises");
    const files = (await readdir("api")).filter((name) => name.endsWith(".ts"));
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const source = await readFile(`api/${file}`, "utf8");
      const relative = [
        ...source.matchAll(/^import\s[^;]*?from\s+"([^"]+)";/gm),
      ]
        .map((match) => match[1])
        .filter((specifier) => specifier.startsWith("."));

      for (const specifier of relative) {
        // Two things killed production, and both are asserted here.
        //
        // Climbing out of `api/` meant Vercel never emitted the imported
        // module. And this package is `"type": "module"`, so Node resolves
        // these as real ESM specifiers — an extensionless relative import
        // throws ERR_MODULE_NOT_FOUND at startup, which is why the routes
        // died on their first invocation while the build stayed green.
        expect(specifier.startsWith("./")).toBe(true);
        expect(specifier.endsWith(".js")).toBe(true);
      }
    }
  });
});

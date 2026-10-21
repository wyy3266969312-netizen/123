import { describe, expect, it } from "vitest";

import {
  LICENSE_KEY_ALPHABET,
  LICENSE_KEY_LENGTH,
  formatLicenseKey,
  looksLikeLicenseKey,
  normalizeLicenseKey,
  splitLicenseKey,
} from "./licenseKeyFormat";
import {
  issueLicenseKey,
  parseRevokedSerials,
  signSerial,
  verifyLicenseKey,
} from "../api/license-core";

const SECRET = "test-signing-secret";

describe("normalizeLicenseKey", () => {
  it("accepts the display form the buyer is sent", () => {
    const key = issueLicenseKey(SECRET);
    expect(normalizeLicenseKey(key)).toHaveLength(LICENSE_KEY_LENGTH);
  });

  it("survives lowercase, missing dashes, and stray whitespace", () => {
    const key = issueLicenseKey(SECRET);
    const mangled = ` ${key.toLowerCase().replace(/-/g, " ")}\n`;
    expect(normalizeLicenseKey(mangled)).toBe(normalizeLicenseKey(key));
  });

  it("drops the prefix without eating key characters", () => {
    // `S` and `P` are both in the alphabet, so stripping `SOP` character by
    // character would silently corrupt a key that legitimately starts with one.
    const normalized = normalizeLicenseKey("SOP-SPSP-SPSP-SPSP-SPSP-SPSP");
    expect(normalized).toBe("SPSPSPSPSPSPSPSPSPSP");
  });

  it("returns empty for input with nothing usable in it", () => {
    expect(normalizeLicenseKey("——？？")).toBe("");
    expect(normalizeLicenseKey("")).toBe("");
  });
});

describe("formatLicenseKey", () => {
  it("round-trips with normalize", () => {
    const key = issueLicenseKey(SECRET);
    expect(formatLicenseKey(normalizeLicenseKey(key))).toBe(key);
  });

  it("groups the key in fours behind the prefix", () => {
    expect(formatLicenseKey("ABCDEFGHJKMNPQRSTVWX")).toBe(
      "SOP-ABCD-EFGH-JKMN-PQRS-TVWX",
    );
  });
});

describe("issueLicenseKey", () => {
  it("only uses characters that are safe to retype", () => {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const normalized = normalizeLicenseKey(issueLicenseKey(SECRET));
      expect(normalized).toHaveLength(LICENSE_KEY_LENGTH);
      for (const character of normalized) {
        expect(LICENSE_KEY_ALPHABET).toContain(character);
      }
    }
  });

  it("does not repeat itself", () => {
    const keys = new Set(
      Array.from({ length: 200 }, () => issueLicenseKey(SECRET)),
    );
    expect(keys.size).toBe(200);
  });
});

describe("verifyLicenseKey", () => {
  it("accepts a key it just issued, in any of the shapes a buyer may send", () => {
    const key = issueLicenseKey(SECRET);
    const serial = splitLicenseKey(normalizeLicenseKey(key))?.serial;

    for (const variant of [key, key.toLowerCase(), key.replace(/-/g, "")]) {
      expect(verifyLicenseKey(variant, SECRET)).toEqual({
        valid: true,
        serial,
      });
    }
  });

  it("rejects a key issued under a different secret", () => {
    const key = issueLicenseKey("someone-elses-secret");
    expect(verifyLicenseKey(key, SECRET)).toEqual({
      valid: false,
      reason: "signature",
    });
  });

  it("rejects a key with a single character changed", () => {
    const normalized = normalizeLicenseKey(issueLicenseKey(SECRET));
    const swapped =
      normalized[0] === "A"
        ? `B${normalized.slice(1)}`
        : `A${normalized.slice(1)}`;

    expect(verifyLicenseKey(swapped, SECRET)).toEqual({
      valid: false,
      reason: "signature",
    });
  });

  it("rejects anything of the wrong length as malformed", () => {
    for (const bad of ["", "SOP-ABCD", `${issueLicenseKey(SECRET)}AB`]) {
      expect(verifyLicenseKey(bad, SECRET)).toEqual({
        valid: false,
        reason: "malformed",
      });
    }
  });

  it("rejects a revoked serial even though the signature is genuine", () => {
    const key = issueLicenseKey(SECRET);
    const serial = splitLicenseKey(normalizeLicenseKey(key))!.serial;

    expect(verifyLicenseKey(key, SECRET, new Set([serial]))).toEqual({
      valid: false,
      reason: "revoked",
    });
  });

  it("is stable: the same serial always signs to the same signature", () => {
    expect(signSerial("ABCDEFGH", SECRET)).toBe(signSerial("ABCDEFGH", SECRET));
    expect(signSerial("ABCDEFGH", SECRET)).not.toBe(
      signSerial("ABCDEFGJ", SECRET),
    );
  });
});

describe("parseRevokedSerials", () => {
  it("reads a comma or whitespace separated list", () => {
    expect(parseRevokedSerials("ABCDEFGH, JKMNPQRS\nTVWXYZ23")).toEqual(
      new Set(["ABCDEFGH", "JKMNPQRS", "TVWXYZ23"]),
    );
  });

  it("uppercases entries and drops anything the wrong length", () => {
    expect(parseRevokedSerials("abcdefgh,short,")).toEqual(
      new Set(["ABCDEFGH"]),
    );
  });

  it("treats an unset variable as revoking nothing", () => {
    expect(parseRevokedSerials(undefined).size).toBe(0);
    expect(parseRevokedSerials("").size).toBe(0);
  });
});

describe("looksLikeLicenseKey", () => {
  it("gates on length so a typo never costs a round trip", () => {
    expect(
      looksLikeLicenseKey(normalizeLicenseKey(issueLicenseKey(SECRET))),
    ).toBe(true);
    expect(looksLikeLicenseKey("ABCD")).toBe(false);
  });
});

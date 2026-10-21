/**
 * Test-only helpers for the license guard. Not imported by the app or by the
 * serverless functions — every paid endpoint now refuses unlicensed requests,
 * and this is how the tests for those endpoints get past the gate.
 */
import { issueLicenseKey } from "../api/license-core";

export const TEST_LICENSE_SECRET = "test-signing-secret";

/** Point the license guard at a known secret for the duration of a test. */
export function useTestLicenseSecret(
  env: NodeJS.ProcessEnv = process.env,
): void {
  env.LICENSE_SIGNING_SECRET = TEST_LICENSE_SECRET;
}

export function clearTestLicenseSecret(
  env: NodeJS.ProcessEnv = process.env,
): void {
  delete env.LICENSE_SIGNING_SECRET;
  delete env.LICENSE_REVOKED_SERIALS;
}

/** Request headers carrying a key that `TEST_LICENSE_SECRET` will accept. */
export function testLicenseHeaders(): Record<string, string> {
  return { "x-license-key": issueLicenseKey(TEST_LICENSE_SECRET) };
}

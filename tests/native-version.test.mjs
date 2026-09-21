import assert from "node:assert/strict";
import { verifyNativeVersion } from "../scripts/verify-native-version.mjs";

const result = verifyNativeVersion();
assert.equal(result.ok, true, result.errors.join("; "));
assert.equal(result.expected.versionName, "1.5.2");
assert.equal(result.expected.versionCode, 72);

console.log("native-version.test.mjs OK");

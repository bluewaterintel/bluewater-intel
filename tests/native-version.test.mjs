import assert from "node:assert/strict";
import { verifyNativeVersion } from "../scripts/verify-native-version.mjs";

const result = verifyNativeVersion();
assert.equal(result.ok, true, result.errors.join("; "));
assert.equal(result.expected.versionName, "1.5.5");
assert.equal(result.expected.versionCode, 77);
assert.equal(result.expected.androidVersionCode, 75);

console.log("native-version.test.mjs OK");

import assert from "node:assert/strict";
import { verifyNativeVersion } from "../scripts/verify-native-version.mjs";

const result = verifyNativeVersion();
assert.equal(result.ok, true, result.errors.join("; "));
assert.equal(result.expected.versionName, "1.5.7");
assert.equal(result.expected.versionCode, 81);
assert.equal(result.expected.androidVersionCode, 81);

console.log("native-version.test.mjs OK");

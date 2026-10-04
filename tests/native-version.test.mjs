import assert from "node:assert/strict";
import { verifyNativeVersion } from "../scripts/verify-native-version.mjs";

const result = verifyNativeVersion();
assert.equal(result.ok, true, result.errors.join("; "));
assert.equal(result.expected.versionName, "1.6");
assert.equal(result.expected.versionCode, 84);
assert.equal(result.expected.androidVersionCode, 84);

console.log("native-version.test.mjs OK");

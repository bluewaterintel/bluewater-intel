import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const plist = readFileSync("ios/App/App/Info.plist", "utf8");
const appDelegate = readFileSync("ios/App/App/AppDelegate.swift", "utf8");
const sceneDelegate = readFileSync("ios/App/App/SceneDelegate.swift", "utf8");
const pbx = readFileSync("ios/App/App.xcodeproj/project.pbxproj", "utf8");

assert.match(plist, /UIApplicationSceneManifest/);
assert.match(plist, /\$\(PRODUCT_MODULE_NAME\)\.SceneDelegate/);
assert.match(plist, /\$\(MARKETING_VERSION\)/);
assert.match(plist, /\$\(CURRENT_PROJECT_VERSION\)/);
assert.match(appDelegate, /configurationForConnecting/);
assert.match(appDelegate, /SceneDelegate\.self/);
assert.match(sceneDelegate, /CAPBridgeViewController/);
assert.match(sceneDelegate, /ApplicationDelegateProxy\.shared/);
assert.match(pbx, /SceneDelegate\.swift in Sources/);

console.log("ios-scene-lifecycle.test.mjs OK");

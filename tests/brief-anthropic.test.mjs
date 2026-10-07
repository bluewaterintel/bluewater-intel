import assert from "node:assert/strict";
import {
  briefAnthropicRequest,
  isLegacyAdaptiveThinkingModel,
  isSonnet55,
} from "../supabase/functions/_shared/brief-anthropic.ts";

assert.equal(isSonnet55("claude-sonnet-5-5"), true);
assert.equal(isSonnet55("claude-sonnet-5"), false);

assert.equal(isLegacyAdaptiveThinkingModel("claude-sonnet-5-5"), false);
assert.equal(isLegacyAdaptiveThinkingModel("claude-sonnet-5"), true);

const s55 = briefAnthropicRequest("claude-sonnet-5-5");
assert.equal(s55.thinking?.type, "between_tools");
assert.equal(s55.output_config?.effort, "medium");
assert.equal(s55.max_tokens, 4096);

const s5 = briefAnthropicRequest("claude-sonnet-5");
assert.equal(s5.thinking?.type, "disabled");
assert.equal(s5.output_config, undefined);

const haiku = briefAnthropicRequest("claude-haiku-4-5");
assert.equal(haiku.thinking, undefined);
assert.equal(haiku.max_tokens, 2000);

console.log("brief-anthropic.test.mjs OK");

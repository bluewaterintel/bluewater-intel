/** Anthropic Messages API options for the Captain's Brief model. */

export function isSonnet55(model: string): boolean {
  return /sonnet-5-5/i.test(model);
}

/** Sonnet 5 / Opus-class models that accept thinking: { type: "disabled" }. */
export function isLegacyAdaptiveThinkingModel(model: string): boolean {
  if (isSonnet55(model)) return false;
  return /sonnet-5|sonnet-4-6|opus-4-[78]|fable-5|mythos/i.test(model);
}

export type BriefAnthropicRequest = {
  max_tokens: number;
  thinking?: { type: string };
  output_config?: { effort: string };
};

/** Sonnet 5.5 rejects thinking disabled; Sonnet 5 uses disabled for fast briefs. */
export function briefAnthropicRequest(model: string): BriefAnthropicRequest {
  if (isSonnet55(model)) {
    return {
      max_tokens: 4096,
      thinking: { type: "between_tools" },
      output_config: { effort: "medium" },
    };
  }
  const adaptive = isLegacyAdaptiveThinkingModel(model);
  return {
    max_tokens: adaptive ? 4096 : 2000,
    ...(adaptive ? { thinking: { type: "disabled" } } : {}),
  };
}

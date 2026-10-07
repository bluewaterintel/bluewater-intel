/**
 * Shared helpers for RevenueCat PaywallColor Xcode 27 compile fix (SDK < 5.78).
 */

const STRUCT_END =
  /public struct PaywallColor \{([\s\S]*?)\n\}\n\n\/\/ MARK: - Public constructors/;

export function paywallColorStructBody(src) {
  const m = src.match(STRUCT_END);
  return m ? m[1] : null;
}

/** Private designated init must live inside the struct, not only in a private extension. */
export function isPaywallColorXcode27Safe(src) {
  const body = paywallColorStructBody(src);
  return body != null && /private init\(stringRepresentation:/.test(body);
}

export const PAYWALL_COLOR_STRUCT_INSERT_NEEDLE = `    fileprivate var _underlyingColor: (any Sendable)?

}

// MARK: - Public constructors`;

export const PAYWALL_COLOR_STRUCT_INSERT_REPLACEMENT = `    fileprivate var _underlyingColor: (any Sendable)?

    private init(stringRepresentation: String, underlyingColor: (any Sendable)?) {
        self.stringRepresentation = stringRepresentation
        self._underlyingColor = underlyingColor
    }
}

// MARK: - Public constructors`;

/** Remove duplicate designated init left under "Private constructors" (5.51.x). */
export function removeExtensionDesignatedInit(src) {
  return src.replace(
    /(\/\/ MARK: - Private constructors\n\nprivate extension PaywallColor \{[\s\S]*?)    (?:\/\/\/ "Designated" initializer\n    )?private init\(stringRepresentation: String, underlyingColor: \(any Sendable\)\?\) \{\n        self\.stringRepresentation = stringRepresentation\n        self\._underlyingColor = underlyingColor\n    \}\n\n/,
    "$1",
  );
}

export function patchPaywallColorSource(src) {
  if (isPaywallColorXcode27Safe(src)) {
    return { src, changed: false };
  }
  if (!src.includes(PAYWALL_COLOR_STRUCT_INSERT_NEEDLE)) {
    return { error: "unexpected PaywallColor.swift layout — update patch script" };
  }
  let next = src.replace(PAYWALL_COLOR_STRUCT_INSERT_NEEDLE, PAYWALL_COLOR_STRUCT_INSERT_REPLACEMENT);
  next = removeExtensionDesignatedInit(next);
  if (!isPaywallColorXcode27Safe(next)) {
    return { error: "patch did not produce Xcode-27-safe PaywallColor.swift" };
  }
  const leftover = next.match(/private init\(stringRepresentation: String, underlyingColor:/g) ?? [];
  if (leftover.length !== 1) {
    return { error: `expected one designated init, found ${leftover.length}` };
  }
  return { src: next, changed: true };
}

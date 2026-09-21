# frozen_string_literal: true

# Xcode 27 + RevenueCat < 5.78: PaywallColor.swift fails with
#   invalid redeclaration of synthesized memberwise 'init(stringRepresentation:)'
# Move the private designated init into the struct body (purchases-ios ≥ 5.78).
#
# Used by:
#   - Podfile post_install (every `pod install`)
#   - RevenueCat Xcode run-script phase (every simulator/device build)
#   - CLI: ruby ios/App/patch_revenuecat_paywall_color.rb [path]

NEEDLE = <<~SWIFT.chomp
    fileprivate var _underlyingColor: (any Sendable)?

}

// MARK: - Public constructors
SWIFT

REPLACEMENT = <<~SWIFT.chomp
    fileprivate var _underlyingColor: (any Sendable)?

    private init(stringRepresentation: String, underlyingColor: (any Sendable)?) {
        self.stringRepresentation = stringRepresentation
        self._underlyingColor = underlyingColor
    }
}

// MARK: - Public constructors
SWIFT

# Same pattern as scripts/revenuecat-paywall-color-xcode27.mjs (do not use /x — # comments break it).
EXTENSION_INIT = /(\/\/ MARK: - Private constructors\n\nprivate extension PaywallColor \{[\s\S]*?)    (?:\/\/\/ "Designated" initializer\n    )?private init\(stringRepresentation: String, underlyingColor: \(any Sendable\)\?\) \{\n        self\.stringRepresentation = stringRepresentation\n        self\._underlyingColor = underlyingColor\n    \}\n\n/

STRUCT_BODY = /public struct PaywallColor \{([\s\S]*?)\n\}\n\n\/\/ MARK: - Public constructors/

def paywall_color_xcode27_safe?(src)
  m = src.match(STRUCT_BODY)
  m && m[1] =~ /private init\(stringRepresentation:/
end

def patch_paywall_color_source(src)
  return [src, false] if paywall_color_xcode27_safe?(src)
  raise 'unexpected PaywallColor.swift layout — update patch_revenuecat_paywall_color.rb' unless src.include?(NEEDLE)

  next_src = src.sub(NEEDLE, REPLACEMENT)
  next_src = next_src.sub(EXTENSION_INIT, '\1')
  unless paywall_color_xcode27_safe?(next_src)
    raise 'patch did not produce Xcode-27-safe PaywallColor.swift'
  end
  leftover = next_src.scan(/private init\(stringRepresentation: String, underlyingColor:/).length
  raise "expected one designated init, found #{leftover}" unless leftover == 1
  [next_src, true]
end

def default_paywall_color_path
  File.expand_path('Pods/RevenueCat/Sources/Paywalls/PaywallColor.swift', __dir__)
end

def patch_paywall_color_file!(path)
  unless File.exist?(path)
    warn "patch_revenuecat_paywall_color: skip (missing #{path})"
    return false
  end
  src = File.read(path)
  patched, changed = patch_paywall_color_source(src)
  if changed
    File.write(path, patched)
    puts "patch_revenuecat_paywall_color: patched #{path}"
  else
    puts 'patch_revenuecat_paywall_color: OK (PaywallColor already Xcode-27-safe)'
  end
  changed
end

def patch_revenuecat_paywall_color_pod!(installer)
  path = File.join(installer.sandbox.root.to_s, 'RevenueCat/Sources/Paywalls/PaywallColor.swift')
  patch_paywall_color_file!(path)
end

def add_revenuecat_paywall_color_build_phase!(installer)
  target = installer.pods_project.targets.find { |t| t.name == 'RevenueCat' }
  return unless target

  name = '[BWI] Patch PaywallColor Xcode 27'
  existing = target.shell_script_build_phases.find { |p| p.name == name }
  phase = existing || target.new_shell_script_build_phase(name)
  phase.shell_path = '/bin/sh'
  phase.always_out_of_date = '1'
  phase.shell_script = <<~'SCRIPT'
    set -e
    /usr/bin/ruby "${PODS_ROOT}/../patch_revenuecat_paywall_color.rb"
  SCRIPT

  # Compile Sources must see the patched file.
  phases = target.build_phases
  phases.delete(phase)
  phases.insert(0, phase)
end

if $PROGRAM_NAME == __FILE__
  path = ARGV[0] || default_paywall_color_path
  patch_paywall_color_file!(path)
end

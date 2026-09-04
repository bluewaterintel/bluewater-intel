import AppKit
import Foundation

func sampleCorner(path: String) {
  // Raw PNG bytes via Data, not NSColor. colorAt() color-manages #0D9488 into
  // #00A39A, and Pixel then paints a second, lighter teal around that mismatch.
  guard let data = try? Data(contentsOf: URL(fileURLWithPath: path)),
        let rep = NSBitmapImageRep(data: data),
        let px = rep.bitmapData else {
    fputs("could not sample \(path)\n", stderr)
    exit(1)
  }
  let ri = Int(px[0])
  let gi = Int(px[1])
  let bi = Int(px[2])
  print(String(format: "#%02X%02X%02X %d %d %d", ri, gi, bi, ri, gi, bi))
}

if CommandLine.arguments.count >= 3, CommandLine.arguments[1] == "--sample" {
  sampleCorner(path: CommandLine.arguments[2])
  exit(0)
}

if CommandLine.arguments.count >= 7, CommandLine.arguments[1] == "--punch" {
  // --punch SRC DEST R G B [threshold]
  let srcPath = CommandLine.arguments[2]
  let destPath = CommandLine.arguments[3]
  guard let tr = Int(CommandLine.arguments[4]),
        let tg = Int(CommandLine.arguments[5]),
        let tb = Int(CommandLine.arguments[6]) else {
    fputs("invalid punch RGB\n", stderr)
    exit(1)
  }
  let threshold = CommandLine.arguments.count >= 8 ? (Int(CommandLine.arguments[7]) ?? 48) : 48
  punchTeal(srcPath: srcPath, destPath: destPath, tr: tr, tg: tg, tb: tb, threshold: threshold)
  exit(0)
}

if CommandLine.arguments.count >= 5, CommandLine.arguments[1] == "--inset" {
  // --inset SRC DEST FRACTION
  // Draw SRC centered on a same-size transparent canvas at FRACTION scale
  // (0.56 keeps a long-billed marlin inside Pixel's circular mask).
  let srcPath = CommandLine.arguments[2]
  let destPath = CommandLine.arguments[3]
  guard let fraction = Double(CommandLine.arguments[4]) else {
    fputs("invalid inset fraction\n", stderr)
    exit(1)
  }
  insetTransparent(srcPath: srcPath, destPath: destPath, fraction: fraction)
  exit(0)
}

func punchTeal(srcPath: String, destPath: String, tr: Int, tg: Int, tb: Int, threshold: Int) {
  guard let img = NSImage(contentsOfFile: srcPath) else {
    fputs("could not read \(srcPath)\n", stderr)
    exit(1)
  }
  let pixelRep = img.representations.compactMap { $0 as? NSBitmapImageRep }.first
  let w = pixelRep?.pixelsWide ?? Int(round(img.size.width))
  let h = pixelRep?.pixelsHigh ?? Int(round(img.size.height))
  guard let outRep = NSBitmapImageRep(
    bitmapDataPlanes: nil,
    pixelsWide: w,
    pixelsHigh: h,
    bitsPerSample: 8,
    samplesPerPixel: 4,
    hasAlpha: true,
    isPlanar: false,
    colorSpaceName: .calibratedRGB,
    bytesPerRow: w * 4,
    bitsPerPixel: 32
  ), let pixels = outRep.bitmapData else {
    fputs("could not allocate bitmap\n", stderr)
    exit(1)
  }
  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: outRep)
  img.draw(
    in: NSRect(x: 0, y: 0, width: w, height: h),
    from: .zero,
    operation: .copy,
    fraction: 1,
    respectFlipped: false,
    hints: [.interpolation: NSImageInterpolation.none]
  )
  NSGraphicsContext.restoreGraphicsState()

  // Match this bitmap's own corner, not the sRGB sample. Drawing into
  // calibratedRGB shifts #00A39A, so the CLI RGB would punch nothing.
  let pr = Int(pixels[0])
  let pg = Int(pixels[1])
  let pb = Int(pixels[2])
  if pr == 0 && pg == 0 && pb == 0 && Int(pixels[3]) == 0 {
    fputs("punch source drew as empty/transparent\n", stderr)
    exit(1)
  }

  let count = w * h * 4
  var opaque = 0
  for i in stride(from: 0, to: count, by: 4) {
    let r = Int(pixels[i])
    let g = Int(pixels[i + 1])
    let b = Int(pixels[i + 2])
    if abs(r - pr) + abs(g - pg) + abs(b - pb) <= threshold {
      pixels[i] = 0
      pixels[i + 1] = 0
      pixels[i + 2] = 0
      pixels[i + 3] = 0
    } else {
      pixels[i + 3] = 255
      opaque += 1
    }
  }
  if opaque == 0 {
    fputs("punch produced an empty image (source did not draw)\n", stderr)
    exit(1)
  }

  writePng(outRep, to: destPath)
}

func insetTransparent(srcPath: String, destPath: String, fraction: Double) {
  guard let img = NSImage(contentsOfFile: srcPath) else {
    fputs("could not read \(srcPath)\n", stderr)
    exit(1)
  }
  let pixelRep = img.representations.compactMap { $0 as? NSBitmapImageRep }.first
  let w = pixelRep?.pixelsWide ?? Int(round(img.size.width))
  let h = pixelRep?.pixelsHigh ?? Int(round(img.size.height))
  let scale = min(1, max(0.2, fraction))
  guard let outRep = NSBitmapImageRep(
    bitmapDataPlanes: nil,
    pixelsWide: w,
    pixelsHigh: h,
    bitsPerSample: 8,
    samplesPerPixel: 4,
    hasAlpha: true,
    isPlanar: false,
    colorSpaceName: .calibratedRGB,
    bytesPerRow: w * 4,
    bitsPerPixel: 32
  ) else {
    fputs("could not allocate inset bitmap\n", stderr)
    exit(1)
  }
  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: outRep)
  NSColor.clear.setFill()
  NSRect(x: 0, y: 0, width: w, height: h).fill()
  let artW = Double(w) * scale
  let artH = Double(h) * scale
  img.draw(
    in: NSRect(x: (Double(w) - artW) / 2, y: (Double(h) - artH) / 2, width: artW, height: artH),
    from: .zero,
    operation: .sourceOver,
    fraction: 1,
    respectFlipped: false,
    hints: [.interpolation: NSImageInterpolation.high]
  )
  NSGraphicsContext.restoreGraphicsState()
  writePng(outRep, to: destPath)
}

func writePng(_ rep: NSBitmapImageRep, to destPath: String) {
  guard let png = rep.representation(using: .png, properties: [:]) else {
    fputs("could not encode punched PNG\n", stderr)
    exit(1)
  }
  do {
    try png.write(to: URL(fileURLWithPath: destPath))
  } catch {
    fputs("could not write \(destPath): \(error)\n", stderr)
    exit(1)
  }
}

guard CommandLine.arguments.count >= 8 else {
  fputs("usage: android-pad-icon.swift SRC DEST CANVAS ART R G B\n", stderr)
  fputs("   or: android-pad-icon.swift --sample SRC\n", stderr)
  exit(1)
}

let srcPath = CommandLine.arguments[1]
let destPath = CommandLine.arguments[2]
guard let canvas = Double(CommandLine.arguments[3]),
      let art = Double(CommandLine.arguments[4]),
      let r = Double(CommandLine.arguments[5]),
      let g = Double(CommandLine.arguments[6]),
      let b = Double(CommandLine.arguments[7]) else {
  fputs("invalid numeric arguments\n", stderr)
  exit(1)
}

guard let src = NSImage(contentsOfFile: srcPath) else {
  fputs("could not read \(srcPath)\n", stderr)
  exit(1)
}

let canvasSize = NSSize(width: canvas, height: canvas)
let out = NSImage(size: canvasSize)
out.lockFocus()
NSColor(red: r / 255, green: g / 255, blue: b / 255, alpha: 1).setFill()
NSRect(origin: .zero, size: canvasSize).fill()
let origin = (canvas - art) / 2
src.draw(
  in: NSRect(x: origin, y: origin, width: art, height: art),
  from: .zero,
  operation: .copy,
  fraction: 1
)
out.unlockFocus()

guard let tiff = out.tiffRepresentation,
      let rep = NSBitmapImageRep(data: tiff),
      let png = rep.representation(using: .png, properties: [:]) else {
  fputs("could not encode PNG\n", stderr)
  exit(1)
}

do {
  try png.write(to: URL(fileURLWithPath: destPath))
} catch {
  fputs("could not write \(destPath): \(error)\n", stderr)
  exit(1)
}

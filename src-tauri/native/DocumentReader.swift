// Adapted with author permission from Andre-HUANG/polyu-study-console, MacApp/DocumentReader.swift.
import Foundation
import AppKit
import PDFKit
import Vision
import ImageIO

// Reads documents; it does not execute embedded scripts, macros or links.
func orderedRows(_ blocks: [(String, CGRect)]) -> [String] {
    let sorted = blocks.sorted { $0.1.midY > $1.1.midY }
    var rows: [String] = []
    var parts: [(String, CGRect)] = []
    func commit() {
        if !parts.isEmpty {
            rows.append(parts.sorted { $0.1.minX < $1.1.minX }.map { $0.0 }.joined(separator: "\t"))
        }
    }
    for block in sorted {
        if let last = parts.first, abs(block.1.midY - last.1.midY) > max(3, min(block.1.height, last.1.height) * 0.35) {
            commit(); parts = []
        }
        parts.append(block)
    }
    commit()
    return rows
}

func recognize(_ image: CGImage) throws -> ([String], [Float]) {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = false
    let supported = try request.supportedRecognitionLanguages()
    request.recognitionLanguages = ["en-US", "zh-Hans", "zh-Hant"].filter { supported.contains($0) }
    try VNImageRequestHandler(cgImage: image).perform([request])
    let observations = request.results ?? []
    let blocks: [(String, CGRect, Float)] = observations.compactMap {
        guard let candidate = $0.topCandidates(1).first else { return nil }
        let box = $0.boundingBox
        return (candidate.string, CGRect(x: box.minX * 1000, y: box.minY * 1000,
                                         width: box.width * 1000, height: box.height * 1000), candidate.confidence)
    }
    var rows: [String] = [], scores: [Float] = []
    var parts: [(String, CGRect, Float)] = []
    func commit() {
        guard !parts.isEmpty else { return }
        rows.append(parts.sorted { $0.1.minX < $1.1.minX }.map { $0.0 }.joined(separator: "\t"))
        let total = parts.reduce(0) { $0 + max(1, $1.0.count) }
        scores.append(parts.reduce(Float(0)) { $0 + $1.2 * Float(max(1, $1.0.count)) } / Float(total))
    }
    for block in blocks.sorted(by: { $0.1.midY > $1.1.midY }) {
        if let last = parts.first, abs(block.1.midY - last.1.midY) > max(3, min(block.1.height, last.1.height) * 0.35) {
            commit(); parts = []
        }
        parts.append(block)
    }
    commit()
    return (rows, scores)
}

func pdfPages(_ path: String, textOnly: Bool) throws -> [[String: Any]] {
    guard let document = PDFDocument(url: URL(fileURLWithPath: path)), !document.isLocked else {
        throw NSError(domain: "DocumentReader", code: 1, userInfo: [NSLocalizedDescriptionKey: "PDF 无法打开或受密码保护"])
    }
    var pages: [[String: Any]] = []
    for index in 0..<document.pageCount {
        autoreleasepool {
            guard let page = document.page(at: index) else {
                pages.append(["page": index + 1, "text": "", "rows": [], "readable": false]); return
            }
            let text = page.string ?? ""
            let bounds = page.bounds(for: .mediaBox)
            let blocks = (page.selection(for: bounds)?.selectionsByLine() ?? []).compactMap { selection -> (String, CGRect)? in
                guard let string = selection.string?.trimmingCharacters(in: .whitespacesAndNewlines), !string.isEmpty else { return nil }
                return (string.replacingOccurrences(of: "\n", with: " "), selection.bounds(for: page))
            }
            let rows = orderedRows(blocks)
            var result: [String: Any] = ["page": index + 1, "text": text, "rows": rows, "method": "PDF 文字与版面", "readable": !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, "lowConfidence": false, "processed": true, "textOnly": textOnly]
            // OCR every page, including screenshots embedded beside normal text.
            if !textOnly { do {
                let scale = min(3, 2000 / max(bounds.width, bounds.height))
                let image = page.thumbnail(of: NSSize(width: bounds.width * scale, height: bounds.height * scale), for: .mediaBox)
                if let cg = image.cgImage(forProposedRect: nil, context: nil, hints: nil) {
                    let recognized = try recognize(cg)
                    result["ocrRows"] = recognized.0
                    result["ocrRowConfidences"] = recognized.1
                    result["ocrLowConfidence"] = !recognized.1.isEmpty && recognized.1.allSatisfy { $0 < 0.75 }
                    result["method"] = text.isEmpty ? "扫描页 OCR" : "PDF 文字、版面与 OCR"
                    if !recognized.0.isEmpty { result["readable"] = true }
                } else {
                    result["issues"] = ["本页图片无法渲染，应用将在下次同步重试"]
                }
            } catch { result["issues"] = ["本页图片文字识别未完成，应用将在下次同步重试"] } }
            let notes = page.annotations.compactMap { $0.contents }.filter { !$0.isEmpty }
            result["annotations"] = notes
            result["links"] = page.annotations.compactMap { $0.url?.absoluteString }
            pages.append(result)
        }
    }
    return pages
}

do {
    let request = try JSONSerialization.jsonObject(with: FileHandle.standardInput.readDataToEndOfFile()) as? [String: Any]
    guard request?["version"] as? Int == 1, let path = request?["path"] as? String else { throw NSError(domain: "DocumentReader", code: 2) }
    let textOnly = request?["textOnly"] as? Bool ?? false
    let suffix = URL(fileURLWithPath: path).pathExtension.lowercased()
    let pages: [[String: Any]]
    if suffix == "pdf" { pages = try pdfPages(path, textOnly: textOnly) }
    else {
        guard let source = CGImageSourceCreateWithURL(URL(fileURLWithPath: path) as CFURL, nil) else {
            throw NSError(domain: "DocumentReader", code: 3, userInfo: [NSLocalizedDescriptionKey: "图片格式无法读取"])
        }
        var images: [[String: Any]] = []
        for frame in 0..<CGImageSourceGetCount(source) {
            guard let cg = CGImageSourceCreateImageAtIndex(source, frame, nil) else { continue }
            let recognized = try recognize(cg)
            images.append(["page": frame + 1, "text": recognized.0.joined(separator: "\n"), "rows": recognized.0,
                           "rowConfidences": recognized.1, "method": "图片 OCR", "lowConfidence": !recognized.1.isEmpty && recognized.1.allSatisfy { $0 < 0.75 }, "readable": !recognized.0.isEmpty, "processed": true])
        }
        pages = images
    }
    let data = try JSONSerialization.data(withJSONObject: ["version": 1, "pages": pages], options: [.sortedKeys])
    FileHandle.standardOutput.write(data)
} catch {
    let data = try! JSONSerialization.data(withJSONObject: ["version": 1, "error": error.localizedDescription])
    FileHandle.standardOutput.write(data)
    exit(1)
}

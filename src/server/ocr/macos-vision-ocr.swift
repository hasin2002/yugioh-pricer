import Foundation
import Vision

struct OcrJob: Decodable {
    let images: [String]
}

struct OcrBox: Encodable {
    let left: Double
    let top: Double
    let width: Double
    let height: Double
}

struct OcrObservation: Encodable {
    let text: String
    let confidence: Double
    let boundingBox: OcrBox
}

struct OcrImageOutput: Encodable {
    let path: String
    let observations: [OcrObservation]
}

struct OcrOutput: Encodable {
    let images: [OcrImageOutput]
}

if CommandLine.arguments.contains("--health-check") {
    print("{\"ok\":true}")
    exit(0)
}

guard CommandLine.arguments.count >= 2 else {
    fputs("Usage: macos-vision-ocr <job.json>\n", stderr)
    exit(64)
}

let jobURL = URL(fileURLWithPath: CommandLine.arguments[1])
let job = try JSONDecoder().decode(OcrJob.self, from: Data(contentsOf: jobURL))
var outputs: [OcrImageOutput] = []

for imagePath in job.images {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = false
    request.recognitionLanguages = ["en-US"]
    request.minimumTextHeight = 0.0

    let handler = VNImageRequestHandler(
        url: URL(fileURLWithPath: imagePath),
        options: [:]
    )

    do {
        try handler.perform([request])
        let observations = (request.results ?? []).compactMap { observation -> OcrObservation? in
            guard let candidate = observation.topCandidates(1).first else {
                return nil
            }

            let box = observation.boundingBox

            return OcrObservation(
                text: candidate.string,
                confidence: Double(candidate.confidence) * 100.0,
                boundingBox: OcrBox(
                    left: box.minX,
                    top: box.minY,
                    width: box.width,
                    height: box.height
                )
            )
        }

        outputs.append(OcrImageOutput(path: imagePath, observations: observations))
    } catch {
        outputs.append(OcrImageOutput(path: imagePath, observations: []))
    }
}

let outputData = try JSONEncoder().encode(OcrOutput(images: outputs))
FileHandle.standardOutput.write(outputData)

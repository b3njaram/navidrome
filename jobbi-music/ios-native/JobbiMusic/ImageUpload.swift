import SwiftUI
import PhotosUI
import ImageIO
import UIKit

enum PhotoPreparation {
    static let maxBytes = 1_048_576

    /// Decode only a thumbnail to keep memory bounded for 12–48 MP photos.
    static func jpeg(_ bytes: Data) throws -> Data {
        guard bytes.count >= 16, bytes.count <= 40 * 1024 * 1024,
              let source = CGImageSourceCreateWithData(bytes as CFData, nil),
              let thumbnail = CGImageSourceCreateThumbnailAtIndex(source, 0, [
                kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceCreateThumbnailWithTransform: true,
                kCGImageSourceThumbnailMaxPixelSize: 1400
              ] as CFDictionary) else {
            throw JobbiError.server("Cannot decode this picture. Choose a supported photo under 40 MB.")
        }
        var image = UIImage(cgImage: thumbnail)
        for _ in 0..<7 {
            for quality in [0.88, 0.76, 0.62, 0.49, 0.38] {
                if let jpeg = image.jpegData(compressionQuality: quality),
                   jpeg.count >= 16 && jpeg.count <= maxBytes { return jpeg }
            }
            let smaller = CGSize(width: max(1, image.size.width * 0.75),
                                 height: max(1, image.size.height * 0.75))
            let renderer = UIGraphicsImageRenderer(size: smaller)
            image = renderer.image { _ in
                image.draw(in: CGRect(origin: .zero, size: smaller))
            }
        }
        throw JobbiError.server("Unable to compress the selected photo below 1 MB.")
    }
}

struct PhotoUploadButton: View {
    @EnvironmentObject private var api: JobbiAPI
    let path: String
    let title: String
    var finished: () async -> Void = {}
    @State private var selection: PhotosPickerItem?
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        PhotosPicker(selection: $selection, matching: .images) {
            Label(busy ? "Uploading…" : title,
                  systemImage: busy ? "hourglass" : "photo.badge.plus")
        }
        .disabled(busy)
        .onChange(of: selection) { _, current in
            guard let current else { return }
            Task {
                busy = true
                defer {
                    busy = false
                    selection = nil
                }
                do {
                    guard let raw = try await current.loadTransferable(type: Data.self) else {
                        throw JobbiError.server("Could not read the photo selected.")
                    }
                    let jpeg = try PhotoPreparation.jpeg(raw)
                    try await api.imageUpload(path, jpeg: jpeg)
                    await finished()
                    error = nil
                } catch { self.error = error.localizedDescription }
            }
        }
        .alert("Picture upload", isPresented: Binding(
            get: { error != nil },
            set: { if !$0 { error = nil } }
        )) {
            Button("OK") { error = nil }
        } message: { Text(error ?? "") }
    }
}

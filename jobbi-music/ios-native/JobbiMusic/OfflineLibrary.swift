import Foundation
import Combine
import CryptoKit

@MainActor
final class OfflineLibrary: ObservableObject {
    @Published private(set) var songs: [Song] = []
    @Published private(set) var downloading: Set<String> = []
    @Published var lastError: String?
    private var directory: URL?

    func configure(server: String, username: String) {
        let key = SHA256.hash(data: Data((server.lowercased() + "/" + username.lowercased()).utf8))
            .map { String(format: "%02x", $0) }.joined()
        guard let folder = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else { return }
        directory = folder.appendingPathComponent("OfflineMusic", isDirectory: true)
            .appendingPathComponent(key, isDirectory: true)
        if let directory { try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true) }
        refresh()
    }

    private var indexURL: URL? { directory?.appendingPathComponent("index.json") }

    func localURL(for song: Song) -> URL? {
        guard let directory, songs.contains(where: { $0.id == song.id }) else { return nil }
        let key = SHA256.hash(data: Data(song.id.utf8)).map { String(format: "%02x", $0) }.joined()
        let url = directory.appendingPathComponent(key + ".audio")
        return FileManager.default.fileExists(atPath: url.path) ? url : nil
    }

    func refresh() {
        guard let indexURL, let data = try? Data(contentsOf: indexURL),
              let parsed = try? JSONDecoder().decode([Song].self, from: data) else {
            songs = []
            return
        }
        songs = parsed
    }

    private func saveIndex() throws {
        guard let indexURL else { throw JobbiError.notSignedIn }
        try JSONEncoder().encode(songs).write(to: indexURL, options: .atomic)
    }

    func download(_ song: Song, api: JobbiAPI) async {
        guard !song.id.isEmpty, localURL(for: song) == nil else { return }
        downloading.insert(song.id)
        defer { downloading.remove(song.id) }
        do {
            guard let directory else { throw JobbiError.notSignedIn }
            let temp = try await api.download("/api/download/song/" + JobbiAPI.encode(song.id))
            defer { try? FileManager.default.removeItem(at: temp) }
            let key = SHA256.hash(data: Data(song.id.utf8))
                .map { String(format: "%02x", $0) }.joined()
            let final = directory.appendingPathComponent(key + ".audio")
            // A received HTML error page is never considered playable audio.
            let length = (try? FileManager.default.attributesOfItem(atPath: temp.path)[.size] as? Int64) ?? 0
            guard length > 128 else { throw JobbiError.server("Downloaded file is empty or invalid.") }
            if FileManager.default.fileExists(atPath: final.path) {
                try FileManager.default.removeItem(at: final)
            }
            try FileManager.default.moveItem(at: temp, to: final)
            songs.removeAll(where: { $0.id == song.id })
            songs.append(song)
            try saveIndex()
        } catch {
            lastError = "\(song.title): \(error.localizedDescription)"
        }
    }

    func downloadAll(_ tracks: [Song], api: JobbiAPI) async {
        for track in tracks {
            if Task.isCancelled { return }
            await download(track, api: api)
        }
    }

    func remove(_ song: Song) {
        if let url = localURL(for: song) { try? FileManager.default.removeItem(at: url) }
        songs.removeAll(where: { $0.id == song.id })
        do { try saveIndex() }
        catch { lastError = error.localizedDescription }
    }
}

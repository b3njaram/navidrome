import Foundation
import Combine
import CryptoKit

/// Offline originals are private to the Navidrome user/server, with their real
/// audio extension preserved so AVFoundation can recognize the container.
@MainActor
final class OfflineLibrary: ObservableObject {
    @Published private(set) var songs: [Song] = []
    /// Per-device origins prevent removing a song still needed by another download.
    @Published private(set) var sources: [String: [String]] = [:]
    @Published private(set) var downloading: Set<String> = []
    @Published private(set) var batchLabel = ""
    @Published private(set) var batchDone = 0
    @Published private(set) var batchTotal = 0
    @Published private(set) var batchFailed = 0
    @Published var lastError: String?
    private var directory: URL?

    var isBatchDownloading: Bool { batchTotal > 0 && batchDone < batchTotal }

    func configure(server: String, username: String) {
        let key = Self.hash(server.lowercased() + "/" + username.lowercased())
        guard let base = FileManager.default.urls(for: .applicationSupportDirectory,
            in: .userDomainMask).first else {
            lastError = "iOS storage is unavailable."
            return
        }
        directory = base.appendingPathComponent("OfflineMusic", isDirectory: true)
            .appendingPathComponent(key, isDirectory: true)
        if let directory {
            do {
                try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
                var properties = URLResourceValues()
                properties.isExcludedFromBackup = true
                var folder = directory
                try folder.setResourceValues(properties)
            } catch { lastError = "Cannot prepare offline folder: \(error.localizedDescription)" }
        }
        refresh()
    }

    private static func hash(_ text: String) -> String {
        SHA256.hash(data: Data(text.utf8)).map { String(format: "%02x", $0) }.joined()
    }

    /// Old .audio recordings remain discoverable for listeners upgrading the app.
    static let supportedExtensions: Set<String> =
        ["flac", "mp3", "m4a", "aac", "ogg", "opus", "wav", "aiff", "aif", "alac", "audio"]

    private var indexURL: URL? { directory?.appendingPathComponent("index.json") }
    private var sourcesURL: URL? { directory?.appendingPathComponent("download-sources.json") }

    func hasPlaylistDownloads(_ id: String) -> Bool {
        !(sources["playlist:" + id] ?? []).isEmpty
    }

    private func remember(_ source: String, ids: [String]) throws {
        guard !ids.isEmpty else { return }
        var updated = sources
        updated[source] = Array(Set((updated[source] ?? []) + ids)).sorted()
        try saveSources(updated)
    }

    private func saveSources(_ updated: [String: [String]]) throws {
        guard let url = sourcesURL else { throw JobbiError.notSignedIn }
        try JSONEncoder().encode(updated).write(to: url, options: .atomic)
        sources = updated
    }

    func localURL(for song: Song) -> URL? {
        guard let directory, songs.contains(where: { $0.id == song.id }) else { return nil }
        let prefix = Self.hash(song.id)
        let suffix = (song.suffix ?? "").lowercased()
        let first = Self.supportedExtensions.contains(suffix) ? [suffix] : []
        let extensions = first + Self.supportedExtensions.sorted().filter { !first.contains($0) }
        for ext in extensions {
            let candidate = directory.appendingPathComponent(prefix + "." + ext)
            if FileManager.default.fileExists(atPath: candidate.path) { return candidate }
        }
        return nil
    }

    func refresh() {
        if let url = indexURL, let data = try? Data(contentsOf: url) {
            songs = (try? JSONDecoder().decode([Song].self, from: data)) ?? []
        } else {
            songs = []
        }
        if let url = sourcesURL, let data = try? Data(contentsOf: url) {
            sources = (try? JSONDecoder().decode([String: [String]].self, from: data)) ?? [:]
        } else {
            sources = [:]
        }
    }

    private func saveIndex() throws {
        guard let indexURL else { throw JobbiError.notSignedIn }
        try JSONEncoder().encode(songs).write(to: indexURL, options: .atomic)
    }

    /// Detect common genuine audio headers instead of caching a login page or
    /// an HTTP error response as a successful "song".
    static func audioExtension(header: Data, declared: String?) -> String? {
        let b = [UInt8](header)
        let text = String(decoding: b, as: UTF8.self)
        if text.hasPrefix("fLaC") { return "flac" }
        if text.hasPrefix("OggS") { return "ogg" }
        if text.hasPrefix("ID3") { return "mp3" }
        if b.count >= 2 && b[0] == 0xFF && (b[1] & 0xE0) == 0xE0 {
            let ext = (declared ?? "").lowercased()
            return ext == "aac" ? "aac" : "mp3"
        }
        if b.count >= 12 && text.hasPrefix("RIFF") && text.contains("WAVE") { return "wav" }
        if b.count >= 12 && text.hasPrefix("FORM") { return "aiff" }
        if b.count >= 12 && text.dropFirst(4).hasPrefix("ftyp") { return "m4a" }
        let ext = (declared ?? "").lowercased()
        if ["flac","mp3","m4a","aac","ogg","opus","wav","aiff","aif","alac"].contains(ext),
           b.count >= 12 && !text.lowercased().contains("<html") &&
           !text.lowercased().contains("{\"error\"") {
            return ext
        }
        return nil
    }

    private func attempt(_ song: Song, api: JobbiAPI) async -> Bool {
        guard !song.id.isEmpty else { lastError = "Cannot download a song without an ID."; return false }
        if localURL(for: song) != nil { return true }
        if downloading.contains(song.id) { return true }
        downloading.insert(song.id)
        defer { downloading.remove(song.id) }
        do {
            guard let directory else { throw JobbiError.notSignedIn }
            let temp = try await api.download("/api/download/song/" + JobbiAPI.encode(song.id))
            defer { try? FileManager.default.removeItem(at: temp) }
            let size = try FileManager.default.attributesOfItem(atPath: temp.path)[.size]
            let byteCount = (size as? NSNumber)?.int64Value ?? 0
            guard byteCount > 128 else {
                throw JobbiError.server("Downloaded audio was empty (\(byteCount) bytes).")
            }
            let handle = try FileHandle(forReadingFrom: temp)
            let header = try handle.read(upToCount: 32) ?? Data()
            try handle.close()
            guard let ext = Self.audioExtension(header: header, declared: song.suffix) else {
                throw JobbiError.server("Server did not return a recognizable audio recording.")
            }
            let final = directory.appendingPathComponent(Self.hash(song.id) + "." + ext)
            if FileManager.default.fileExists(atPath: final.path) {
                try FileManager.default.removeItem(at: final)
            }
            try FileManager.default.moveItem(at: temp, to: final)
            songs.removeAll(where: { $0.id == song.id })
            songs.append(song)
            try saveIndex()
            return true
        } catch {
            lastError = "\(song.title): \(error.localizedDescription)"
            return false
        }
    }

    func download(_ song: Song, api: JobbiAPI) async {
        if await attempt(song, api: api) {
            do {
                try remember("single:" + song.id, ids: [song.id])
                batchLabel = "Saved \(song.title) for offline playback."
            } catch { lastError = "Could not remember this download: \(error.localizedDescription)" }
        }
    }

    func downloadAll(_ tracks: [Song], api: JobbiAPI, source: String? = nil) async {
        guard !isBatchDownloading else { return }
        let unique = tracks.reduce(into: [Song]()) { items, song in
            if !items.contains(where: { $0.id == song.id }) { items.append(song) }
        }
        batchTotal = unique.count
        batchDone = 0
        batchFailed = 0
        batchLabel = "Preparing \(unique.count) songs…"
        lastError = nil
        for track in unique {
            if Task.isCancelled { break }
            let success = await attempt(track, api: api)
            batchDone += 1
            if !success { batchFailed += 1 }
            batchLabel = "Saving offline: \(batchDone)/\(batchTotal), \(batchFailed) failed"
        }
        if let source {
            do {
                try remember(source, ids: unique.filter { localURL(for: $0) != nil }.map(\.id))
            } catch { lastError = "Could not remember this collection: \(error.localizedDescription)" }
        }
        batchLabel = "Finished: \(batchDone - batchFailed) saved or already offline, \(batchFailed) failed."
    }

    func downloadAllPlaylists(_ playlists: [MusicPlaylist], api: JobbiAPI) async {
        guard !isBatchDownloading else { return }
        batchLabel = "Collecting tracks from \(playlists.count) playlists…"
        lastError = nil
        var all = [Song]()
        var collections = [(String, [Song])]()
        var failedCollections = 0
        for playlist in playlists {
            if Task.isCancelled { return }
            do {
                let collection: CollectionDetail = try await api.get(
                    "/api/playlists/" + JobbiAPI.encode(playlist.id))
                all.append(contentsOf: collection.tracks)
                collections.append(("playlist:" + playlist.id, collection.tracks))
            } catch {
                failedCollections += 1
                lastError = "\(playlist.name): \(error.localizedDescription)"
            }
        }
        await downloadAll(all, api: api)
        for (source, tracks) in collections {
            do {
                try remember(source, ids: tracks.filter { localURL(for: $0) != nil }.map(\.id))
            } catch { lastError = "Could not remember \(source): \(error.localizedDescription)" }
        }
        if failedCollections > 0 {
            batchLabel += " \(failedCollections) playlists could not be loaded."
        }
    }

    /// Delete only files under this account's private offline folder.
    private func deleteCopies(id: String) throws {
        guard let directory else { throw JobbiError.notSignedIn }
        let prefix = Self.hash(id)
        for ext in Self.supportedExtensions {
            let url = directory.appendingPathComponent(prefix + "." + ext)
            if FileManager.default.fileExists(atPath: url.path) {
                try FileManager.default.removeItem(at: url)
            }
        }
    }

    /// Removes a playlist's local copies, never its server playlist or NAS files.
    /// Another saved playlist, album, Favorites or explicit single-song download
    /// retains its own references to shared recordings.
    func removePlaylistDownloads(_ playlistID: String, tracks: [Song] = []) {
        guard !isBatchDownloading else {
            lastError = "Finish your current download before removing playlist files."
            return
        }
        let source = "playlist:" + playlistID
        let requested = Set((sources[source] ?? []) + tracks.map(\.id))
        let retained = Set(sources.filter { $0.key != source }
            .values.flatMap { $0 })
        var removed = Set<String>()
        var failures = 0
        for song in songs where requested.contains(song.id) && !retained.contains(song.id) {
            do {
                try deleteCopies(id: song.id)
                removed.insert(song.id)
            } catch { failures += 1; lastError = error.localizedDescription }
        }
        songs.removeAll { removed.contains($0.id) }
        var updated = sources
        // If removal failed, retain those references so the operation is retryable.
        let failedIDs = requested.subtracting(removed).subtracting(retained)
        if failedIDs.isEmpty {
            updated.removeValue(forKey: source)
        } else {
            updated[source] = Array(failedIDs).sorted()
        }
        do {
            try saveIndex()
            try saveSources(updated)
        } catch { lastError = "Could not save offline changes: \(error.localizedDescription)" }
        batchLabel = "Removed \(removed.count) offline songs. \(requested.intersection(retained).count) shared songs kept." +
            (failures > 0 ? " \(failures) could not be removed." : "")
    }

    func remove(_ song: Song) {
        do {
            try deleteCopies(id: song.id)
            songs.removeAll { $0.id == song.id }
            try saveIndex()
            try saveSources(sources.mapValues { $0.filter { $0 != song.id } }
                .filter { !$0.value.isEmpty })
        } catch { lastError = error.localizedDescription }
    }
}

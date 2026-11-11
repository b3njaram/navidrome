import SwiftUI

struct MusicSearchView: View {
    @EnvironmentObject private var api: JobbiAPI
    @EnvironmentObject private var library: MusicLibrary
    @EnvironmentObject private var player: MusicPlayer
    @State private var term = ""
    @State private var searching = false
    @State private var mode = 0
    @State private var result = SearchResponse(song: [], album: [])
    @State private var peers: [SoulseekFile] = []
    @State private var status: String?
    @State private var picked: SoulseekFile?
    @State private var title = ""
    @State private var artist = ""

    var body: some View {
        List {
            Section {
                Picker("Search source", selection: $mode) {
                    Text("My Library").tag(0)
                    Text("Find New Music").tag(1)
                }
                .pickerStyle(.segmented)
                if searching { ProgressView("Searching…") }
                if let status {
                    Text(status).font(.caption).foregroundStyle(.secondary)
                }
            }
            if mode == 0 {
                if !(result.song ?? []).isEmpty {
                    Section("Songs") {
                        ForEach(Array((result.song ?? []).enumerated()), id: \.element.id) { index, song in
                            SongRow(song: song, queue: result.song ?? [], index: index)
                        }
                    }
                }
                if !(result.album ?? []).isEmpty {
                    Section("Albums") {
                        ForEach(result.album ?? []) { album in
                            NavigationLink {
                                CollectionView(kind: .album, id: album.id)
                            } label: {
                                HStack {
                                    CoverArt(art: album.coverArt, size: 48)
                                    VStack(alignment: .leading) {
                                        Text(album.name)
                                        Text(album.artist ?? "")
                                            .font(.caption).foregroundStyle(.secondary)
                                    }
                                }
                            }
                        }
                    }
                }
            } else {
                Section {
                    if peers.isEmpty && !searching {
                        ContentUnavailableView("Search Soulseek",
                            systemImage: "globe",
                            description: Text("Discover recordings across connected peers. Choose an audio file to request a NAS import."))
                    }
                    ForEach(peers) { file in
                        Button {
                            picked = file
                            let name = file.displayName
                                .replacingOccurrences(of: #"\.[^.]+$"#,
                                                      with: "", options: .regularExpression)
                            let parts = name.components(separatedBy: " - ")
                            artist = parts.count > 1 ? parts[0] : ""
                            title = parts.count > 1 ? parts.dropFirst().joined(separator: " - ") : name
                        } label: {
                            HStack(spacing: 12) {
                                Image(systemName: "waveform")
                                    .foregroundStyle(.pink)
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(file.displayName).lineLimit(2)
                                        .foregroundStyle(.primary)
                                    Text("@\(file.username) · \(file.fileFormat) · \(ByteCountFormatter.string(fromByteCount: file.size, countStyle: .file))")
                                        .font(.caption).foregroundStyle(.secondary)
                                }
                                Spacer()
                                Image(systemName: "arrow.down.circle")
                            }
                        }
                    }
                } header: { Text("Peer recordings") }
                footer: {
                    Text("Availability depends on the Soulseek server and other users being online. A result is not a confirmed download.")
                }
            }
        }
        .navigationTitle("Search")
        .searchable(text: $term, placement: .navigationBarDrawer(displayMode: .always),
                    prompt: mode == 0 ? "Songs, artists, albums" : "Song and artist to discover")
        .onSubmit(of: .search) { Task { await performSearch() } }
        .onChange(of: mode) { _, _ in
            status = nil
            if !term.isEmpty { Task { await performSearch() } }
        }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Search", systemImage: "arrow.right") {
                    Task { await performSearch() }
                }
                .disabled(term.trimmingCharacters(in: .whitespaces).count < 2 || searching)
            }
        }
        .sheet(item: $picked) { file in
            NavigationStack {
                Form {
                    Section {
                        Text(file.displayName).font(.footnote)
                        Text("@\(file.username) · \(file.fileFormat)")
                            .font(.caption).foregroundStyle(.secondary)
                    } header: { Text("Selected peer file") }
                    Section("Music tags") {
                        TextField("Track title", text: $title)
                        TextField("Artist", text: $artist)
                    }
                    Section {
                        Text("The NAS will attempt the download and index the recording. It may fail if the peer disconnects.")
                            .font(.footnote).foregroundStyle(.secondary)
                    }
                }
                .navigationTitle("Import to NAS")
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") { picked = nil }
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Import") {
                            Task { await importFile(file) }
                        }
                        .disabled(title.isEmpty || artist.isEmpty)
                    }
                }
            }
            .presentationDetents([.medium, .large])
        }
    }

    private func performSearch() async {
        let query = term.trimmingCharacters(in: .whitespacesAndNewlines)
        guard query.count >= 2 else { status = "Enter at least two characters."; return }
        searching = true
        status = nil
        defer { searching = false }
        do {
            if mode == 0 {
                result = try await api.get("/api/search?q=" + JobbiAPI.encode(query))
                if (result.song ?? []).isEmpty && (result.album ?? []).isEmpty {
                    status = "Not found in your Navidrome library. Try Find New Music."
                }
            } else {
                let health: SoulseekStatus = try await api.get("/api/soulseek/status")
                let data = try await api.raw("/api/soulseek/search",
                        method: "POST", json: ["query": query])
                let decoded = try JSONSerialization.jsonObject(with: data)
                peers = Self.extractPeerFiles(decoded)
                if peers.isEmpty {
                    status = (health.message ?? "No peer recordings were returned.")
                        + " The peer network can be temporarily unavailable."
                } else {
                    status = "\(peers.count) candidate recordings. Confirm the artist, version, and format before importing."
                }
            }
        } catch {
            status = mode == 1
                ? "Soulseek search failed: \(error.localizedDescription). The NAS may be disconnected."
                : error.localizedDescription
        }
    }

    private func importFile(_ file: SoulseekFile) async {
        do {
            try await api.send("/api/music-imports", json: [
                "username": file.username, "filename": file.filename,
                "size": file.size, "title": title, "artist": artist
            ])
            picked = nil
            status = "Import requested. Check the server import history; this is not confirmation that the song is playable."
        } catch {
            status = "Import failed: \(error.localizedDescription)"
            picked = nil
        }
    }

    static func extractPeerFiles(_ json: Any) -> [SoulseekFile] {
        var found = [SoulseekFile]()
        var seen = Set<String>()
        let allowed = Set(["flac", "mp3", "m4a", "aac", "ogg", "opus", "wav", "aiff", "alac"])
        func walk(_ value: Any, peer: String, depth: Int) {
            if depth > 7 || found.count >= 150 { return }
            if let array = value as? [Any] {
                for child in array { walk(child, peer: peer, depth: depth + 1) }
            } else if let data = value as? [String: Any] {
                let owner = (data["username"] as? String)
                    ?? (data["userName"] as? String)
                    ?? (data["peer"] as? String) ?? peer
                let filename = (data["filename"] as? String)
                    ?? (data["fileName"] as? String) ?? ""
                let size = (data["size"] as? NSNumber)?.int64Value
                    ?? (data["fileSize"] as? NSNumber)?.int64Value ?? 0
                let suffix = filename.split(separator: ".").last.map(String.init)?.lowercased() ?? ""
                if !owner.isEmpty && !filename.isEmpty && size >= 1024,
                   allowed.contains(suffix) {
                    let key = (owner + "|" + filename).lowercased()
                    if seen.insert(key).inserted {
                        found.append(SoulseekFile(username: owner, filename: filename, size: size))
                    }
                }
                for child in data.values where child is [Any] || child is [String: Any] {
                    walk(child, peer: owner, depth: depth + 1)
                }
            }
        }
        walk(json, peer: "", depth: 0)
        return found
    }
}

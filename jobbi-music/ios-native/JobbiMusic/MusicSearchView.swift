import SwiftUI

struct MusicSearchView: View {
    @EnvironmentObject private var api: JobbiAPI
    @EnvironmentObject private var library: MusicLibrary
    @EnvironmentObject private var player: MusicPlayer
    @State private var term = ""
    @State private var searching = false
    @State private var mode: Int

    init(initialMode: Int = 0) {
        _mode = State(initialValue: initialMode)
    }
    @State private var result = SearchResponse(song: [], album: [])
    @State private var peers: [SoulseekFile] = []
    @State private var status: String?
    @State private var picked: SoulseekFile?
    @State private var title = ""
    @State private var artist = ""
    @State private var videos: [InvidiousVideo] = []
    @State private var invidiousMessage: String?
    @State private var invidiousImportEnabled = false
    @State private var selectedVideo: InvidiousVideo?
    @State private var importingVideo = false

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
                if term.isEmpty {
                    Section("Browse Your Library") {
                        NavigationLink {
                            MusicAlbumDirectory()
                        } label: {
                            MusicLibraryCategoryRow(title: "Albums", symbol: "square.stack")
                        }
                        NavigationLink {
                            MusicArtistDirectory()
                        } label: {
                            MusicLibraryCategoryRow(title: "Artists", symbol: "music.mic")
                        }
                        NavigationLink {
                            MusicPlaylistDirectory()
                        } label: {
                            MusicLibraryCategoryRow(title: "Playlists", symbol: "music.note.list")
                        }
                    }
                    if !(library.home?.recent ?? []).isEmpty {
                        Section {
                            AlbumShelf(title: "Recently Added",
                                albums: library.home?.recent ?? [])
                                .padding(.horizontal, -16)
                                .listRowSeparator(.hidden)
                        }
                    }
                }
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
                if term.isEmpty {
                    Section {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Find Something New")
                                .font(.title2.bold())
                            Text("Search Soulseek and verified alternate sources for music to add to your personal NAS library.")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                            Label("Lossless FLAC when available", systemImage: "waveform")
                                .font(.caption.weight(.medium))
                                .foregroundStyle(MusicAppearance.accent)
                        }
                        .padding(.vertical, 8)
                        .listRowSeparator(.hidden)
                    }
                    if !(library.home?.recent ?? []).isEmpty {
                        Section {
                            AlbumShelf(title: "Fresh from Your NAS",
                                albums: library.home?.recent ?? [])
                                .padding(.horizontal, -16)
                                .listRowSeparator(.hidden)
                        }
                    }
                }
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
                Section("Invidious alternate source") {
                    if let invidiousMessage {
                        Label(invidiousMessage, systemImage: "play.rectangle")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    ForEach(videos) { video in
                        HStack(spacing: 12) {
                            AsyncImage(url: api.url("/api/invidious/thumbnail/"
                                + JobbiAPI.encode(video.videoId))) { image in
                                image.resizable().scaledToFill()
                            } placeholder: {
                                Image(systemName: "play.rectangle.fill")
                                    .font(.title2).foregroundStyle(.secondary)
                            }
                            .frame(width: 68, height: 48)
                            .clipped()
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                            VStack(alignment: .leading, spacing: 3) {
                                Text(video.title).font(.subheadline.weight(.medium))
                                    .foregroundStyle(.primary)
                                Text(video.artist ?? "Unknown channel")
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer(minLength: 6)
                            Button { selectedVideo = video } label: {
                                Label("Import", systemImage: "arrow.down.circle")
                                    .labelStyle(.iconOnly)
                            }
                            .disabled(!invidiousImportEnabled || importingVideo)
                            .accessibilityLabel("Import \(video.title) from alternate source")
                        }
                    }
                    if !videos.isEmpty && !invidiousImportEnabled {
                        Text("Alternate-source results are available, but NAS importing is disabled. Enable the optional Invidious worker on the NAS to use these results.")
                            .font(.footnote).foregroundStyle(.secondary)
                    }
                }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(MusicAppearance.canvas)
        .navigationTitle(mode == 0 ? "Search" : "New")
        .navigationBarTitleDisplayMode(.large)
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
        .sheet(item: $selectedVideo) { video in
            NavigationStack {
                Form {
                    Section("Alternate-source recording") {
                        Text(video.title).font(.headline)
                        Text(video.artist ?? "Unknown channel")
                        Text("The NAS worker will attempt this import; Navidrome must index it. A queued request does not mean the recording is playable yet.")
                            .font(.footnote).foregroundStyle(.secondary)
                    }
                    Section {
                        Button {
                            Task { await importVideo(video) }
                        } label: {
                            Label(importingVideo ? "Requesting import…" : "Import audio to NAS",
                                  systemImage: "arrow.down.circle")
                        }
                        .disabled(importingVideo || !invidiousImportEnabled)
                    }
                }
                .navigationTitle("Alternate-source import")
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") { selectedVideo = nil }
                    }
                }
            }
            .presentationDetents([.medium])
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
        if mode == 0 {
            do {
                result = try await api.get("/api/search?q=" + JobbiAPI.encode(query))
                if (result.song ?? []).isEmpty && (result.album ?? []).isEmpty {
                    status = "Not found in your Navidrome library. Try Find New Music."
                }
            } catch { status = error.localizedDescription }
            return
        }
        peers = []
        videos = []
        invidiousMessage = nil
        var notes = [String]()
        // Providers fail independently; a broken Soulseek connection must
        // not block the alternate-source fallback.
        do {
            let health: SoulseekStatus = try await api.get("/api/soulseek/status")
            let data = try await api.raw("/api/soulseek/search",
                method: "POST", json: ["query": query])
            let decoded = try JSONSerialization.jsonObject(with: data)
            peers = Self.extractPeerFiles(decoded)
            notes.append(peers.isEmpty
                ? (health.message ?? "Soulseek returned no audio recordings.")
                : "Soulseek: \(peers.count) peer recordings.")
        } catch {
            notes.append("Soulseek failed: \(error.localizedDescription)")
        }
        do {
            let alternate: InvidiousSearchResponse = try await api.get(
                "/api/invidious/search?q=" + JobbiAPI.encode(query))
            videos = alternate.results ?? []
            let capabilities: InvidiousImportStatus = try await api.get("/api/invidious/status")
            invidiousImportEnabled = capabilities.importEnabled == true
            invidiousMessage = alternate.message ??
                (videos.isEmpty ? "No alternate-source results."
                 : "\(videos.count) alternate-source matches.")
            notes.append("Invidious: \(videos.count) results.")
        } catch {
            invidiousImportEnabled = false
            invidiousMessage = "Invidious unavailable: \(error.localizedDescription)"
            notes.append("Invidious unavailable.")
        }
        status = notes.joined(separator: " ")
    }

    private func importVideo(_ video: InvidiousVideo) async {
        guard !importingVideo && invidiousImportEnabled else { return }
        importingVideo = true
        defer { importingVideo = false }
        do {
            try await api.send("/api/invidious/import", json: [
                "videoId": video.videoId, "title": video.title,
                "artist": video.artist ?? "Unknown channel", "authorized": true
            ])
            selectedVideo = nil
            status = "Alternate-source import queued on the NAS. Check transfer history; playback is not yet confirmed."
        } catch {
            selectedVideo = nil
            status = "Alternate-source import failed: \(error.localizedDescription)"
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

import SwiftUI

enum CollectionKind {
    case album, playlist
    var path: String { self == .album ? "albums" : "playlists" }
    var artPath: String { self == .album ? "album" : "playlist" }
}

struct LibraryView: View {
    @EnvironmentObject private var api: JobbiAPI
    @EnvironmentObject private var library: MusicLibrary
    @EnvironmentObject private var offline: OfflineLibrary
    @EnvironmentObject private var player: MusicPlayer
    @State private var showingCreate = false
    @State private var playlistName = ""

    var body: some View {
        List {
            Section {
                NavigationLink {
                    FavoritesView()
                } label: {
                    Label("Favorite Songs", systemImage: "heart.fill")
                        .foregroundStyle(.pink)
                }
                NavigationLink {
                    OfflineView()
                } label: {
                    Label("Downloaded Music", systemImage: "arrow.down.circle.fill")
                }
            }
            Section {
                ForEach(library.playlists) { playlist in
                    NavigationLink {
                        CollectionView(kind: .playlist, id: playlist.id)
                    } label: {
                        Label {
                            VStack(alignment: .leading) {
                                Text(playlist.name)
                                Text("\(playlist.songCount ?? 0) songs")
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                        } icon: { Image(systemName: "music.note.list") }
                    }
                }
                if library.playlists.isEmpty {
                    ContentUnavailableView("No playlists yet",
                        systemImage: "text.badge.plus",
                        description: Text("Create one to organize your music."))
                }
            } header: {
                HStack {
                    Text("Playlists")
                    Spacer()
                    Button { showingCreate = true } label: { Image(systemName: "plus") }
                        .accessibilityLabel("Create playlist")
                }
            } footer: {
                Button("Download all playlists") {
                    Task {
                        for playlist in library.playlists {
                            if Task.isCancelled { break }
                            if let detail: CollectionDetail = try? await api.get(
                                "/api/playlists/" + JobbiAPI.encode(playlist.id)) {
                                await offline.downloadAll(detail.tracks, api: api)
                            }
                        }
                    }
                }
            }
            Section("Albums") {
                ForEach(library.albums) { album in
                    NavigationLink {
                        CollectionView(kind: .album, id: album.id)
                    } label: {
                        HStack {
                            CoverArt(art: album.coverArt, size: 46)
                            VStack(alignment: .leading) {
                                Text(album.name).lineLimit(1)
                                Text(album.artist ?? "Unknown artist")
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle("Library")
        .refreshable { await library.refresh(api: api) }
        .alert("New playlist", isPresented: $showingCreate) {
            TextField("Playlist name", text: $playlistName)
            Button("Create") {
                Task {
                    do {
                        let _: CreatePlaylistResponse = try await api.send(
                            "/api/playlists", json: ["name": playlistName])
                        playlistName = ""
                        await library.refresh(api: api)
                    } catch { library.message = error.localizedDescription }
                }
            }
            Button("Cancel", role: .cancel) { playlistName = "" }
        }
    }
}

struct CollectionView: View {
    @EnvironmentObject private var api: JobbiAPI
    @EnvironmentObject private var library: MusicLibrary
    @EnvironmentObject private var player: MusicPlayer
    @EnvironmentObject private var offline: OfflineLibrary
    @Environment(\.dismiss) private var dismiss
    let kind: CollectionKind
    let id: String
    @State private var detail: CollectionDetail?
    @State private var error: String?
    @State private var coverRevision = 0
    @State private var showDelete = false
    @State private var rename = ""
    @State private var showRename = false

    private var coverURL: String {
        "/api/artwork/" + kind.artPath + "/" + JobbiAPI.encode(id) + "?v=" + String(coverRevision)
    }

    var body: some View {
        List {
            if let detail {
                Section {
                    VStack(spacing: 14) {
                        CoverArt(art: detail.tracks.first?.coverArt,
                            size: 220, cornerRadius: 18, customPath: coverURL)
                            .padding(.vertical)
                        Text(detail.title)
                            .font(.title2.bold())
                            .multilineTextAlignment(.center)
                        Text("\(detail.tracks.count) songs")
                            .foregroundStyle(.secondary)
                        HStack {
                            Button { player.play(detail.tracks) } label: {
                                Label("Play", systemImage: "play.fill")
                            }
                            .buttonStyle(.borderedProminent)
                            .disabled(detail.tracks.isEmpty)
                            Button {
                                player.shuffled = true
                                player.play(detail.tracks)
                            } label: { Label("Shuffle", systemImage: "shuffle") }
                                .buttonStyle(.bordered)
                        }
                        PhotoUploadButton(path: coverURL.components(separatedBy: "?")[0],
                                          title: "Change cover") {
                            coverRevision += 1
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .listRowBackground(Color.clear)
                }
                if kind == .playlist {
                    Section("Playlist controls") {
                        if detail.owner == nil || detail.owner?.lowercased() == api.user?.username.lowercased() {
                            Toggle("Public playlist", isOn: Binding(
                                get: { self.detail?.isPublic ?? false },
                                set: { value in
                                    Task {
                                        do {
                                            let result: PlaylistMutation = try await api.send(
                                                "/api/playlists/" + JobbiAPI.encode(id),
                                                method: "PATCH", json: ["public": value])
                                            self.detail = result.playlist ?? self.detail
                                        } catch { error = error.localizedDescription }
                                    }
                                }))
                        }
                        Button("Download playlist") {
                            Task { await offline.downloadAll(detail.tracks, api: api) }
                        }
                        Button("Add all to Favorites") {
                            Task {
                                do {
                                    try await api.send("/api/playlists/" + JobbiAPI.encode(id)
                                        + "/favorite-all")
                                    await library.refresh(api: api)
                                } catch { error = error.localizedDescription }
                            }
                        }
                        Button("Rename playlist") {
                            rename = detail.title
                            showRename = true
                        }
                        Button("Delete playlist", role: .destructive) { showDelete = true }
                    }
                } else {
                    Section {
                        Button("Download album") {
                            Task { await offline.downloadAll(detail.tracks, api: api) }
                        }
                    }
                }
                Section("Tracks") {
                    ForEach(Array(detail.tracks.enumerated()), id: \.element.id) { index, song in
                        SongRow(song: song, queue: detail.tracks, index: index)
                    }
                }
            } else {
                ProgressView("Loading collection…")
            }
        }
        .navigationTitle(detail?.title ?? "Collection")
        .navigationBarTitleDisplayMode(.inline)
        .task(id: id) { await reload() }
        .refreshable { await reload() }
        .alert("Rename playlist", isPresented: $showRename) {
            TextField("Name", text: $rename)
            Button("Save") {
                Task {
                    do {
                        try await api.send("/api/playlists/" + JobbiAPI.encode(id),
                            method: "PATCH", json: ["name": rename])
                        await reload()
                        await library.refresh(api: api)
                    } catch { error = error.localizedDescription }
                }
            }
            Button("Cancel", role: .cancel) {}
        }
        .confirmationDialog("Delete this playlist?", isPresented: $showDelete) {
            Button("Delete playlist", role: .destructive) {
                Task {
                    do {
                        try await api.send("/api/playlists/" + JobbiAPI.encode(id),
                            method: "DELETE")
                        await library.refresh(api: api)
                        dismiss()
                    } catch { error = error.localizedDescription }
                }
            }
        } message: { Text("Music files will not be deleted from the NAS.") }
        .alert("Collection error", isPresented: Binding(
            get: { error != nil }, set: { if !$0 { error = nil } }
        )) {
            Button("OK") { error = nil }
        } message: { Text(error ?? "") }
    }

    private func reload() async {
        do { detail = try await api.get("/api/" + kind.path + "/" + JobbiAPI.encode(id)) }
        catch { error = error.localizedDescription }
    }
}

struct FavoritesView: View {
    @EnvironmentObject private var library: MusicLibrary
    @EnvironmentObject private var api: JobbiAPI
    @EnvironmentObject private var player: MusicPlayer
    @EnvironmentObject private var offline: OfflineLibrary

    var body: some View {
        List {
            Section {
                HStack {
                    Button {
                        player.shuffled = true
                        player.play(library.favorites)
                    } label: { Label("Shuffle All", systemImage: "shuffle") }
                        .buttonStyle(.borderedProminent)
                    Button {
                        Task { await offline.downloadAll(library.favorites, api: api) }
                    } label: { Label("Download All", systemImage: "arrow.down.circle") }
                        .buttonStyle(.bordered)
                }
                .listRowBackground(Color.clear)
            }
            Section("Songs") {
                ForEach(Array(library.favorites.enumerated()), id: \.element.id) { index, song in
                    SongRow(song: song, queue: library.favorites, index: index)
                }
            }
        }
        .navigationTitle("Favorites")
    }
}

struct OfflineView: View {
    @EnvironmentObject private var offline: OfflineLibrary
    @EnvironmentObject private var player: MusicPlayer

    var body: some View {
        List {
            if offline.songs.isEmpty {
                ContentUnavailableView("No downloads",
                    systemImage: "arrow.down.to.line",
                    description: Text("Open a playlist or Favorites and choose Download."))
            } else {
                ForEach(Array(offline.songs.enumerated()), id: \.element.id) { index, song in
                    SongRow(song: song, queue: offline.songs, index: index)
                }
            }
        }
        .navigationTitle("Downloads")
    }
}

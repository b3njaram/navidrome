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
    @State private var playlistToClear: MusicPlaylist?
    @State private var playlistSearch = ""
    @State private var showingSharedCreate = false
    @State private var sharedPlaylists: [SocialPlaylist] = []

    private var matchingPlaylists: [MusicPlaylist] {
        library.playlists.filter {
            playlistSearch.isEmpty || $0.name.localizedStandardContains(playlistSearch)
        }
    }

    private var matchingSharedPlaylists: [SocialPlaylist] {
        sharedPlaylists.filter {
            playlistSearch.isEmpty || $0.title.localizedStandardContains(playlistSearch)
        }
    }

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
                NavigationLink {
                    CollectionImportsView()
                } label: {
                    Label("Saved music imports", systemImage: "doc.badge.arrow.up")
                }
            }
            Section {
                ForEach(matchingPlaylists) { playlist in
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
                    .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                        if offline.hasPlaylistDownloads(playlist.id) {
                            Button(role: .destructive) {
                                playlistToClear = playlist
                            } label: {
                                Label("Remove downloads", systemImage: "trash")
                            }
                            .disabled(offline.isBatchDownloading)
                        }
                    }
                }
                if matchingPlaylists.isEmpty {
                    ContentUnavailableView(
                        playlistSearch.isEmpty ? "No playlists yet" : "No matching playlists",
                        systemImage: "music.note.list",
                        description: Text(playlistSearch.isEmpty
                            ? "Create one to organize your music."
                            : "Try a different playlist name."))
                }
            } header: {
                HStack {
                    Text("Playlists")
                    Spacer()
                    Button { showingCreate = true } label: { Image(systemName: "plus") }
                        .accessibilityLabel("Create playlist")
                }
            }
            Section {
                ForEach(matchingSharedPlaylists) { playlist in
                    NavigationLink {
                        SocialPlaylistView(id: playlist.id)
                    } label: {
                        Label {
                            VStack(alignment: .leading, spacing: 3) {
                                Text(playlist.title)
                                Text("@" + (playlist.owner ?? "unknown") +
                                     " · \(playlist.song_count ?? 0) tracks")
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                        } icon: { Image(systemName: "person.2.wave.2") }
                    }
                }
                if matchingSharedPlaylists.isEmpty {
                    Text(playlistSearch.isEmpty
                        ? "No shared playlists yet."
                        : "No shared playlists match your search.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
            } header: {
                HStack {
                    Text("Shared playlists")
                    Spacer()
                    Button { showingSharedCreate = true } label: {
                        Image(systemName: "person.2.badge.plus")
                    }
                    .accessibilityLabel("Create shared playlist")
                }
            }
            Section("Offline downloads") {
                Button {
                    Task { await offline.downloadAllPlaylists(library.playlists, api: api) }
                } label: {
                    Label("Download all playlists", systemImage: "square.and.arrow.down.on.square")
                }
                .disabled(library.playlists.isEmpty || offline.isBatchDownloading)
                if offline.isBatchDownloading {
                    ProgressView(value: Double(offline.batchDone),
                                 total: Double(max(offline.batchTotal, 1))) {
                        Text(offline.batchLabel)
                    }
                } else if !offline.batchLabel.isEmpty {
                    Text(offline.batchLabel)
                        .font(.caption).foregroundStyle(.secondary)
                }
                if let failure = offline.lastError {
                    Label(failure, systemImage: "exclamationmark.triangle")
                        .font(.caption).foregroundStyle(.red)
                }
                Text("Downloads save individual original recordings on this iPhone. Songs shared across playlists are saved only once.")
                    .font(.caption).foregroundStyle(.secondary)
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
        .searchable(text: $playlistSearch,
                    placement: .navigationBarDrawer(displayMode: .always),
                    prompt: "Search playlists by name")
        .task { await refreshSharedPlaylists() }
        .refreshable {
            await library.refresh(api: api)
            await refreshSharedPlaylists()
        }
        .sheet(isPresented: $showingSharedCreate) {
            SharedPlaylistComposer(mode: .create) { _ in
                Task { await refreshSharedPlaylists() }
            }
            .environmentObject(api)
        }
        .confirmationDialog("Remove offline playlist downloads?",
            isPresented: Binding(get: { playlistToClear != nil },
                set: { if !$0 { playlistToClear = nil } })) {
            Button("Remove from iPhone", role: .destructive) {
                if let playlist = playlistToClear {
                    offline.removePlaylistDownloads(playlist.id)
                }
                playlistToClear = nil
            }
            Button("Cancel", role: .cancel) { playlistToClear = nil }
        } message: {
            Text("Only device copies not used by other saved collections are removed. Your NAS and playlist remain unchanged.")
        }
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

    private func refreshSharedPlaylists() async {
        do {
            let result: SocialOverview = try await api.get("/api/social/home")
            sharedPlaylists = result.playlists ?? []
        } catch {
            // Keep native library available when the optional social service is down.
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
    @State private var showRemoveOffline = false
    @State private var showingCollaboration = false
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
                        if mayChangeVisibility { visibilityToggle }
                        Button {
                            Task { await offline.downloadAll(detail.tracks, api: api,
                                source: "playlist:" + id) }
                        } label: {
                            Label("Download playlist offline", systemImage: "arrow.down.circle")
                        }
                        .disabled(offline.isBatchDownloading)
                        Button("Remove offline downloads", role: .destructive) {
                            showRemoveOffline = true
                        }
                        .disabled(offline.isBatchDownloading ||
                            (!offline.hasPlaylistDownloads(id) &&
                             !detail.tracks.contains(where: { offline.localURL(for: $0) != nil })))
                        Button {
                            showingCollaboration = true
                        } label: {
                            Label("Invite collaborators", systemImage: "person.2.badge.plus")
                        }
                        Button("Add all to Favorites") {
                            Task {
                                do {
                                    try await api.send("/api/playlists/" + JobbiAPI.encode(id)
                                        + "/favorite-all")
                                    await library.refresh(api: api)
                                } catch { self.error = error.localizedDescription }
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
                            Task { await offline.downloadAll(detail.tracks, api: api,
                                source: "album:" + id) }
                        }
                    }
                }
                if !offline.batchLabel.isEmpty {
                    Section("Download status") {
                        if offline.isBatchDownloading {
                            ProgressView(value: Double(offline.batchDone),
                                total: Double(max(offline.batchTotal, 1))) {
                                Text(offline.batchLabel)
                            }
                        } else {
                            Text(offline.batchLabel)
                        }
                        if let failure = offline.lastError {
                            Text(failure).foregroundStyle(.red)
                                .font(.footnote)
                        }
                    }
                }
                Section("Tracks") {
                    ForEach(Array(detail.tracks.enumerated()), id: \.offset) { index, song in
                        SongRow(song: song, queue: detail.tracks, index: index,
                            onRemoveFromPlaylist: kind == .playlist ? {
                                removePlaylistEntry(at: index)
                            } : nil,
                            onServerRemoved: { Task { await reload() } })
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
        .sheet(isPresented: $showingCollaboration) {
            SharedPlaylistComposer(mode: .importPlaylist(id: id,
                title: detail?.title ?? "Playlist"))
                .environmentObject(api)
        }
        .alert("Rename playlist", isPresented: $showRename) {
            TextField("Name", text: $rename)
            Button("Save") {
                Task {
                    do {
                        try await api.send("/api/playlists/" + JobbiAPI.encode(id),
                            method: "PATCH", json: ["name": rename])
                        await reload()
                        await library.refresh(api: api)
                    } catch { self.error = error.localizedDescription }
                }
            }
            Button("Cancel", role: .cancel) {}
        }
        .confirmationDialog("Remove offline downloads?", isPresented: $showRemoveOffline) {
            Button("Remove downloaded songs", role: .destructive) {
                offline.removePlaylistDownloads(id, tracks: detail?.tracks ?? [])
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This removes only local iPhone copies not needed by other saved collections. The playlist and original music on your NAS stay intact.")
        }
        .confirmationDialog("Delete this playlist?", isPresented: $showDelete) {
            Button("Delete playlist", role: .destructive) {
                Task {
                    do {
                        try await api.send("/api/playlists/" + JobbiAPI.encode(id),
                            method: "DELETE")
                        await library.refresh(api: api)
                        dismiss()
                    } catch { self.error = error.localizedDescription }
                }
            }
        } message: { Text("Music files will not be deleted from the NAS.") }
        .alert("Collection error", isPresented: Binding(
            get: { error != nil }, set: { if !$0 { error = nil } }
        )) {
            Button("OK") { error = nil }
        } message: { Text(error ?? "") }
    }

    private var mayChangeVisibility: Bool {
        guard let owner = detail?.owner, !owner.isEmpty else { return true }
        return owner.lowercased() == api.user?.username.lowercased()
    }

    private var visibilityToggle: some View {
        Toggle("Public playlist", isOn: Binding(
            get: { self.detail?.isPublic ?? false },
            set: { desired in
                Task {
                    do {
                        let result: PlaylistMutation = try await api.send(
                            "/api/playlists/" + JobbiAPI.encode(id), method: "PATCH",
                            json: ["public": desired])
                        self.detail = result.playlist ?? self.detail
                    } catch { self.error = error.localizedDescription }
                }
            }
        ))
    }

    private func removePlaylistEntry(at index: Int) {
        guard kind == .playlist else { return }
        Task {
            do {
                try await api.send("/api/playlists/" + JobbiAPI.encode(id),
                    method: "PATCH", json: ["removeIndex": index])
                await reload()
                await library.refresh(api: api)
            } catch { self.error = error.localizedDescription }
        }
    }

    private func reload() async {
        do { detail = try await api.get("/api/" + kind.path + "/" + JobbiAPI.encode(id)) }
        catch { self.error = error.localizedDescription }
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
                        Task { await offline.downloadAll(library.favorites, api: api,
                            source: "favorites") }
                    } label: { Label("Download All", systemImage: "arrow.down.circle") }
                        .buttonStyle(.bordered)
                }
                .listRowBackground(Color.clear)
            }
            if !offline.batchLabel.isEmpty {
                Section("Download status") {
                    Text(offline.batchLabel)
                    if let error = offline.lastError {
                        Text(error).font(.footnote).foregroundStyle(.red)
                    }
                }
            }
            Section("Songs") {
                ForEach(Array(library.favorites.enumerated()), id: \.offset) { index, song in
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

import SwiftUI

struct MusicPlaylistDirectory: View {
    @EnvironmentObject private var library: MusicLibrary
    @EnvironmentObject private var offline: OfflineLibrary
    @State private var query = ""
    @State private var playlistToClear: MusicPlaylist?

    var body: some View {
        List {
            ForEach(library.playlists.filter {
                query.isEmpty || $0.name.localizedStandardContains(query)
            }) { playlist in
                NavigationLink {
                    CollectionView(kind: .playlist, id: playlist.id)
                } label: {
                    HStack(spacing: 12) {
                        MusicListArtwork(symbol: "music.note.list")
                        VStack(alignment: .leading, spacing: 3) {
                            Text(playlist.name)
                                .font(.body.weight(.medium))
                            Text("\(playlist.songCount ?? 0) songs")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .padding(.vertical, 2)
                }
                .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                    if offline.hasPlaylistDownloads(playlist.id) {
                        Button(role: .destructive) { playlistToClear = playlist } label: {
                            Label("Remove downloads", systemImage: "trash")
                        }
                        .disabled(offline.isBatchDownloading)
                    }
                }
            }
        }
        .listStyle(.plain)
        .navigationTitle("Playlists")
        .searchable(text: $query, prompt: "Find a playlist")
        .confirmationDialog("Remove offline playlist downloads?",
                            isPresented: Binding(get: { playlistToClear != nil },
                                                 set: { if !$0 { playlistToClear = nil } })) {
            Button("Remove from iPhone", role: .destructive) {
                if let playlistToClear {
                    offline.removePlaylistDownloads(playlistToClear.id)
                }
                playlistToClear = nil
            }
        } message: {
            Text("This leaves the playlist and all music files on your NAS unchanged.")
        }
    }
}

struct MusicAlbumDirectory: View {
    @EnvironmentObject private var library: MusicLibrary
    @State private var query = ""

    var body: some View {
        List {
            ForEach(library.albums.filter {
                query.isEmpty || $0.name.localizedStandardContains(query) ||
                    ($0.artist?.localizedStandardContains(query) ?? false)
            }) { album in
                NavigationLink {
                    CollectionView(kind: .album, id: album.id)
                } label: {
                    HStack(spacing: 12) {
                        CoverArt(art: album.coverArt, size: 54, cornerRadius: 8)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(album.name).font(.body.weight(.medium)).lineLimit(1)
                            Text(album.artist ?? "Unknown Artist")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                    }
                    .padding(.vertical, 2)
                }
            }
        }
        .listStyle(.plain)
        .navigationTitle("Albums")
        .searchable(text: $query, prompt: "Albums and artists")
    }
}

struct MusicDirectoryArtist: Decodable, Identifiable {
    let id: String
    let name: String
    let coverArt: String?
}
struct MusicDirectoryArtists: Decodable {
    let artists: [MusicDirectoryArtist]
}
struct MusicDirectoryArtistDetail: Decodable {
    let id: String
    let name: String
    let album: [MusicAlbum]?
    let song: [Song]?
}

struct MusicArtistDirectory: View {
    @EnvironmentObject private var api: JobbiAPI
    @State private var artists: [MusicDirectoryArtist] = []
    @State private var query = ""
    @State private var error: String?

    var body: some View {
        List {
            if let error {
                Text(error).font(.footnote).foregroundStyle(.secondary)
            }
            ForEach(artists.filter {
                query.isEmpty || $0.name.localizedStandardContains(query)
            }) { artist in
                NavigationLink {
                    MusicArtistDetailView(id: artist.id)
                } label: {
                    HStack(spacing: 12) {
                        CoverArt(art: artist.coverArt, size: 54, cornerRadius: 27)
                        Text(artist.name).font(.body.weight(.medium))
                    }
                    .padding(.vertical, 3)
                }
            }
        }
        .listStyle(.plain)
        .navigationTitle("Artists")
        .searchable(text: $query, prompt: "Find an artist")
        .task {
            do {
                let data: MusicDirectoryArtists = try await api.get("/api/library/artists")
                artists = data.artists.sorted {
                    $0.name.localizedStandardCompare($1.name) == .orderedAscending
                }
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}

struct MusicArtistDetailView: View {
    @EnvironmentObject private var api: JobbiAPI
    @EnvironmentObject private var player: MusicPlayer
    let id: String
    @State private var detail: MusicDirectoryArtistDetail?
    @State private var error: String?

    var body: some View {
        List {
            if let detail {
                Section {
                    VStack(spacing: 16) {
                        MusicListArtwork(symbol: "music.mic", size: 150)
                            .clipShape(Circle())
                        Text(detail.name).font(.largeTitle.bold())
                        MusicPlaybackActions {
                            player.play(detail.song ?? [])
                        } shuffle: {
                            player.shuffled = true
                            player.play(detail.song ?? [])
                        } disabled: {
                            (detail.song ?? []).isEmpty
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 18)
                    .listRowBackground(Color.clear)
                }
                if !(detail.album ?? []).isEmpty {
                    Section("Albums") {
                        ForEach(detail.album ?? []) { album in
                            NavigationLink {
                                CollectionView(kind: .album, id: album.id)
                            } label: {
                                HStack(spacing: 12) {
                                    CoverArt(art: album.coverArt, size: 54, cornerRadius: 8)
                                    Text(album.name)
                                }
                            }
                        }
                    }
                }
                if !(detail.song ?? []).isEmpty {
                    Section("Songs") {
                        ForEach(Array((detail.song ?? []).enumerated()), id: \.offset) { index, song in
                            SongRow(song: song, queue: detail.song ?? [], index: index)
                        }
                    }
                }
            } else if let error {
                ContentUnavailableView("Artist unavailable", systemImage: "music.mic",
                    description: Text(error))
            } else {
                ProgressView("Loading artist…")
            }
        }
        .listStyle(.plain)
        .navigationTitle(detail?.name ?? "Artist")
        .task(id: id) {
            do {
                detail = try await api.get("/api/artists/" + JobbiAPI.encode(id))
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}

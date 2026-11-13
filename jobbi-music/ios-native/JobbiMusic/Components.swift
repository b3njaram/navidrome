import SwiftUI

struct CoverArt: View {
    @EnvironmentObject private var api: JobbiAPI
    let art: String?
    var size: CGFloat = 56
    var cornerRadius: CGFloat = 10
    var customPath: String? = nil

    var body: some View {
        let path = customPath ?? art.map { "/api/cover/" + JobbiAPI.encode($0) }
        AsyncImage(url: path.flatMap(api.url)) { image in
            image.resizable().scaledToFill()
        } placeholder: {
            Rectangle()
                .fill(.pink.gradient.opacity(0.18))
                .overlay {
                    Image(systemName: "music.note")
                        .font(.system(size: size / 3, weight: .medium))
                        .foregroundStyle(.pink)
                }
        }
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: cornerRadius))
        .accessibilityLabel("Album art")
    }
}

struct SongRow: View {
    @EnvironmentObject private var api: JobbiAPI
    @EnvironmentObject private var library: MusicLibrary
    @EnvironmentObject private var player: MusicPlayer
    @EnvironmentObject private var offline: OfflineLibrary
    let song: Song
    let queue: [Song]
    let index: Int
    var showAlbum = true
    var showTrackNumber = false
    var onRemoveFromPlaylist: (() -> Void)? = nil
    var onServerRemoved: (() -> Void)? = nil
    @State private var showPlaylists = false
    @State private var confirmRemoveFromPlaylist = false
    @State private var showServerRemoval = false

    var body: some View {
        HStack(spacing: 12) {
            Button { player.play(queue, from: index) } label: {
                HStack(spacing: 12) {
                    if showTrackNumber {
                        Text("\(index + 1)")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .frame(width: 38, alignment: .center)
                    } else {
                        CoverArt(art: song.coverArt, size: 48, cornerRadius: 8)
                    }
                    VStack(alignment: .leading, spacing: 3) {
                        Text(song.title).font(.body.weight(.medium))
                            .foregroundStyle(.primary).lineLimit(1)
                        Text(showAlbum ? "\(song.artist) · \(song.displayAlbum)" : song.artist)
                            .font(.caption).foregroundStyle(.secondary).lineLimit(1)
                    }
                    Spacer(minLength: 6)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Play \(song.title) by \(song.artist)")
            Menu {
                Button { player.playNext(song) } label: {
                    Label("Play Next", systemImage: "text.line.first.and.arrowtriangle.forward")
                }
                Button { player.addToQueue(song) } label: {
                    Label("Add to Queue", systemImage: "text.badge.plus")
                }
                Divider()
                Button {
                    Task { await library.toggleFavorite(song, api: api) }
                } label: {
                    Label(library.favorites.contains(where: { $0.id == song.id })
                        ? "Remove from Favorites" : "Add to Favorites",
                          systemImage: "heart")
                }
                Button { showPlaylists = true } label: {
                    Label("Add to playlist", systemImage: "text.badge.plus")
                }
                if offline.localURL(for: song) == nil {
                    Button {
                        Task { await offline.download(song, api: api) }
                    } label: {
                        Label(offline.downloading.contains(song.id) ? "Downloading…" : "Download song",
                              systemImage: "arrow.down.circle")
                    }
                    .disabled(offline.downloading.contains(song.id))
                } else {
                    Label("Saved offline", systemImage: "checkmark.circle.fill")
                    Button(role: .destructive) { offline.remove(song) } label: {
                        Label("Remove offline copy", systemImage: "trash")
                    }
                }
                Divider()
                if onRemoveFromPlaylist != nil {
                    Button(role: .destructive) { confirmRemoveFromPlaylist = true } label: {
                        Label("Remove from this playlist", systemImage: "minus.circle")
                    }
                }
                Button(role: .destructive) { showServerRemoval = true } label: {
                    Label("Remove recording from NAS…", systemImage: "externaldrive.badge.xmark")
                }
            } label: {
                Image(systemName: "ellipsis")
                    .font(.system(size: 18, weight: .medium))
                    .foregroundStyle(.secondary)
                    .frame(width: 40, height: 44)
                    .contentShape(Rectangle())
            }
            .accessibilityLabel("More options for \(song.title)")
        }
        .confirmationDialog("Remove from playlist?", isPresented: $confirmRemoveFromPlaylist,
                            titleVisibility: .visible) {
            Button("Remove playlist entry", role: .destructive) {
                onRemoveFromPlaylist?()
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This only removes the playlist entry. The recording remains on the NAS and in other playlists.")
        }
        .sheet(isPresented: $showServerRemoval) {
            ServerRemovalView(song: song, onRemoved: onServerRemoved)
                .presentationDragIndicator(.visible)
        }
        .confirmationDialog("Add to playlist", isPresented: $showPlaylists,
                            titleVisibility: .visible) {
            ForEach(library.playlists) { playlist in
                Button(playlist.name) {
                    Task { await library.addToPlaylist(song, playlist: playlist, api: api) }
                }
            }
            Button("Cancel", role: .cancel) {}
        }
    }
}

/// Artwork-forward recommendations, with every original song action preserved
/// in the See All screen (including queue, offline and NAS operations).
struct SongShelf: View {
    @EnvironmentObject private var player: MusicPlayer
    let title: String
    let subtitle: String?
    let songs: [Song]
    var showPlays = false

    var body: some View {
        if !songs.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .center, spacing: 10) {
                    MusicSectionHeading(title: title, subtitle: subtitle)
                    NavigationLink {
                        MusicSongShelfDetail(title: title, songs: songs)
                    } label: {
                        Image(systemName: "chevron.right")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.secondary)
                    }
                    .accessibilityLabel("See all \(title)")
                }
                .padding(.horizontal, 16)
                ScrollView(.horizontal) {
                    LazyHStack(alignment: .top, spacing: 14) {
                        ForEach(Array(songs.prefix(12).enumerated()), id: \.element.id) { index, song in
                            Button {
                                player.play(songs, from: index)
                            } label: {
                                VStack(alignment: .leading, spacing: 5) {
                                    CoverArt(art: song.coverArt, size: 145,
                                             cornerRadius: MusicAppearance.tileRadius)
                                    Text(song.title)
                                        .font(.subheadline.weight(.medium))
                                        .foregroundStyle(.primary)
                                        .lineLimit(1)
                                    Text(song.artist)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                        .lineLimit(1)
                                    if showPlays, let count = song.playCount, count > 0 {
                                        Text("\(count) plays")
                                            .font(.caption2)
                                            .foregroundStyle(.secondary)
                                    }
                                }
                                .frame(width: 145, alignment: .leading)
                            }
                            .buttonStyle(.plain)
                            .contextMenu {
                                Button("Play Next", systemImage: "text.line.first.and.arrowtriangle.forward") {
                                    player.playNext(song)
                                }
                                Button("Add to Queue", systemImage: "text.badge.plus") {
                                    player.addToQueue(song)
                                }
                                NavigationLink {
                                    MusicSongShelfDetail(title: title, songs: songs)
                                } label: {
                                    Label("All song options", systemImage: "ellipsis")
                                }
                            }
                        }
                    }
                    .padding(.horizontal, 16)
                }
                .scrollIndicators(.hidden)
            }
        }
    }
}

struct MusicSongShelfDetail: View {
    let title: String
    let songs: [Song]

    var body: some View {
        List {
            Section("Songs") {
                ForEach(Array(songs.enumerated()), id: \.offset) { index, song in
                    SongRow(song: song, queue: songs, index: index)
                }
            }
        }
        .listStyle(.plain)
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.large)
    }
}

struct AlbumShelf: View {
    let title: String
    let albums: [MusicAlbum]

    var body: some View {
        if !albums.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                MusicSectionHeading(title: title)
                    .padding(.horizontal, 16)
                ScrollView(.horizontal) {
                    LazyHStack(alignment: .top, spacing: 14) {
                        ForEach(albums) { album in
                            MusicAlbumTile(album: album, size: 153)
                        }
                    }
                    .padding(.horizontal, 16)
                }
                .scrollIndicators(.hidden)
            }
        }
    }
}

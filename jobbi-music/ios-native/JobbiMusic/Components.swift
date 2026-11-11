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
    @State private var showPlaylists = false

    var body: some View {
        HStack(spacing: 12) {
            Button { player.play(queue, from: index) } label: {
                HStack(spacing: 12) {
                    CoverArt(art: song.coverArt, size: 48)
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
                    } label: { Label("Save offline", systemImage: "arrow.down.circle") }
                } else {
                    Button(role: .destructive) { offline.remove(song) } label: {
                        Label("Remove offline copy", systemImage: "trash")
                    }
                }
            } label: {
                Image(systemName: "ellipsis")
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .accessibilityLabel("More options for \(song.title)")
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

struct SongShelf: View {
    @EnvironmentObject private var player: MusicPlayer
    let title: String
    let subtitle: String?
    let songs: [Song]
    var showPlays = false
    var body: some View {
        if !songs.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .firstTextBaseline) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(title).font(.title2.bold())
                        if let subtitle { Text(subtitle).font(.caption).foregroundStyle(.secondary) }
                    }
                    Spacer()
                    Button { player.play(songs) } label: { Image(systemName: "play.fill") }
                        .buttonStyle(.bordered)
                        .accessibilityLabel("Play all \(title)")
                }
                ForEach(Array(songs.prefix(8).enumerated()), id: \.element.id) { index, song in
                    SongRow(song: song, queue: Array(songs.prefix(8)), index: index)
                    if index < min(songs.count, 8) - 1 {
                        Divider().padding(.leading, 60)
                    }
                }
            }
            .padding(.vertical, 8)
        }
    }
}

struct AlbumShelf: View {
    let title: String
    let albums: [MusicAlbum]
    var body: some View {
        if !albums.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                Text(title).font(.title2.bold()).padding(.horizontal)
                ScrollView(.horizontal) {
                    LazyHStack(alignment: .top, spacing: 15) {
                        ForEach(albums) { album in
                            NavigationLink {
                                CollectionView(kind: .album, id: album.id)
                            } label: {
                                VStack(alignment: .leading, spacing: 6) {
                                    CoverArt(art: album.coverArt, size: 150, cornerRadius: 17)
                                    Text(album.name).font(.subheadline.weight(.semibold))
                                        .foregroundStyle(.primary).lineLimit(1)
                                    Text(album.artist ?? "Unknown artist")
                                        .font(.caption).foregroundStyle(.secondary)
                                        .lineLimit(1)
                                }
                                .frame(width: 150, alignment: .leading)
                            }
                            .buttonStyle(.plain)
                        }
                    }.padding(.horizontal)
                }
                .scrollIndicators(.hidden)
            }
        }
    }
}

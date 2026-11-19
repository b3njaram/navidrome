import SwiftUI
import MediaPlayer
import AVKit

/// Visual vocabulary inspired by the native iOS Music experience.
/// All icons are SF Symbols, all cover art comes from the user's own NAS.
/// Jobbi Music keeps its own identity, features, and server integration.
enum MusicAppearance {
    // iPhone-only palette: indigo navigation, turquoise discovery,
    // violet playlists, coral favorites, sky-blue weather and warm amber mixes.
    // Preserve system light/dark materials, legible typography, and album art.
    static let accent = Color(red: 0.38, green: 0.33, blue: 0.92)
    static let violet = Color(red: 0.55, green: 0.36, blue: 0.88)
    static let teal = Color(red: 0.04, green: 0.67, blue: 0.64)
    static let sky = Color(red: 0.16, green: 0.57, blue: 0.92)
    static let coral = Color(red: 0.96, green: 0.34, blue: 0.45)
    static let amber = Color(red: 0.90, green: 0.58, blue: 0.17)
    static let canvas = Color(uiColor: .systemBackground)
    static let secondaryCanvas = Color(uiColor: .secondarySystemGroupedBackground)
    static let separator = Color(uiColor: .separator).opacity(0.55)
    static let tileRadius: CGFloat = 13
}

/// Account controls are available from every primary tab, just as in Music.
/// The complete original SettingsView (including admin tools) remains intact.
struct MusicAccountButton: View {
    @EnvironmentObject private var api: JobbiAPI
    @AppStorage("jobbi.profileAvatarRevision") private var avatarRevision = 0
    @State private var showingAccount = false

    private var avatarURL: URL? {
        guard let username = api.user?.username, !username.isEmpty else { return nil }
        return api.url("/api/social/profiles/" + JobbiAPI.encode(username)
            + "/avatar?v=" + String(avatarRevision))
    }

    private var fallback: some View {
        Circle()
            .fill(LinearGradient(colors: [MusicAppearance.violet, MusicAppearance.teal],
                startPoint: .topLeading, endPoint: .bottomTrailing))
            .overlay {
                Text(String((api.user?.username ?? "J").prefix(1)).uppercased())
                    .font(.system(size: 15, weight: .semibold, design: .rounded))
                    .foregroundStyle(.white)
            }
    }

    var body: some View {
        Button { showingAccount = true } label: {
            AsyncImage(url: avatarURL) { image in
                image.resizable().scaledToFill()
            } placeholder: {
                fallback
            }
            .frame(width: 34, height: 34)
            .clipShape(Circle())
            .overlay { Circle().strokeBorder(Color.primary.opacity(0.14), lineWidth: 1) }
            .accessibilityHidden(true)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Your profile and account settings")
        .sheet(isPresented: $showingAccount) {
            NavigationStack {
                SettingsView()
                    .toolbar {
                        ToolbarItem(placement: .confirmationAction) {
                            Button("Done") { showingAccount = false }
                        }
                    }
            }
        }
    }
}

struct MusicSectionHeading: View {
    let title: String
    var subtitle: String? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(title)
                .font(.title2.weight(.bold))
                .tracking(-0.35)
                .foregroundStyle(.primary)
            if let subtitle {
                Text(subtitle)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct MusicListArtwork: View {
    let symbol: String
    var tint: Color = MusicAppearance.accent
    var size: CGFloat = 54

    var body: some View {
        RoundedRectangle(cornerRadius: max(9, size * 0.17), style: .continuous)
            .fill(
                LinearGradient(colors: [tint.opacity(0.96), tint.opacity(0.58)],
                               startPoint: .topLeading, endPoint: .bottomTrailing)
            )
            .overlay {
                Image(systemName: symbol)
                    .font(.system(size: size * 0.36, weight: .medium))
                    .foregroundStyle(.white)
            }
            .frame(width: size, height: size)
            .accessibilityHidden(true)
    }
}

struct MusicLibraryCategoryRow: View {
    let title: String
    let symbol: String

    private var color: Color {
        switch title {
        case "Favorite Songs": MusicAppearance.coral
        case "Downloaded", "Songs": MusicAppearance.teal
        case "Artists": MusicAppearance.amber
        case "Playlists", "Saved Music Imports": MusicAppearance.violet
        case "Albums": MusicAppearance.sky
        default: MusicAppearance.accent
        }
    }

    var body: some View {
        HStack(spacing: 15) {
            Image(systemName: symbol)
                .font(.system(size: 20, weight: .medium))
                .foregroundStyle(color)
                .frame(width: 29)
            Text(title)
                .font(.body.weight(.medium))
                .foregroundStyle(.primary)
            Spacer(minLength: 0)
        }
        .padding(.vertical, 5)
        .contentShape(Rectangle())
    }
}

struct MusicAlbumTile: View {
    let album: MusicAlbum
    var size: CGFloat = 156

    var body: some View {
        NavigationLink {
            CollectionView(kind: .album, id: album.id)
        } label: {
            VStack(alignment: .leading, spacing: 5) {
                CoverArt(art: album.coverArt, size: size, cornerRadius: MusicAppearance.tileRadius)
                Text(album.name)
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(1)
                    .foregroundStyle(.primary)
                Text(album.artist ?? "Unknown Artist")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            .frame(width: size, alignment: .leading)
        }
        .buttonStyle(.plain)
    }
}

struct MusicPlaybackActions: View {
    let play: () -> Void
    let shuffle: () -> Void
    var disabled = false

    var body: some View {
        HStack(spacing: 12) {
            Button(action: play) {
                Label("Play", systemImage: "play.fill")
                    .frame(maxWidth: .infinity, minHeight: 37)
            }
            .buttonStyle(.borderedProminent)
            .tint(MusicAppearance.accent)
            Button(action: shuffle) {
                Label("Shuffle", systemImage: "shuffle")
                    .frame(maxWidth: .infinity, minHeight: 37)
            }
            .buttonStyle(.bordered)
            .tint(MusicAppearance.teal)
        }
        .font(.subheadline.weight(.semibold))
        .disabled(disabled)
    }
}


/// Real system volume slider: unlike a decorative speaker glyph, it adjusts
/// the active audio route using Apple's own media volume control.
struct MusicSystemVolumeSlider: UIViewRepresentable {
    func makeUIView(context: Context) -> MPVolumeView {
        let view = MPVolumeView(frame: .zero)
        view.showsVolumeSlider = true
        view.showsRouteButton = false
        view.tintColor = .white
        return view
    }

    func updateUIView(_ uiView: MPVolumeView, context: Context) {}
}

/// Native AirPlay route sheet is available without custom audio routing.
struct MusicAirPlayControl: UIViewRepresentable {
    func makeUIView(context: Context) -> AVRoutePickerView {
        let view = AVRoutePickerView()
        view.tintColor = .white
        view.activeTintColor = .white
        view.prioritizesVideoDevices = false
        return view
    }

    func updateUIView(_ uiView: AVRoutePickerView, context: Context) {}
}

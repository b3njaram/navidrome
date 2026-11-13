import SwiftUI

/// Visual vocabulary inspired by the native iOS Music experience.
/// All icons are SF Symbols, all cover art comes from the user's own NAS.
/// Jobbi Music keeps its own identity, features, and server integration.
enum MusicAppearance {
    static let accent = Color(red: 0.98, green: 0.20, blue: 0.34)
    static let canvas = Color(uiColor: .systemBackground)
    static let secondaryCanvas = Color(uiColor: .secondarySystemGroupedBackground)
    static let separator = Color(uiColor: .separator).opacity(0.55)
    static let tileRadius: CGFloat = 13
}

/// Account controls are available from every primary tab, just as in Music.
/// The complete original SettingsView (including admin tools) remains intact.
struct MusicAccountButton: View {
    @EnvironmentObject private var api: JobbiAPI
    @State private var showingAccount = false

    var body: some View {
        Button { showingAccount = true } label: {
            ZStack {
                Circle()
                    .fill(MusicAppearance.accent.gradient)
                    .frame(width: 32, height: 32)
                Text(String((api.user?.username ?? "J").prefix(1)).uppercased())
                    .font(.system(size: 15, weight: .semibold, design: .rounded))
                    .foregroundStyle(.white)
            }
            .accessibilityHidden(true)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Account and Settings")
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

    var body: some View {
        HStack(spacing: 15) {
            Image(systemName: symbol)
                .font(.system(size: 20, weight: .medium))
                .foregroundStyle(MusicAppearance.accent)
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
            .tint(MusicAppearance.accent)
        }
        .font(.subheadline.weight(.semibold))
        .disabled(disabled)
    }
}

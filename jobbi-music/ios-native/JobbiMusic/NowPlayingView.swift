import SwiftUI

struct MiniPlayerView: View {
    @EnvironmentObject private var player: MusicPlayer
    let onOpen: () -> Void

    var body: some View {
        if let song = player.active {
            HStack(spacing: 11) {
                Button(action: onOpen) {
                    HStack(spacing: 11) {
                        CoverArt(art: song.coverArt, size: 42, cornerRadius: 9)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(song.title).font(.subheadline.bold()).lineLimit(1)
                            Text(song.artist).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                        }
                        Spacer(minLength: 0)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Open Now Playing for \(song.title)")
                Button { player.toggle() } label: {
                    Image(systemName: player.playing ? "pause.fill" : "play.fill")
                        .frame(width: 38, height: 38)
                }
                .accessibilityLabel(player.playing ? "Pause" : "Play")
                Button { player.next() } label: {
                    Image(systemName: "forward.end.fill")
                        .frame(width: 35, height: 38)
                }
                .accessibilityLabel("Next track")
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .glassEffect(.regular.interactive(), in: RoundedRectangle(cornerRadius: 23))
            .padding(.horizontal, 8)
        }
    }
}

struct NowPlayingView: View {
    @EnvironmentObject private var player: MusicPlayer
    @EnvironmentObject private var library: MusicLibrary
    @EnvironmentObject private var api: JobbiAPI
    @Environment(\.dismiss) private var dismiss
    @State private var dragging = false
    @State private var draggedValue = 0.0
    @State private var showingQueue = false
    @State private var showingLyrics = false
    @State private var lyrics: LyricsResponse?
    @State private var lyricsLoading = false
    @State private var lyricsError: String?

    var body: some View {
        NavigationStack {
            GeometryReader { geo in
                let artworkSize = min(geo.size.width - 50,
                                      max(236, geo.size.height * 0.40))
                ScrollView {
                    VStack(spacing: 16) {
                        HStack {
                            Button { dismiss() } label: {
                                Image(systemName: "chevron.down")
                                    .font(.system(size: 21, weight: .semibold))
                                    .frame(width: 44, height: 44, alignment: .leading)
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("Close Now Playing")
                            Spacer()
                            VStack(spacing: 2) {
                                Text("PLAYING FROM")
                                    .font(.caption2.weight(.semibold))
                                    .tracking(1.2)
                                    .foregroundStyle(.white.opacity(0.65))
                                Text("Your Library")
                                    .font(.subheadline.weight(.semibold))
                                    .lineLimit(1)
                            }
                            Spacer()
                            Menu {
                                if let song = player.active {
                                    Button {
                                        Task { await library.toggleFavorite(song, api: api) }
                                    } label: {
                                        Label("Toggle Favorite", systemImage: "heart")
                                    }
                                    Button {
                                        player.playNext(song)
                                    } label: {
                                        Label("Play Next", systemImage: "text.line.first.and.arrowtriangle.forward")
                                    }
                                }
                                Divider()
                                ForEach([15, 30, 45, 60], id: \.self) { minutes in
                                    Button("Pause in \(minutes) minutes") {
                                        player.setSleepTimer(minutes: minutes)
                                    }
                                }
                                Button("Cancel sleep timer") {
                                    player.setSleepTimer(minutes: 0)
                                }
                            } label: {
                                Image(systemName: player.sleepUntil == nil
                                      ? "ellipsis" : "moon.zzz.fill")
                                    .font(.system(size: 21, weight: .medium))
                                    .frame(width: 44, height: 44, alignment: .trailing)
                            }
                            .accessibilityLabel("More and Sleep Timer")
                        }
                        .foregroundStyle(.white)
                        .padding(.top, 5)

                        if let song = player.active {
                            Group {
                                if showingLyrics {
                                    LyricsPanel(lyrics: lyrics, loading: lyricsLoading,
                                        error: lyricsError, elapsed: player.elapsed)
                                } else {
                                    CoverArt(art: song.coverArt,
                                        size: artworkSize,
                                        cornerRadius: 12)
                                        .shadow(color: .black.opacity(0.33), radius: 25, y: 13)
                                        .accessibilityLabel("Cover of \(song.displayAlbum)")
                                }
                            }
                            .frame(width: artworkSize, height: artworkSize)
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                            .padding(.top, 5)

                            HStack(alignment: .center, spacing: 13) {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(song.title)
                                        .font(.title2.weight(.bold))
                                        .tracking(-0.35)
                                        .lineLimit(2)
                                    Text(song.artist)
                                        .font(.title3)
                                        .foregroundStyle(.white.opacity(0.75))
                                        .lineLimit(1)
                                }
                                Spacer(minLength: 10)
                                Button {
                                    Task { await library.toggleFavorite(song, api: api) }
                                } label: {
                                    Image(systemName: library.favorites.contains(where: { $0.id == song.id })
                                          ? "star.fill" : "star")
                                        .font(.system(size: 24, weight: .medium))
                                        .frame(width: 44, height: 44)
                                }
                                .buttonStyle(.plain)
                                .accessibilityLabel("Toggle Favorite")
                            }
                            .padding(.top, 4)

                            VStack(spacing: 3) {
                                Slider(value: Binding(
                                    get: { dragging ? draggedValue : player.elapsed },
                                    set: { draggedValue = $0; dragging = true }
                                ), in: 0...max(player.duration, 1), onEditingChanged: { editing in
                                    if !editing {
                                        player.seek(draggedValue)
                                        dragging = false
                                    }
                                })
                                .tint(.white)
                                HStack {
                                    Text(time(player.elapsed))
                                    Spacer()
                                    Text("-" + time(max(0, player.duration - player.elapsed)))
                                }
                                .font(.caption2.monospacedDigit())
                                .foregroundStyle(.white.opacity(0.66))
                            }

                            HStack(spacing: 24) {
                                Button { player.toggleShuffle() } label: {
                                    Image(systemName: "shuffle")
                                        .font(.system(size: 20))
                                        .foregroundStyle(player.shuffled
                                            ? MusicAppearance.accent : .white.opacity(0.77))
                                        .frame(width: 32, height: 62)
                                }
                                .accessibilityLabel("Shuffle")
                                Spacer(minLength: 0)
                                Button { player.previous() } label: {
                                    Image(systemName: "backward.end.fill")
                                        .font(.system(size: 32))
                                        .frame(width: 46, height: 70)
                                }
                                .accessibilityLabel("Previous")
                                Spacer(minLength: 0)
                                Button { player.toggle() } label: {
                                    Image(systemName: player.playing ? "pause.fill" : "play.fill")
                                        .font(.system(size: 45, weight: .semibold))
                                        .frame(width: 70, height: 70)
                                }
                                .accessibilityLabel(player.playing ? "Pause" : "Play")
                                Spacer(minLength: 0)
                                Button { player.next() } label: {
                                    Image(systemName: "forward.end.fill")
                                        .font(.system(size: 32))
                                        .frame(width: 46, height: 70)
                                }
                                .accessibilityLabel("Next")
                                Spacer(minLength: 0)
                                Button { player.repeatOne.toggle() } label: {
                                    Image(systemName: player.repeatOne ? "repeat.1" : "repeat")
                                        .font(.system(size: 20))
                                        .foregroundStyle(player.repeatOne
                                            ? MusicAppearance.accent : .white.opacity(0.77))
                                        .frame(width: 32, height: 62)
                                }
                                .accessibilityLabel(player.repeatOne ? "Repeat one" : "Repeat")
                            }
                            .buttonStyle(.plain)
                            .padding(.top, 2)

                            HStack(spacing: 14) {
                                Image(systemName: "speaker.fill")
                                    .font(.caption)
                                    .foregroundStyle(.white.opacity(0.65))
                                MusicSystemVolumeSlider()
                                    .frame(height: 28)
                                    .accessibilityLabel("Playback volume")
                                Image(systemName: "speaker.wave.3.fill")
                                    .font(.caption)
                                    .foregroundStyle(.white.opacity(0.65))
                            }
                            .padding(.top, 1)

                            HStack {
                                Button {
                                    showingLyrics.toggle()
                                    if showingLyrics { Task { await loadLyrics(for: song) } }
                                } label: {
                                    Image(systemName: showingLyrics
                                          ? "quote.bubble.fill" : "quote.bubble")
                                        .font(.system(size: 23))
                                        .foregroundStyle(showingLyrics
                                            ? .white : .white.opacity(0.7))
                                        .frame(width: 48, height: 48)
                                        .background(showingLyrics ? Color.white.opacity(0.18) : Color.clear,
                                                    in: Circle())
                                }
                                .buttonStyle(.plain)
                                .accessibilityLabel(showingLyrics ? "Hide lyrics" : "Show lyrics")
                                Spacer()
                                MusicAirPlayControl()
                                    .frame(width: 48, height: 48)
                                    .accessibilityLabel("AirPlay and audio output")
                                Spacer()
                                Button { showingQueue = true } label: {
                                    Image(systemName: "list.bullet")
                                        .font(.system(size: 23))
                                        .frame(width: 48, height: 48)
                                }
                                .buttonStyle(.plain)
                                .accessibilityLabel("Show Up Next queue")
                            }
                            .padding(.top, 1)
                        } else {
                            ContentUnavailableView("Nothing playing", systemImage: "music.note")
                        }
                    }
                    .foregroundStyle(.white)
                    .padding(.horizontal, 25)
                    .padding(.bottom, 34)
                    .frame(maxWidth: 530)
                    .frame(maxWidth: .infinity)
                }
                .scrollIndicators(.hidden)
                .background {
                    ZStack {
                        Color(red: 0.14, green: 0.13, blue: 0.17)
                        if let art = player.active?.coverArt, !art.isEmpty {
                            CoverArt(art: art, size: max(geo.size.width, geo.size.height) + 150,
                                     cornerRadius: 0)
                                .blur(radius: 74, opaque: true)
                                .saturation(1.18)
                                .opacity(0.66)
                        }
                        LinearGradient(
                            colors: [
                                Color.black.opacity(0.32),
                                Color.black.opacity(0.25),
                                Color.black.opacity(0.62)
                            ], startPoint: .top, endPoint: .bottom)
                    }
                    .ignoresSafeArea()
                    .accessibilityHidden(true)
                }
            }
            .task(id: player.active?.id) {
                if showingLyrics, let song = player.active {
                    await loadLyrics(for: song)
                }
            }
            .navigationBarHidden(true)
            .preferredColorScheme(.dark)
            .sheet(isPresented: $showingQueue) {
                NavigationStack {
                    List {
                        Section {
                            HStack {
                                Text("\(max(0, player.queue.count - player.currentIndex - 1)) upcoming tracks")
                                    .font(.subheadline).foregroundStyle(.secondary)
                                Spacer()
                                Button("Clear Upcoming", role: .destructive) {
                                    player.clearUpcoming()
                                }
                                .disabled(player.currentIndex >= player.queue.count - 1)
                            }
                        }
                        Section("Playback order") {
                            ForEach(Array(player.queue.enumerated()), id: \.offset) { index, song in
                                HStack(spacing: 9) {
                                    Button { player.jumpTo(index) } label: {
                                        HStack(spacing: 10) {
                                            CoverArt(art: song.coverArt, size: 44)
                                            VStack(alignment: .leading, spacing: 2) {
                                                Text(song.title).font(.subheadline.weight(.medium))
                                                    .foregroundStyle(.primary).lineLimit(1)
                                                Text(index == player.currentIndex ? "Now Playing" : song.artist)
                                                    .font(.caption).foregroundStyle(.secondary)
                                                    .lineLimit(1)
                                            }
                                            Spacer(minLength: 1)
                                        }
                                    }
                                    .buttonStyle(.plain)
                                    if index == player.currentIndex {
                                        Image(systemName: "waveform")
                                            .foregroundStyle(.pink)
                                            .accessibilityLabel("Now Playing")
                                    } else if index > player.currentIndex {
                                        Button {
                                            player.moveUpcoming(from: index, to: index - 1)
                                        } label: {
                                            Image(systemName: "chevron.up")
                                        }
                                        .disabled(index <= player.currentIndex + 1)
                                        .accessibilityLabel("Move \(song.title) up")
                                        Button {
                                            player.moveUpcoming(from: index, to: index + 1)
                                        } label: {
                                            Image(systemName: "chevron.down")
                                        }
                                        .disabled(index >= player.queue.count - 1)
                                        .accessibilityLabel("Move \(song.title) down")
                                        Button(role: .destructive) {
                                            player.removeUpcoming(at: index)
                                        } label: {
                                            Image(systemName: "xmark.circle")
                                        }
                                        .accessibilityLabel("Remove \(song.title) from queue")
                                    }
                                }
                            }
                        }
                    }
                    .navigationTitle("Up Next")
                    .toolbar {
                        ToolbarItem(placement: .confirmationAction) {
                            Button("Done") { showingQueue = false }
                        }
                    }
                }
            }
        }
    }

    private func loadLyrics(for song: Song) async {
        lyrics = nil
        lyricsError = nil
        lyricsLoading = true
        defer { lyricsLoading = false }
        do {
            let result: LyricsResponse = try await api.get(
                "/api/lyrics/" + JobbiAPI.encode(song.id))
            if player.active?.id == song.id {
                lyrics = result
            }
        } catch {
            if player.active?.id == song.id {
                lyricsError = error.localizedDescription
            }
        }
    }

    private func time(_ seconds: Double) -> String {
        let total = seconds.isFinite ? Int(max(0, seconds)) : 0
        return String(format: "%d:%02d", total / 60, total % 60)
    }
}


/// In-player lyrics replace only the artwork pane, not playback controls.
private struct LyricsPanel: View {
    let lyrics: LyricsResponse?
    let loading: Bool
    let error: String?
    let elapsed: Double

    private var activeLine: Int? {
        guard let lyrics, lyrics.synced else { return nil }
        return LyricsResponse.activeLine(in: lyrics.lines, seconds: elapsed)
    }

    var body: some View {
        Group {
            if loading {
                ProgressView("Loading lyrics…")
            } else if let error {
                ContentUnavailableView("Lyrics unavailable",
                    systemImage: "text.quote", description: Text(error))
            } else if let lyrics, lyrics.available && !lyrics.lines.isEmpty {
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 18) {
                            ForEach(Array(lyrics.lines.enumerated()), id: \.offset) { index, line in
                                Text(line.text)
                                    .font(.title3.weight(activeLine == index
                                        ? .bold : .medium))
                                    .foregroundStyle(activeLine == nil || activeLine == index
                                        ? .primary : .secondary)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .id(index)
                                    .accessibilityAddTraits(activeLine == index ? .isSelected : [])
                            }
                        }
                        .padding(24)
                    }
                    .onChange(of: activeLine) { _, index in
                        if let index {
                            withAnimation(.easeInOut(duration: 0.32)) {
                                proxy.scrollTo(index, anchor: .center)
                            }
                        }
                    }
                }
            } else {
                ContentUnavailableView("No lyrics found",
                    systemImage: "text.quote",
                    description: Text("This track has no lyrics available on your music server."))
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(.thinMaterial)
    }
}

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
            .glassEffect(.regular.interactive(), in: RoundedRectangle(cornerRadius: 21))
            .padding(.horizontal, 8)
            .simultaneousGesture(
                DragGesture(minimumDistance: 45).onEnded { value in
                    guard abs(value.translation.width) >
                        abs(value.translation.height) else { return }
                    if value.translation.width < 0 { player.next() }
                    else { player.previous() }
                }
            )
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
            GeometryReader { geometry in
                let contentWidth = min(max(geometry.size.width - 52, 1), 430)
                let artworkSize = min(contentWidth,
                                      max(180, geometry.size.height - 406),
                                      385)

                VStack(spacing: 0) {
                    topBar
                        .frame(height: 52)
                        .padding(.top, 5)

                    if let song = player.active {
                        Group {
                            if showingLyrics {
                                LyricsPanel(
                                    lyrics: lyrics,
                                    loading: lyricsLoading,
                                    error: lyricsError,
                                    elapsed: player.elapsed,
                                    onSeek: player.seek
                                )
                                .transition(.opacity)
                            } else {
                                VStack(spacing: 0) {
                                    Spacer(minLength: 12)
                                    CoverArt(
                                        art: song.coverArt,
                                        size: artworkSize,
                                        cornerRadius: 12
                                    )
                                    .shadow(
                                        color: .black.opacity(0.27),
                                        radius: 18, y: 10
                                    )
                                    .accessibilityLabel("Artwork for \(song.displayAlbum)")
                                    Spacer(minLength: 12)
                                }
                                .frame(maxWidth: .infinity, maxHeight: .infinity)
                                .transition(.opacity)
                            }
                        }
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .clipped()

                        playbackFooter(song)
                            .padding(.bottom, 12)
                    } else {
                        Spacer()
                        VStack(spacing: 14) {
                            Image(systemName: "music.note")
                                .font(.system(size: 52))
                            Text("Nothing Playing")
                                .font(.title2.weight(.semibold))
                        }
                        .foregroundStyle(.white.opacity(0.82))
                        Spacer()
                    }
                }
                .foregroundStyle(.white)
                .frame(maxWidth: 430)
                .padding(.horizontal, 26)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background {
                    ZStack {
                        Color(red: 0.19, green: 0.12, blue: 0.16)
                        if let art = player.active?.coverArt, !art.isEmpty {
                            CoverArt(
                                art: art,
                                size: max(geometry.size.width, geometry.size.height) + 150,
                                cornerRadius: 0
                            )
                            .blur(radius: 74, opaque: true)
                            .saturation(1.15)
                            .opacity(0.64)
                        }
                        LinearGradient(
                            colors: [
                                Color.black.opacity(0.21),
                                Color.black.opacity(0.18),
                                Color.black.opacity(0.56)
                            ],
                            startPoint: .top,
                            endPoint: .bottom
                        )
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


    /// A ZStack keeps the source label centered independent of the side buttons.
    private var topBar: some View {
        ZStack {
            VStack(spacing: 2) {
                Text("PLAYING FROM")
                    .font(.caption2.weight(.semibold))
                    .tracking(1.5)
                    .foregroundStyle(.white.opacity(0.61))
                Text("Your Library")
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(1)
            }
            .padding(.horizontal, 52)
            .accessibilityElement(children: .combine)

            HStack {
                Button { dismiss() } label: {
                    Image(systemName: "chevron.down")
                        .font(.system(size: 21, weight: .semibold))
                        .frame(width: 44, height: 44)
                }
                .accessibilityLabel("Close Now Playing")

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
                            Label("Play Next",
                                  systemImage: "text.line.first.and.arrowtriangle.forward")
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
                        .frame(width: 44, height: 44)
                }
                .accessibilityLabel("More and Sleep Timer")
            }
            .buttonStyle(.plain)
        }
        .frame(maxWidth: .infinity)
    }

    private func playbackFooter(_ song: Song) -> some View {
        VStack(spacing: 14) {
            HStack(spacing: 10) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(song.title)
                        .font(.title2.weight(.bold))
                        .tracking(-0.45)
                        .lineLimit(1)
                        .minimumScaleFactor(0.78)
                    Text(song.artist)
                        .font(.title3)
                        .foregroundStyle(.white.opacity(0.76))
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                Button {
                    Task { await library.toggleFavorite(song, api: api) }
                } label: {
                    Image(systemName:
                          library.favorites.contains(where: { $0.id == song.id })
                          ? "star.fill" : "star")
                        .font(.system(size: 23))
                        .foregroundStyle(.white.opacity(0.94))
                        .frame(width: 44, height: 48)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Toggle Favorite")
            }
            .frame(minHeight: 59)

            VStack(spacing: 1) {
                NowPlayingScrubber(
                    position: player.elapsed,
                    duration: player.duration,
                    onSeek: player.seek
                )
                HStack {
                    Text(time(player.elapsed))
                    Spacer(minLength: 8)
                    Text("-" + time(max(0, player.duration - player.elapsed)))
                }
                .font(.caption2.monospacedDigit())
                .foregroundStyle(.white.opacity(0.65))
            }

            HStack(spacing: 0) {
                Button { player.toggleShuffle() } label: {
                    Image(systemName: "shuffle")
                        .font(.system(size: 20))
                        .foregroundStyle(player.shuffled
                                         ? MusicAppearance.accent
                                         : .white.opacity(0.77))
                }
                .accessibilityLabel("Shuffle")
                .frame(maxWidth: .infinity)

                Button { player.previous() } label: {
                    Image(systemName: "backward.end.fill")
                        .font(.system(size: 30))
                }
                .accessibilityLabel("Previous")
                .frame(maxWidth: .infinity)

                Button { player.toggle() } label: {
                    Image(systemName: player.playing ? "pause.fill" : "play.fill")
                        .font(.system(size: 42, weight: .semibold))
                }
                .accessibilityLabel(player.playing ? "Pause" : "Play")
                .frame(maxWidth: .infinity)

                Button { player.next() } label: {
                    Image(systemName: "forward.end.fill")
                        .font(.system(size: 30))
                }
                .accessibilityLabel("Next")
                .frame(maxWidth: .infinity)

                Button { player.repeatOne.toggle() } label: {
                    Image(systemName: player.repeatOne ? "repeat.1" : "repeat")
                        .font(.system(size: 20))
                        .foregroundStyle(player.repeatOne
                                         ? MusicAppearance.accent
                                         : .white.opacity(0.77))
                }
                .accessibilityLabel(player.repeatOne ? "Repeat one" : "Repeat")
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.plain)
            .frame(height: 66)

            HStack(spacing: 11) {
                Image(systemName: "speaker.fill")
                    .font(.caption)
                    .foregroundStyle(.white.opacity(0.64))
                    .frame(width: 17)
                MusicSystemVolumeSlider()
                    .frame(maxWidth: .infinity)
                    .frame(height: 29)
                    .accessibilityLabel("Playback volume")
                Image(systemName: "speaker.wave.3.fill")
                    .font(.caption)
                    .foregroundStyle(.white.opacity(0.64))
                    .frame(width: 19)
            }
            .frame(height: 30)

            HStack(spacing: 0) {
                Button {
                    withAnimation(.easeInOut(duration: 0.25)) {
                        showingLyrics.toggle()
                    }
                    if showingLyrics { Task { await loadLyrics(for: song) } }
                } label: {
                    Image(systemName: showingLyrics
                          ? "quote.bubble.fill" : "quote.bubble")
                        .font(.system(size: 23))
                        .foregroundStyle(.white.opacity(showingLyrics ? 1 : 0.78))
                        .frame(width: 50, height: 49)
                        .background {
                            if showingLyrics {
                                Circle().fill(.white.opacity(0.19))
                            }
                        }
                }
                .accessibilityLabel(showingLyrics ? "Hide lyrics" : "Show lyrics")
                .frame(maxWidth: .infinity)

                MusicAirPlayControl()
                    .frame(width: 50, height: 49)
                    .accessibilityLabel("AirPlay and audio output")
                    .frame(maxWidth: .infinity)

                Button { showingQueue = true } label: {
                    Image(systemName: "list.bullet")
                        .font(.system(size: 23))
                        .foregroundStyle(.white.opacity(0.85))
                        .frame(width: 50, height: 49)
                }
                .accessibilityLabel("Show Up Next queue")
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.plain)
            .frame(height: 50)
        }
        .frame(maxWidth: .infinity)
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


/// A thin, centered progress track that doesn't display a giant system thumb.
/// Dragging previews the position and commits the seek when released.
private struct NowPlayingScrubber: View {
    let position: Double
    let duration: Double
    let onSeek: (Double) -> Void
    @State private var isScrubbing = false
    @State private var scrubPosition = 0.0

    private var validDuration: Double {
        duration.isFinite && duration > 0 ? duration : 0
    }

    private var progress: Double {
        guard validDuration > 0 else { return 0 }
        let current = isScrubbing ? scrubPosition : position
        return min(1, max(0, current / validDuration))
    }

    var body: some View {
        GeometryReader { geometry in
            let trackWidth = max(1, geometry.size.width)
            let thumbSize: CGFloat = isScrubbing ? 14 : 7

            ZStack(alignment: .leading) {
                Capsule()
                    .fill(.white.opacity(0.27))
                    .frame(height: 4)
                Capsule()
                    .fill(.white.opacity(0.94))
                    .frame(width: trackWidth * progress, height: 4)
                Circle()
                    .fill(.white)
                    .frame(width: thumbSize, height: thumbSize)
                    .offset(x: min(max(0, trackWidth * progress - thumbSize / 2),
                                   max(0, trackWidth - thumbSize)))
            }
            .frame(width: trackWidth, height: 25)
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { value in
                        guard validDuration > 0 else { return }
                        isScrubbing = true
                        scrubPosition = min(1, max(0, value.location.x / trackWidth))
                            * validDuration
                    }
                    .onEnded { value in
                        guard validDuration > 0 else { return }
                        let seek = min(1, max(0, value.location.x / trackWidth))
                            * validDuration
                        isScrubbing = false
                        onSeek(seek)
                    }
            )
            .accessibilityElement()
            .accessibilityLabel("Playback progress")
            .accessibilityValue(
                "\(Int(max(0, position))) of \(Int(validDuration)) seconds"
            )
            .accessibilityAdjustableAction { direction in
                guard validDuration > 0 else { return }
                switch direction {
                case .increment:
                    onSeek(min(validDuration, position + 10))
                case .decrement:
                    onSeek(max(0, position - 10))
                @unknown default:
                    break
                }
            }
        }
        .frame(height: 25)
    }
}

/// Full-height Apple Music-style lyrics: no boxed card, large readable type,
/// fade at the edges, synced-line highlighting and tap-to-seek where available.
/// Untimed lyrics remain fully readable and manually scrollable.
private struct LyricsPanel: View {
    let lyrics: LyricsResponse?
    let loading: Bool
    let error: String?
    let elapsed: Double
    let onSeek: (Double) -> Void

    private var activeLine: Int? {
        guard let lyrics, lyrics.synced else { return nil }
        return LyricsResponse.activeLine(in: lyrics.lines, seconds: elapsed)
    }

    var body: some View {
        Group {
            if loading {
                VStack(spacing: 14) {
                    ProgressView()
                        .tint(.white)
                    Text("Loading lyrics…")
                        .font(.subheadline)
                        .foregroundStyle(.white.opacity(0.72))
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let error {
                lyricsMessage("Lyrics unavailable", detail: error)
            } else if let lyrics, lyrics.available && !lyrics.lines.isEmpty {
                ScrollViewReader { proxy in
                    ScrollView(.vertical) {
                        LazyVStack(alignment: .leading, spacing: 25) {
                            ForEach(Array(lyrics.lines.enumerated()),
                                    id: \.offset) { index, line in
                                let selected = !lyrics.synced ||
                                    index == (activeLine ?? 0)
                                Button {
                                    guard lyrics.synced, let at = line.at else {
                                        return
                                    }
                                    onSeek(max(0, at / 1000))
                                } label: {
                                    Text(line.text.isEmpty ? "♪" : line.text)
                                        .font(.system(
                                            size: 30,
                                            weight: .bold,
                                            design: .rounded
                                        ))
                                        .tracking(-0.5)
                                        .multilineTextAlignment(.leading)
                                        .foregroundStyle(.white.opacity(
                                            selected ? 1 : 0.40
                                        ))
                                        .frame(
                                            maxWidth: .infinity,
                                            alignment: .leading
                                        )
                                        .contentShape(Rectangle())
                                }
                                .buttonStyle(.plain)
                                .accessibilityAddTraits(
                                    activeLine == index && lyrics.synced
                                        ? .isSelected : []
                                )
                                .accessibilityHint(
                                    lyrics.synced && line.at != nil
                                        ? "Double tap to jump to this lyric"
                                        : ""
                                )
                                .id(index)
                            }
                        }
                        .padding(.top, 32)
                        .padding(.bottom, 45)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .scrollIndicators(.hidden)
                    .mask {
                        LinearGradient(stops: [
                            .init(color: .clear, location: 0),
                            .init(color: .white, location: 0.07),
                            .init(color: .white, location: 0.87),
                            .init(color: .clear, location: 1)
                        ], startPoint: .top, endPoint: .bottom)
                    }
                    .onAppear {
                        if let activeLine {
                            proxy.scrollTo(activeLine, anchor: .center)
                        }
                    }
                    .onChange(of: activeLine) { _, current in
                        guard let current else { return }
                        withAnimation(.easeInOut(duration: 0.42)) {
                            proxy.scrollTo(current, anchor: .center)
                        }
                    }
                }
            } else {
                lyricsMessage(
                    "No lyrics available",
                    detail: "Lyrics for this song aren't on your music server."
                )
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func lyricsMessage(_ title: String, detail: String) -> some View {
        VStack(spacing: 13) {
            Image(systemName: "quote.bubble")
                .font(.system(size: 35))
                .foregroundStyle(.white.opacity(0.75))
            Text(title)
                .font(.title3.weight(.semibold))
                .foregroundStyle(.white)
            Text(detail)
                .font(.subheadline)
                .multilineTextAlignment(.center)
                .foregroundStyle(.white.opacity(0.7))
        }
        .padding(20)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

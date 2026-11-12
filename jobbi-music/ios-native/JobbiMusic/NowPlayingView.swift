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
                ScrollView {
                    VStack(spacing: 24) {
                        Spacer(minLength: 12)
                        if let song = player.active {
                            if showingLyrics {
                                LyricsPanel(lyrics: lyrics, loading: lyricsLoading,
                                    error: lyricsError, elapsed: player.elapsed)
                                    .frame(width: min(geo.size.width - 70, 380),
                                           height: min(geo.size.width - 70, 380))
                                    .clipShape(RoundedRectangle(cornerRadius: 24))
                            } else {
                                CoverArt(art: song.coverArt,
                                    size: min(geo.size.width - 70, 380), cornerRadius: 24)
                                    .shadow(color: .black.opacity(0.18), radius: 18, y: 12)
                                    .accessibilityLabel("Cover of \(song.displayAlbum)")
                            }
                            HStack(alignment: .center) {
                                VStack(alignment: .leading, spacing: 5) {
                                    Text(song.title).font(.title2.bold()).lineLimit(2)
                                    Text(song.artist).font(.title3).foregroundStyle(.secondary)
                                }
                                Spacer()
                                Button {
                                    Task { await library.toggleFavorite(song, api: api) }
                                } label: {
                                    Image(systemName: library.favorites.contains(where: { $0.id == song.id })
                                          ? "heart.fill" : "heart")
                                    .font(.title2)
                                }
                                .accessibilityLabel("Toggle Favorite")
                            }
                            VStack(spacing: 4) {
                                Slider(value: Binding(
                                    get: { dragging ? draggedValue : player.elapsed },
                                    set: { draggedValue = $0; dragging = true }
                                ), in: 0...max(player.duration, 1), onEditingChanged: { editing in
                                    if !editing {
                                        player.seek(draggedValue)
                                        dragging = false
                                    }
                                })
                                .tint(.pink)
                                HStack {
                                    Text(time(player.elapsed))
                                    Spacer()
                                    Text("-" + time(max(0, player.duration - player.elapsed)))
                                }
                                .font(.caption.monospacedDigit())
                                .foregroundStyle(.secondary)
                            }
                            HStack(spacing: 27) {
                                Button { player.toggleShuffle() } label: {
                                    Image(systemName: "shuffle")
                                        .foregroundStyle(player.shuffled ? .pink : .secondary)
                                }
                                Button { player.previous() } label: {
                                    Image(systemName: "backward.end.fill").font(.title2)
                                }
                                Button { player.toggle() } label: {
                                    Image(systemName: player.playing ? "pause.fill" : "play.fill")
                                        .font(.system(size: 25, weight: .bold))
                                        .frame(width: 76, height: 76)
                                }
                                .buttonStyle(.glassProminent)
                                Button { player.next() } label: {
                                    Image(systemName: "forward.end.fill").font(.title2)
                                }
                                Button { player.repeatOne.toggle() } label: {
                                    Image(systemName: player.repeatOne ? "repeat.1" : "repeat")
                                        .foregroundStyle(player.repeatOne ? .pink : .secondary)
                                }
                            }
                            .buttonStyle(.plain)
                            .accessibilityElement(children: .contain)
                            HStack {
                                Button {
                                    showingLyrics.toggle()
                                    if showingLyrics {
                                        Task { await loadLyrics(for: song) }
                                    }
                                } label: {
                                    Label("Lyrics", systemImage: showingLyrics
                                          ? "quote.bubble.fill" : "quote.bubble")
                                }
                                .tint(showingLyrics ? .pink : .primary)
                                .buttonStyle(.glass)
                                .accessibilityLabel(showingLyrics ? "Hide lyrics" : "Show lyrics")
                                Spacer()
                                Menu {
                                    ForEach([15, 30, 45, 60], id: \.self) { minutes in
                                        Button("Pause in \(minutes) minutes") {
                                            player.setSleepTimer(minutes: minutes)
                                        }
                                    }
                                    Button("Cancel sleep timer") {
                                        player.setSleepTimer(minutes: 0)
                                    }
                                } label: {
                                    Label(player.sleepUntil == nil ? "Sleep" : "Sleep on",
                                          systemImage: "moon.zzz")
                                }
                                .buttonStyle(.glass)
                                Spacer()
                                Button {
                                    showingQueue = true
                                } label: {
                                    Label("Queue \(max(0, player.queue.count - player.currentIndex - 1))",
                                          systemImage: "list.bullet")
                                }
                                .buttonStyle(.glass)
                            }
                        } else {
                            ContentUnavailableView("Nothing playing", systemImage: "music.note")
                        }
                    }
                    .padding(25)
                    .frame(maxWidth: 520)
                    .frame(maxWidth: .infinity)
                }
            }
            .background(Color(uiColor: .secondarySystemBackground))
            .task(id: player.active?.id) {
                if showingLyrics, let song = player.active {
                    await loadLyrics(for: song)
                }
            }
            .navigationTitle("Now Playing")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Done", systemImage: "chevron.down") { dismiss() }
                }
            }
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

import Foundation
import Combine
import AVFoundation
import MediaPlayer
import UIKit

@MainActor
final class MusicPlayer: ObservableObject {
    @Published private(set) var queue: [Song] = []
    @Published private(set) var currentIndex: Int = 0
    @Published private(set) var playing = false
    @Published private(set) var elapsed: Double = 0
    @Published private(set) var duration: Double = 0
    @Published private(set) var isUsingOriginalAudio = false
    @Published private(set) var isUsingOfflineAudio = false
    @Published var shuffled = false
    @Published var repeatOne = false
    @Published private(set) var sleepUntil: Date?
    @Published var error: String?

    private let avPlayer = AVPlayer()
    private var progressObserver: Any?
    private var endObserver: NSObjectProtocol?
    private var playbackGeneration = 0
    private var recoveryAttempted = false
    private var recoveringOriginal = false
    private weak var api: JobbiAPI?
    private weak var offline: OfflineLibrary?
    private var realListenSeconds: Double = 0
    private var lastTime: Date?
    private var submittedListen = false
    private var currentArtwork: MPMediaItemArtwork?
    private var artworkTask: Task<Void, Never>?
    private var artworkCache: [String: UIImage] = [:]

    #if DEBUG
    // The simulator parity test renders the real Now Playing view without
    // creating an AVPlayerItem or opening any NAS stream.
    func installVisualParityFixture(_ songs: [Song]) {
        queue = songs
        currentIndex = 0
        playing = false
        elapsed = 45
        duration = songs.first?.durationSeconds ?? 0
    }
    #endif

    var active: Song? { queue.indices.contains(currentIndex) ? queue[currentIndex] : nil }
    var hasMusic: Bool { active != nil }

    // Duration metadata may disagree with the real recording; only a large
    // verified early EOF should trigger recovery, never an ordinary last frame.
    static func endedTooEarly(at position: Double, catalog: Double, decoded: Double) -> Bool {
        guard position.isFinite, position > 5 else { return false }
        let stated = catalog.isFinite && catalog > 0 ? catalog : 0
        let actual = decoded.isFinite && decoded > 0 ? decoded : 0
        let expected = max(stated, actual)
        guard expected > 0 else { return false }
        return expected - position > max(7, min(18, expected * 0.04))
    }

    static func isCurrentEndEvent(_ item: AVPlayerItem, current: AVPlayerItem?) -> Bool {
        item === current
    }

    private static let originalSongPreferenceKey = "jobbi.ios.preferOriginalTracks"
    private func prefersOriginal(_ song: Song, api: JobbiAPI) -> Bool {
        let key = api.server + "|" + song.id
        return (UserDefaults.standard.stringArray(forKey: Self.originalSongPreferenceKey) ?? [])
            .contains(key)
    }

    /// Bypass a possibly faulty Navidrome MP3 transcode for this recording,
    /// without increasing bandwidth for every other listener or song.
    func restartUsingOriginalAudio() {
        guard let song = active, let api, !isUsingOfflineAudio else { return }
        let key = api.server + "|" + song.id
        var saved = UserDefaults.standard.stringArray(forKey: Self.originalSongPreferenceKey) ?? []
        saved.removeAll(where: { $0 == key })
        saved.append(key)
        UserDefaults.standard.set(Array(saved.suffix(256)), forKey: Self.originalSongPreferenceKey)
        playAt(currentIndex) // Explicit user action: restarting from the beginning is intentional.
    }

    var fraction: Double {
        guard duration > 0 else { return 0 }
        return min(1, max(0, elapsed / duration))
    }

    init() {
        progressObserver = avPlayer.addPeriodicTimeObserver(
            forInterval: CMTime(seconds: 0.5, preferredTimescale: 600),
            queue: .main) { [weak self] time in
                Task { @MainActor [weak self] in self?.tick(time) }
            }
        endObserver = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime, object: nil, queue: .main) { [weak self] notification in
                guard let endedItem = notification.object as? AVPlayerItem else { return }
                Task { @MainActor [weak self] in self?.finished(item: endedItem) }
            }
        let center = MPRemoteCommandCenter.shared()
        center.playCommand.addTarget { [weak self] _ in
            Task { @MainActor [weak self] in self?.resume() }
            return .success
        }
        center.pauseCommand.addTarget { [weak self] _ in
            Task { @MainActor [weak self] in self?.pause() }
            return .success
        }
        center.nextTrackCommand.addTarget { [weak self] _ in
            Task { @MainActor [weak self] in self?.next() }
            return .success
        }
        center.previousTrackCommand.addTarget { [weak self] _ in
            Task { @MainActor [weak self] in self?.previous() }
            return .success
        }
        center.changePlaybackPositionCommand.addTarget { [weak self] event in
            if let value = event as? MPChangePlaybackPositionCommandEvent {
                Task { @MainActor [weak self] in self?.seek(value.positionTime) }
                return .success
            }
            return .commandFailed
        }
    }

    func configure(api: JobbiAPI, offline: OfflineLibrary) {
        self.api = api
        self.offline = offline
    }

    func play(_ songs: [Song], from position: Int = 0) {
        guard !songs.isEmpty else { return }
        let index = min(max(position, 0), songs.count - 1)
        queue = shuffled
            ? Array(songs.prefix(index + 1)) + Array(songs.dropFirst(index + 1)).shuffled()
            : songs
        playAt(index)
    }

    private func playAt(_ index: Int) {
        guard queue.indices.contains(index), let api, let offline else { return }
        // Close out any qualified listen before changing recordings.
        submitIfQualified()
        playbackGeneration += 1
        recoveryAttempted = false
        recoveringOriginal = false
        currentIndex = index
        guard let song = active else { return }
        // Track changes must immediately discard old artwork, even if the
        // next cover is still downloading.
        artworkTask?.cancel()
        artworkTask = nil
        currentArtwork = nil
        realListenSeconds = 0
        lastTime = nil
        submittedListen = false
        elapsed = 0
        duration = song.durationSeconds
        error = nil
        let asset: AVURLAsset
        if let local = offline.localURL(for: song) {
            isUsingOfflineAudio = true
            isUsingOriginalAudio = true
            asset = AVURLAsset(url: local)
        } else {
            isUsingOfflineAudio = false
            let chosenQuality = prefersOriginal(song, api: api) ? "original"
                : (UserDefaults.standard.string(forKey: "jobbi.quality") ?? "balanced")
            isUsingOriginalAudio = chosenQuality == "original"
            guard let remote = api.url("/api/stream/" + JobbiAPI.encode(song.id)
                + "?quality=" + chosenQuality) else {
                error = "Cannot create a secure stream URL."
                return
            }
            let cookies = HTTPCookieStorage.shared.cookies(for: remote) ?? []
            // Documented Apple API; avoids unsupported HTTP header injection.
            asset = AVURLAsset(url: remote, options: [AVURLAssetHTTPCookiesKey: cookies])
        }
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default)
            try AVAudioSession.sharedInstance().setActive(true)
            avPlayer.replaceCurrentItem(with: AVPlayerItem(asset: asset))
            avPlayer.play()
            playing = true
            refreshNowPlaying()
            loadSystemArtwork(for: song, api: api)
        } catch {
            playing = false
            self.error = error.localizedDescription
        }
    }

    func pause() {
        accumulateTime()
        avPlayer.pause()
        playing = false
        submitIfQualified()
        refreshNowPlaying()
    }

    func resume() {
        guard active != nil, !recoveringOriginal else { return }
        avPlayer.play()
        playing = true
        lastTime = Date()
        refreshNowPlaying()
    }

    func toggle() { playing ? pause() : resume() }

    /// Manual additions are placed explicitly in playback order; duplicate
    /// tracks are legal, and the current recording is never interrupted.
    func playNext(_ song: Song) {
        guard !song.id.isEmpty else { return }
        if !hasMusic { play([song]); return }
        queue.insert(song, at: min(currentIndex + 1, queue.count))
    }

    func addToQueue(_ song: Song) {
        guard !song.id.isEmpty else { return }
        if !hasMusic { play([song]); return }
        queue.append(song)
    }

    func moveUpcoming(from: Int, to: Int) {
        guard from > currentIndex, to > currentIndex,
              queue.indices.contains(from), queue.indices.contains(to),
              from != to else { return }
        let selected = queue.remove(at: from)
        queue.insert(selected, at: to)
    }

    func removeUpcoming(at index: Int) {
        guard index > currentIndex, queue.indices.contains(index) else { return }
        queue.remove(at: index)
    }

    func clearUpcoming() {
        guard queue.indices.contains(currentIndex) else { return }
        queue = Array(queue.prefix(currentIndex + 1))
    }

    func jumpTo(_ index: Int) {
        guard queue.indices.contains(index) else { return }
        playAt(index)
    }

    func toggleShuffle() {
        if !shuffled, currentIndex + 1 < queue.count {
            queue = Array(queue.prefix(currentIndex + 1)) +
                Array(queue.dropFirst(currentIndex + 1)).shuffled()
        }
        shuffled.toggle()
    }

    func setSleepTimer(minutes: Int) {
        sleepUntil = minutes > 0 ? Date().addingTimeInterval(Double(minutes * 60)) : nil
    }

    func next() {
        if currentIndex + 1 < queue.count { playAt(currentIndex + 1) }
        else if repeatOne { playAt(currentIndex) }
        else { pause() }
    }
    func previous() {
        if elapsed > 4 { seek(0) }
        else if currentIndex > 0 { playAt(currentIndex - 1) }
        else { seek(0) }
    }
    func seek(_ seconds: Double) {
        guard seconds.isFinite, !recoveringOriginal else { return }
        accumulateTime()
        let target = max(0, min(seconds, duration > 0 ? duration : seconds))
        avPlayer.seek(to: CMTime(seconds: target, preferredTimescale: 600))
        elapsed = target
        lastTime = Date()
        refreshNowPlaying()
    }

    private func accumulateTime() {
        let now = Date()
        // Count actual AVPlayer playback only. Buffering, interruptions,
        // scrubbing and a paused app must not inflate weekly statistics.
        if playing, avPlayer.rate > 0, avPlayer.timeControlStatus == .playing,
           let lastTime {
            realListenSeconds += max(0, min(4, now.timeIntervalSince(lastTime)))
        }
        lastTime = now
    }

    static func listenThreshold(duration: Double) -> Double {
        duration > 0 ? min(240, max(5, duration / 2)) : 30
    }

    private func submitIfQualified() {
        guard !submittedListen, let active,
              realListenSeconds >= Self.listenThreshold(duration: duration),
              let api, api.user != nil else { return }
        submittedListen = true
        Task {
            do {
                try await api.send("/api/scrobble", json: [
                    "id": active.id, "source": "ios",
                    "timezoneOffsetMinutes": TimeZone.current.secondsFromGMT() / -60
                ])
            } catch {
                self.error = "Listen tracking unavailable: \(error.localizedDescription)"
            }
        }
    }

    private func tick(_ time: CMTime) {
        if let sleepUntil, Date() >= sleepUntil {
            self.sleepUntil = nil
            pause()
            return
        }
        accumulateTime()
        if recoveringOriginal { return } // Preserve the last real position until the seek verifies.
        if time.seconds.isFinite { elapsed = max(0, time.seconds) }
        let itemDuration = avPlayer.currentItem?.duration.seconds ?? 0
        if itemDuration.isFinite && itemDuration > 0 { duration = itemDuration }
        submitIfQualified()
        refreshNowPlaying()
    }

    private func finished(item: AVPlayerItem) {
        // Notifications for an old item can arrive after switching songs.
        // Never skip or repeat the new track because the old item finished.
        guard Self.isCurrentEndEvent(item, current: avPlayer.currentItem),
              !recoveringOriginal else { return }
        accumulateTime()
        submitIfQualified()
        let position = item.currentTime().seconds
        if Self.endedTooEarly(at: position,
                             catalog: active?.durationSeconds ?? 0,
                             decoded: item.duration.seconds) {
            if !isUsingOfflineAudio && !isUsingOriginalAudio && !recoveryAttempted {
                resumeOriginalAfterEarlyEnd(at: position)
                return
            }
            avPlayer.pause()
            playing = false
            error = "This recording ended early, even using its original audio. " +
                    "Check the source file on the NAS or try another copy."
            refreshNowPlaying()
            return
        }
        if repeatOne { playAt(currentIndex) }
        else { next() }
    }

    /// Use the raw recording after a prematurely finished transcode, but do not
    /// silently start it at zero. Resume only when the original asset reports
    /// enough duration and the seek actually lands at the requested timestamp.
    private func resumeOriginalAfterEarlyEnd(at position: Double) {
        guard let song = active, let api,
              let remote = api.url("/api/stream/" + JobbiAPI.encode(song.id) +
                                   "?quality=original") else {
            avPlayer.pause()
            playing = false
            error = "The stream ended early and original audio is unavailable."
            refreshNowPlaying()
            return
        }
        recoveryAttempted = true
        recoveringOriginal = true
        let generation = playbackGeneration
        let cookies = HTTPCookieStorage.shared.cookies(for: remote) ?? []
        let asset = AVURLAsset(url: remote, options: [AVURLAssetHTTPCookiesKey: cookies])
        let replacement = AVPlayerItem(asset: asset)
        avPlayer.pause()
        playing = false
        avPlayer.replaceCurrentItem(with: replacement)
        isUsingOriginalAudio = true
        refreshNowPlaying()

        Task { @MainActor [weak self] in
            do {
                let length = try await asset.load(.duration)
                guard let self, self.playbackGeneration == generation,
                      self.avPlayer.currentItem === replacement else { return }
                let realDuration = length.seconds
                guard realDuration.isFinite, realDuration > position + 1 else {
                    self.recoveringOriginal = false
                    self.error = "The original recording also ends too early, or its length " +
                                 "cannot be read. Check the NAS file."
                    self.refreshNowPlaying()
                    return
                }
                self.avPlayer.seek(
                    to: CMTime(seconds: position, preferredTimescale: 600),
                    toleranceBefore: .zero, toleranceAfter: .zero
                ) { completed in
                    Task { @MainActor [weak self] in
                        guard let self, self.playbackGeneration == generation,
                              self.avPlayer.currentItem === replacement else { return }
                        self.recoveringOriginal = false
                        let actualPosition = self.avPlayer.currentTime().seconds
                        if completed && actualPosition.isFinite &&
                           abs(actualPosition - position) <= 2.5 {
                            self.elapsed = actualPosition
                            self.duration = realDuration
                            self.error = nil
                            self.avPlayer.play()
                            self.playing = true
                        } else {
                            self.playing = false
                            self.error = "The original recording could not seek to the missing " +
                                         "part of the song. Playback was stopped to avoid restarting it."
                        }
                        self.refreshNowPlaying()
                    }
                }
            } catch {
                guard let self, self.playbackGeneration == generation,
                      self.avPlayer.currentItem === replacement else { return }
                self.recoveringOriginal = false
                self.error = "Cannot load the original recording: " + error.localizedDescription
                self.refreshNowPlaying()
            }
        }
    }

    /// The Lock Screen, Control Center and system Now Playing UI (including
    /// supported Dynamic Island layouts) use MPMediaItemPropertyArtwork.
    /// AsyncImage in SwiftUI doesn't publish images to those system surfaces.
    private func loadSystemArtwork(for song: Song, api: JobbiAPI) {
        guard let identifier = song.coverArt, !identifier.isEmpty,
              let url = api.url("/api/cover/" + JobbiAPI.encode(identifier)) else { return }
        let cacheKey = api.server + "|" + identifier
        if let cached = artworkCache[cacheKey] {
            currentArtwork = MPMediaItemArtwork(boundsSize: cached.size) { _ in cached }
            refreshNowPlaying()
            return
        }
        artworkTask = Task { [weak self] in
            do {
                var request = URLRequest(url: url)
                request.setValue("image/*", forHTTPHeaderField: "Accept")
                request.timeoutInterval = 20
                // URLSession shares the authenticated server's cookie store.
                let (data, response) = try await URLSession.shared.data(for: request)
                guard !Task.isCancelled,
                      let http = response as? HTTPURLResponse,
                      (200...299).contains(http.statusCode),
                      http.mimeType?.lowercased().hasPrefix("image/") == true,
                      data.count > 0, data.count <= 8_000_000,
                      let image = UIImage(data: data) else { return }
                guard let self, self.active?.id == song.id else { return }
                if self.artworkCache.count >= 40 { self.artworkCache.removeAll() }
                self.artworkCache[cacheKey] = image
                self.currentArtwork = MPMediaItemArtwork(boundsSize: image.size) { _ in image }
                self.refreshNowPlaying()
            } catch {
                // Missing or unavailable covers must not interrupt playback.
            }
        }
    }

    private func refreshNowPlaying() {
        guard let active else {
            MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
            return
        }
        var info: [String: Any] = [
            MPMediaItemPropertyTitle: active.title,
            MPMediaItemPropertyArtist: active.artist,
            MPMediaItemPropertyAlbumTitle: active.displayAlbum,
            MPMediaItemPropertyPlaybackDuration: duration,
            MPNowPlayingInfoPropertyElapsedPlaybackTime: elapsed,
            MPNowPlayingInfoPropertyPlaybackRate: playing ? 1.0 : 0.0
        ]
        if let currentArtwork {
            info[MPMediaItemPropertyArtwork] = currentArtwork
        }
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }

    func stop() {
        pause()
        artworkTask?.cancel()
        artworkTask = nil
        currentArtwork = nil
        playbackGeneration += 1
        recoveringOriginal = false
        queue = []
        currentIndex = 0
        avPlayer.replaceCurrentItem(with: nil)
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
    }
}

import Foundation
import Combine
import AVFoundation
import MediaPlayer

@MainActor
final class MusicPlayer: ObservableObject {
    @Published private(set) var queue: [Song] = []
    @Published private(set) var currentIndex: Int = 0
    @Published private(set) var playing = false
    @Published private(set) var elapsed: Double = 0
    @Published private(set) var duration: Double = 0
    @Published var shuffled = false
    @Published var repeatOne = false
    @Published private(set) var sleepUntil: Date?
    @Published var error: String?

    private let avPlayer = AVPlayer()
    private var progressObserver: Any?
    private var endObserver: NSObjectProtocol?
    private weak var api: JobbiAPI?
    private weak var offline: OfflineLibrary?
    private var realListenSeconds: Double = 0
    private var lastTime: Date?
    private var submittedListen = false

    var active: Song? { queue.indices.contains(currentIndex) ? queue[currentIndex] : nil }
    var hasMusic: Bool { active != nil }
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
            forName: .AVPlayerItemDidPlayToEndTime, object: nil, queue: .main) { [weak self] _ in
                Task { @MainActor [weak self] in self?.finished() }
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
        currentIndex = index
        guard let song = active else { return }
        realListenSeconds = 0
        lastTime = nil
        submittedListen = false
        elapsed = 0
        duration = song.durationSeconds
        error = nil
        let asset: AVURLAsset
        if let local = offline.localURL(for: song) {
            asset = AVURLAsset(url: local)
        } else {
            guard let remote = api.url("/api/stream/" + JobbiAPI.encode(song.id)
                + "?quality=" + (UserDefaults.standard.string(forKey: "jobbi.quality") ?? "balanced")) else {
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
        guard active != nil else { return }
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
        guard seconds.isFinite else { return }
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
        if time.seconds.isFinite { elapsed = max(0, time.seconds) }
        let itemDuration = avPlayer.currentItem?.duration.seconds ?? 0
        if itemDuration.isFinite && itemDuration > 0 { duration = itemDuration }
        submitIfQualified()
        refreshNowPlaying()
    }

    private func finished() {
        accumulateTime()
        submitIfQualified()
        if repeatOne { playAt(currentIndex) }
        else { next() }
    }

    private func refreshNowPlaying() {
        guard let active else {
            MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
            return
        }
        MPNowPlayingInfoCenter.default().nowPlayingInfo = [
            MPMediaItemPropertyTitle: active.title,
            MPMediaItemPropertyArtist: active.artist,
            MPMediaItemPropertyAlbumTitle: active.displayAlbum,
            MPMediaItemPropertyPlaybackDuration: duration,
            MPNowPlayingInfoPropertyElapsedPlaybackTime: elapsed,
            MPNowPlayingInfoPropertyPlaybackRate: playing ? 1.0 : 0.0
        ]
    }

    func stop() {
        pause()
        queue = []
        currentIndex = 0
        avPlayer.replaceCurrentItem(with: nil)
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
    }
}

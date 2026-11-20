import Foundation
import Combine
import UIKit
import CarPlay

/**
 CarPlay audio-category UI. Unlike the iPhone tab bar, CarPlay must display
 Apple-rendered driving-safe templates. The shared MusicPlayer provides the
 actual AVPlayer queue and MPNowPlayingInfoCenter / remote commands.

 The app needs Apple's CarPlay *audio* entitlement on its signing profile.
 An unsigned IPA or a free-team profile cannot make this code available on
 a physical vehicle without that capability.
 */
@MainActor
final class CarPlayMusicCoordinator: NSObject, CPNowPlayingTemplateObserver {
    static let shared = CarPlayMusicCoordinator()

    private var api: JobbiAPI?
    private var library: MusicLibrary?
    private var player: MusicPlayer?
    private var offline: OfflineLibrary?
    private weak var car: CPInterfaceController?
    private var homeTab: CPListTemplate?
    private var playlistTab: CPListTemplate?
    private var libraryTab: CPListTemplate?
    private var queueTab: CPListTemplate?
    private var observers = Set<AnyCancellable>()

    func install(api: JobbiAPI, library: MusicLibrary,
                 player: MusicPlayer, offline: OfflineLibrary) {
        self.api = api
        self.library = library
        self.player = player
        self.offline = offline
        observers.removeAll()
        player.$queue.sink { [weak self] _ in
            Task { @MainActor [weak self] in self?.updateQueue() }
        }.store(in: &observers)
        player.$currentIndex.sink { [weak self] _ in
            Task { @MainActor [weak self] in self?.updateQueue() }
        }.store(in: &observers)
        Task { await refresh() }
    }

    func connect(_ interfaceController: CPInterfaceController) {
        if api == nil {
            // CarPlay can start with no iPhone window. Bootstrap the same
            // shared player and restore the Keychain-backed account.
            let shared=JobbiSharedMusicServices.shared
            install(api:shared.api,library:shared.library,
                    player:shared.player,offline:shared.offline)
            Task { [weak self] in
                await shared.api.restore()
                await self?.refresh()
            }
        }
        car = interfaceController
        let home = CPListTemplate(title: "Home", sections: [section([
            status("Loading your music…")])])
        home.tabTitle = "Home"
        home.tabImage = UIImage(systemName: "house.fill")
        let playlists = CPListTemplate(title: "Playlists", sections: [
            section([status("Loading playlists…")])])
        playlists.tabTitle = "Playlists"
        playlists.tabImage = UIImage(systemName: "music.note.list")
        let library = CPListTemplate(title: "Library", sections: [
            section([status("Loading library…")])])
        library.tabTitle = "Library"
        library.tabImage = UIImage(systemName: "square.stack.fill")
        let queue = CPListTemplate(title: "Up Next", sections: [
            section([status("Nothing queued")])])
        queue.tabTitle = "Up Next"
        queue.tabImage = UIImage(systemName: "text.line.first.and.arrowtriangle.forward")
        homeTab = home
        playlistTab = playlists
        libraryTab = library
        queueTab = queue
        let tabs = CPTabBarTemplate(templates: [home,playlists,library,queue])
        interfaceController.setRootTemplate(tabs, animated: false)
        let now = CPNowPlayingTemplate.shared
        now.isUpNextButtonEnabled = true
        now.add(self)
        Task { await refresh() }
    }

    func disconnect() {
        CPNowPlayingTemplate.shared.remove(self)
        car = nil
        homeTab = nil
        playlistTab = nil
        libraryTab = nil
        queueTab = nil
    }

    private func status(_ text: String) -> CPListItem {
        CPListItem(text: text, detailText: nil)
    }

    private func section(_ rows: [CPListItem], title: String? = nil) -> CPListSection {
        CPListSection(items: rows, header: title, sectionIndexTitle: nil)
    }

    private func songItem(_ song: Song, in songs: [Song], at index: Int) -> CPListItem {
        let item = CPListItem(text: song.title, detailText: song.artist)
        item.handler = { [weak self] _, done in
            Task { @MainActor [weak self] in
                self?.player?.play(songs, from: index)
                self?.updateQueue()
                done()
            }
        }
        return item
    }

    private func playlistItem(_ playlist: MusicPlaylist) -> CPListItem {
        let count = playlist.songCount ?? 0
        let item = CPListItem(text: playlist.name,
                              detailText: count > 0 ? "\(count) songs" : "Playlist")
        item.handler = { [weak self] _, done in
            Task { @MainActor [weak self] in
                await self?.openPlaylist(playlist)
                done()
            }
        }
        return item
    }

    private func albumItem(_ album: MusicAlbum) -> CPListItem {
        let item = CPListItem(text: album.name, detailText: album.artist)
        item.handler = { [weak self] _, done in
            Task { @MainActor [weak self] in
                await self?.openAlbum(album)
                done()
            }
        }
        return item
    }

    private func action(_ text: String, details: String? = nil,
                        run: @escaping @MainActor () async -> Void) -> CPListItem {
        let item = CPListItem(text: text, detailText: details)
        item.handler = { _, done in
            Task { @MainActor in
                await run()
                done()
            }
        }
        return item
    }

    private func carPush(_ template: CPListTemplate) {
        car?.pushTemplate(template, animated: true)
    }

    private func showSongs(_ title: String, songs: [Song], page: Int = 0) {
        let batch = 35
        let start = page * batch
        guard start < songs.count else {
            carPush(CPListTemplate(title: title, sections: [
                section([status("No songs in this collection")])]))
            return
        }
        var rows: [CPListItem] = []
        for index in start..<min(start + batch, songs.count) {
            rows.append(songItem(songs[index], in: songs, at: index))
        }
        if start + batch < songs.count {
            rows.append(action("More Songs", details: "\(songs.count - start - batch) remaining") {
                [weak self] in self?.showSongs(title, songs: songs, page: page + 1)
            })
        }
        carPush(CPListTemplate(title: title, sections: [section(rows)]))
    }

    private func showPlaylists(page: Int = 0) {
        let available = library?.playlists ?? []
        let batch = 35
        let start = page * batch
        guard start < available.count else { return }
        var rows = (start..<min(start+batch,available.count))
            .map { playlistItem(available[$0]) }
        if start + batch < available.count {
            rows.append(action("More Playlists",
                details: "\(available.count - start - batch) remaining") {
                    [weak self] in self?.showPlaylists(page: page + 1)
                })
        }
        carPush(CPListTemplate(title: "Your Playlists",
            sections: [section(rows)]))
    }

    private func openPlaylist(_ playlist: MusicPlaylist) async {
        guard let api, api.user != nil else { return }
        do {
            let detail: CollectionDetail = try await api.get(
                "/api/playlists/" + JobbiAPI.encode(playlist.id))
            showSongs(playlist.name, songs: detail.tracks)
        } catch {
            carPush(CPListTemplate(title: playlist.name, sections: [
                section([status("Unable to load playlist. Reconnect on iPhone.")])]))
        }
    }

    private func openAlbum(_ album: MusicAlbum) async {
        guard let api, api.user != nil else { return }
        do {
            let detail: CollectionDetail = try await api.get(
                "/api/albums/" + JobbiAPI.encode(album.id))
            showSongs(album.name, songs: detail.tracks)
        } catch {
            carPush(CPListTemplate(title: album.name, sections: [
                section([status("Album unavailable while offline.")])]))
        }
    }

    private func queueSections() -> [CPListSection] {
        guard let player else { return [section([status("Open Jobbi Music to start listening")])] }
        let queue = player.queue
        guard queue.indices.contains(player.currentIndex) else {
            return [section([status("Nothing in the queue")])]
        }
        let current = player.currentIndex
        var result = [section([action("Now Playing",
            details: queue[current].title + " — " + queue[current].artist) {
                [weak self] in self?.showNowPlaying()
            }],title: "Playing")]
        let next = Array(queue.enumerated().dropFirst(current+1).prefix(75))
        if !next.isEmpty {
            let rows = next.map { index, song -> CPListItem in
                let item = CPListItem(text: song.title, detailText: song.artist)
                item.handler = { [weak self] _, done in
                    Task { @MainActor [weak self] in
                        self?.player?.jumpTo(index)
                        self?.updateQueue()
                        done()
                    }
                }
                return item
            }
            result.append(section(rows,title: "Up Next"))
        } else {
            result.append(section([status("No upcoming songs")],title:"Up Next"))
        }
        return result
    }

    private func updateQueue() {
        queueTab?.updateSections(queueSections())
    }

    private func showNowPlaying() {
        guard player?.hasMusic == true else { return }
        car?.pushTemplate(CPNowPlayingTemplate.shared, animated: true)
    }

    func nowPlayingTemplateUpNextButtonTapped(_ nowPlayingTemplate: CPNowPlayingTemplate) {
        carPush(CPListTemplate(title: "Up Next", sections: queueSections()))
    }

    func refresh() async {
        guard car != nil else { return }
        guard let api, let library, let offline else { return }

        // CarPlay must not reveal the previous listener's online content after
        // sign-out. Offline downloads are scoped by saved Keychain identity.
        let isOnline = api.user != nil
        if !isOnline, let remembered = CredentialVault.load() {
            offline.configure(server: remembered.server,
                              username: remembered.username)
        }
        if isOnline {
            await library.refresh(api: api)
        }
        let local = offline.songs.filter { offline.localURL(for: $0) != nil }
        let authenticated = isOnline || CredentialVault.load() != nil
        guard authenticated else {
            let signIn = [section([status("Sign in on your iPhone to see your music")])]
            homeTab?.updateSections(signIn)
            playlistTab?.updateSections(signIn)
            libraryTab?.updateSections(signIn)
            updateQueue()
            return
        }

        var home: [CPListSection] = []
        if let current = player?.active {
            home.append(section([action("Continue Listening",
                details: current.title + " — " + current.artist) {
                    [weak self] in self?.showNowPlaying()
                }],title:"Now Playing"))
        }
        if isOnline {
            let pinned = Array(library.playlists.prefix(15))
            if !pinned.isEmpty {
                var rows=pinned.map(playlistItem)
                if library.playlists.count>15 {
                    rows.append(action("All Playlists") { [weak self] in
                        self?.showPlaylists()
                    })
                }
                home.append(section(rows,title:"Your Playlists"))
            }
            if let tracks = library.recommendations?.recentTracks, !tracks.isEmpty {
                home.append(section(Array(tracks.prefix(15).enumerated())
                    .map { songItem($0.element,in:tracks,at:$0.offset) },
                    title:"Jump Back In"))
            }
            if let tracks = library.recommendations?.topWeek, !tracks.isEmpty {
                home.append(section([action("Play Most Played This Week",
                    details:"\(tracks.count) songs") { [weak self] in
                    self?.player?.play(tracks)
                    self?.updateQueue()
                }],title:"Most Played This Week"))
            }
            if let tracks = library.recommendations?.madeForYou, !tracks.isEmpty {
                home.append(section([action("Play Made for You",
                    details:"\(tracks.count) songs") { [weak self] in
                    self?.player?.play(tracks)
                    self?.updateQueue()
                }],title:"Made for You"))
            }
            if let tracks = library.recommendations?.timeMix, !tracks.isEmpty {
                home.append(section([action("Play Daily Mix",
                    details:"\(tracks.count) songs") { [weak self] in
                    self?.player?.play(tracks)
                    self?.updateQueue()
                }],title:"Daily Mix"))
            }
            if let albums = library.home?.recent, !albums.isEmpty {
                home.append(section(Array(albums.prefix(10)).map(albumItem),
                    title:"Recently Added"))
            }
        }
        if !local.isEmpty {
            home.append(section([action("Downloaded Music",
                details:"\(local.count) available offline") { [weak self] in
                self?.showSongs("Downloads",songs:local)
            }],title:"Offline"))
        }
        homeTab?.updateSections(home.isEmpty
            ? [section([status("Download music on your phone to listen here")])]
            : home)

        let playlistRows=Array(library.playlists.prefix(35)).map(playlistItem)
        var allRows=playlistRows
        if library.playlists.count>35 {
            allRows.append(action("More Playlists") { [weak self] in
                self?.showPlaylists(page: 1)
            })
        }
        playlistTab?.updateSections([section(allRows.isEmpty
            ? [status("No playlists yet")] : allRows)])
        var libraryRows:[CPListItem]=[]
        if isOnline {
            libraryRows.append(action("Liked Songs",
                details:"\(library.favorites.count) favorites") { [weak self] in
                self?.showSongs("Liked Songs",songs:library.favorites)
            })
            libraryRows.append(action("Albums",
                details:"\(library.albums.count) albums") { [weak self] in
                guard let self else {return}
                self.carPush(CPListTemplate(title:"Albums",sections:[
                    self.section(Array(self.library?.albums.prefix(35) ?? [])
                        .map(self.albumItem))]))
            })
        }
        libraryRows.append(action("Downloads",
            details:"\(local.count) offline tracks") { [weak self] in
            self?.showSongs("Downloads",songs:local)
        })
        libraryTab?.updateSections([section(libraryRows)])
        updateQueue()
    }
}

/** Must be instantiated by the CPTemplateApplicationScene CarPlay scene.
 Apple—not the app—renders the driving-safe templates and the now-playing UI.
 */
final class JobbiCarPlaySceneDelegate: UIResponder, CPTemplateApplicationSceneDelegate {
    func templateApplicationScene(_ templateApplicationScene: CPTemplateApplicationScene,
                                  didConnect interfaceController: CPInterfaceController) {
        Task { @MainActor in
            CarPlayMusicCoordinator.shared.connect(interfaceController)
        }
    }

    func templateApplicationScene(_ templateApplicationScene: CPTemplateApplicationScene,
                                  didDisconnect interfaceController: CPInterfaceController) {
        Task { @MainActor in
            CarPlayMusicCoordinator.shared.disconnect()
        }
    }
}

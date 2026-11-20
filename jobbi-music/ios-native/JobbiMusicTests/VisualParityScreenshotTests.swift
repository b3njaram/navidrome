import XCTest
import SwiftUI
import UIKit
@testable import JobbiMusic

// Uses the real SwiftUI screens with the same deterministic data as Android.
// No production server session is established and the test API rejects all
// network paths while the fixture flag is enabled.
private struct NativeParityTabHost: View {
    @EnvironmentObject private var player: MusicPlayer
    let selected: Int
    var body: some View {
        TabView(selection: .constant(selected)) {
            Tab("Home", systemImage: "house.fill", value: 0) {
                NavigationStack {
                    ListenNowView()
                        .toolbar {
                            ToolbarItem(placement: .topBarTrailing) { MusicAccountButton() }
                        }
                }
            }
            Tab("Community", systemImage: "person.2.fill", value: 1) {
                NavigationStack { CommunityView() }
            }
            Tab("Library", systemImage: "square.stack.fill", value: 2) {
                NavigationStack {
                    LibraryView()
                        .toolbar {
                            ToolbarItem(placement: .topBarTrailing) { MusicAccountButton() }
                        }
                }
            }
            Tab("Search", systemImage: "magnifyingglass", value: 3) {
                NavigationStack {
                    MusicSearchView()
                        .toolbar {
                            ToolbarItem(placement: .topBarTrailing) { MusicAccountButton() }
                        }
                }
            }
        }
        .tabBarMinimizeBehavior(.onScrollDown)
        // Exactly one player accessory, as in RootView. A duplicate modifier
        // distorted layout checks while still producing a green screenshot.
        .tabViewBottomAccessory(isEnabled: player.hasMusic) {
            MiniPlayerView(onOpen: {})
        }
    }
}

@MainActor
final class VisualParityScreenshotTests: XCTestCase {
    func testCaptureHomeLibrarySearchAndAccount() throws {
        #if DEBUG
        let api = JobbiAPI()
        api.installVisualParityFixture()
        let library = MusicLibrary()
        let player = MusicPlayer()
        let offline = OfflineLibrary()

        let homeData = Data("""
        {"recent":[{"id":"fixture-album","name":"Evening Sounds","artist":"Jobbi Studio"}],
         "featured":[{"id":"fixture-album-2","name":"New Horizons","artist":"Jobbi Studio"}],
         "played":[{"id":"fixture-album","name":"Evening Sounds","artist":"Jobbi Studio"}],
         "songs":[{"id":"fixture-track-1","title":"Sunset Drive","artist":"Jobbi Studio",
                   "album":"Evening Sounds","duration":213,"suffix":"flac"},
                  {"id":"fixture-track-2","title":"Ocean Lights","artist":"Jobbi Studio",
                   "album":"Evening Sounds","duration":198,"suffix":"flac"}],
         "playlists":[{"id":"fixture-playlist","name":"Evening Mix","songCount":2,"public":false}]}
        """.utf8)
        let home = try JSONDecoder().decode(HomeResponse.self, from: homeData)
        library.home = home
        library.albums = (home.recent ?? []) + (home.featured ?? [])
        library.playlists = home.playlists ?? []
        library.favorites = [home.songs![0]]
        player.installVisualParityFixture(home.songs ?? [])
        library.recommendations = try JSONDecoder().decode(Recommendations.self, from: Data("""
        {"recentTracks":[{"id":"fixture-track-2","title":"Ocean Lights","artist":"Jobbi Studio"}],
         "topWeek":[{"id":"fixture-track-1","title":"Sunset Drive","artist":"Jobbi Studio"}],
         "topMonth":[{"id":"fixture-track-2","title":"Ocean Lights","artist":"Jobbi Studio"}],
         "madeForYou":[{"id":"fixture-track-1","title":"Sunset Drive","artist":"Jobbi Studio"},
                       {"id":"fixture-track-2","title":"Ocean Lights","artist":"Jobbi Studio"}],
         "timeMix":[{"id":"fixture-track-2","title":"Ocean Lights","artist":"Jobbi Studio"}],
         "timeLabel":"Evening Mix",
         "weatherMix":[{"id":"fixture-track-1","title":"Sunset Drive","artist":"Jobbi Studio"}],
         "weatherLabel":"Weather Mix",
         "weather":{"city":"Test City","temperature":21,"condition":"clear"}}
        """.utf8))

        let pages: [(String, AnyView)] = [
            ("home", AnyView(NativeParityTabHost(selected: 0))),
            ("library", AnyView(NativeParityTabHost(selected: 2))),
            ("search", AnyView(NativeParityTabHost(selected: 3))),
            ("more", AnyView(NavigationStack { SettingsView() })),
            ("nowplaying", AnyView(NowPlayingView()))
        ]

        for (name, content) in pages {
            let view = content
                .environmentObject(api)
                .environmentObject(library)
                .environmentObject(player)
                .environmentObject(offline)
            let host = UIHostingController(rootView: AnyView(view))
            let bounds = CGRect(x: 0, y: 0, width: 390, height: 844)
            let scene = UIApplication.shared.connectedScenes
                .compactMap { $0 as? UIWindowScene }.first
            let window = scene.map { UIWindow(windowScene: $0) } ?? UIWindow(frame: bounds)
            window.frame = bounds
            window.rootViewController = host
            window.makeKeyAndVisible()
            host.view.frame = bounds
            host.view.setNeedsLayout()
            host.view.layoutIfNeeded()
            RunLoop.current.run(until: Date().addingTimeInterval(0.45))
            let renderer = UIGraphicsImageRenderer(bounds: bounds)
            var didRender = false
            let picture = renderer.image { _ in
                didRender = host.view.drawHierarchy(in: bounds,
                    afterScreenUpdates: true)
            }
            XCTAssertTrue(didRender, "Could not render iPhone screen: \(name)")
            XCTAssertGreaterThan(picture.pngData()?.count ?? 0, 1000,
                "Screenshot is empty: \(name)")
            let attachment = XCTAttachment(image: picture)
            attachment.name = "parity-ios-\(name)"
            attachment.lifetime = .keepAlways
            add(attachment)
            window.isHidden = true
        }
        #else
        throw XCTSkip("Visual parity fixture is only enabled in simulator Debug tests.")
        #endif
    }
}

import XCTest
import UIKit
@testable import JobbiMusic

@MainActor
final class JobbiMusicTests: XCTestCase {
    func testServerMustBeHTTPSAndPathFree() throws {
        XCTAssertEqual(try JobbiAPI.validateServer("https://music.jobbisoft.com.mx"),
                       "https://music.jobbisoft.com.mx")
        XCTAssertThrowsError(try JobbiAPI.validateServer("http://example.com"))
        XCTAssertThrowsError(try JobbiAPI.validateServer("https://example.com/private"))
        XCTAssertThrowsError(try JobbiAPI.validateServer("https://user:secret@example.com"))
        XCTAssertThrowsError(try JobbiAPI.validateServer("https://example.com?key=1"))
        XCTAssertTrue(JobbiAPI.encode("Julieta Venegas & más").contains("%20"))
        let api = JobbiAPI()
        XCTAssertNil(api.url("https://evil.example/api/star"))
        XCTAssertNil(api.url("/api/../admin"))
    }

    func testHomeAndWeeklyRecommendationFormats() throws {
        let home = try JSONDecoder().decode(HomeResponse.self, from: Data(
            """
            {"recent":[{"id":"al","name":"Limón","artist":"Julieta Venegas"}],
             "featured":[],"played":[],"songs":[{"id":"s1","title":"Algo está cambiando","artist":"Julieta Venegas","duration":220}],
             "playlists":[{"id":"p1","name":"Favorite songs","songCount":6,"public":false}]}
            """.utf8))
        XCTAssertEqual(home.recent?.first?.name, "Limón")
        XCTAssertEqual(home.songs?.first?.durationSeconds, 220)
        XCTAssertEqual(home.playlists?.first?.isPublic, false)

        let recommendations = try JSONDecoder().decode(Recommendations.self, from: Data(
            """
            {"topWeek":[{"id":"s1","title":"Song","artist":"Artist","playCount":4}],
             "topMonth":[],"madeForYou":[],"timeLabel":"Good Morning","timeMix":[],
             "weather":{"city":"Ciudad Juárez","temperature":19,"condition":"clear"}}
            """.utf8))
        XCTAssertEqual(recommendations.topWeek?.first?.playCount, 4)
        XCTAssertEqual(recommendations.weather?.city, "Ciudad Juárez")
    }

    func testSongAndPlaylistDetails() throws {
        let data = Data(
            """
            {"id":"pl1","name":"Mi música","owner":"listener","public":true,
             "entry":[{"id":"song1","title":"Test Track","artist":"Test Artist","suffix":"flac"}]}
            """.utf8)
        let playlist = try JSONDecoder().decode(CollectionDetail.self, from: data)
        XCTAssertEqual(playlist.title, "Mi música")
        XCTAssertEqual(playlist.tracks.count, 1)
        XCTAssertEqual(playlist.tracks.first?.suffix, "flac")
        XCTAssertEqual(playlist.isPublic, true)
    }

    func testSearchFlatteningValidatesAudioTypeAndDeduplicates() {
        let peers: [String: Any] = [
            "results": [
                ["username": "peer123",
                 "files": [
                    ["filename": "Music/Julieta - Algo Está Cambiando.flac", "size": 5000000],
                    ["filename": "Music/Julieta - Algo Está Cambiando.flac", "size": 5000000],
                    ["filename": "Music/malware.exe", "size": 950000],
                    ["filename": "Music/empty.mp3", "size": 24]
                 ]]
            ]
        ]
        let choices = MusicSearchView.extractPeerFiles(peers)
        XCTAssertEqual(choices.count, 1)
        XCTAssertEqual(choices.first?.fileFormat, "FLAC")
    }

    func testQualifiedListenDoesNotCountSkippedMusic() {
        XCTAssertEqual(MusicPlayer.listenThreshold(duration: 190), 95)
        XCTAssertEqual(MusicPlayer.listenThreshold(duration: 900), 240)
        XCTAssertEqual(MusicPlayer.listenThreshold(duration: 8), 5)
        XCTAssertEqual(MusicPlayer.listenThreshold(duration: 0), 30)
    }

    func testRealPhotoBecomesSmallJPEGForServer() throws {
        let size = CGSize(width: 1600, height: 1200)
        let png = UIGraphicsImageRenderer(size: size).image { ctx in
            UIColor.systemPink.setFill()
            ctx.fill(CGRect(origin: .zero, size: size))
            UIColor.systemIndigo.setFill()
            ctx.fill(CGRect(x: 50, y: 60, width: 480, height: 300))
        }.pngData()!
        let jpeg = try PhotoPreparation.jpeg(png)
        XCTAssertLessThanOrEqual(jpeg.count, 1_048_576)
        XCTAssertEqual(jpeg.prefix(3), Data([0xFF, 0xD8, 0xFF]))
        XCTAssertNotNil(UIImage(data: jpeg))
        XCTAssertThrowsError(try PhotoPreparation.jpeg(Data("not a photo".utf8)))
    }

    func testAVPlayerQueueEditsPreserveCurrentTrackAndAllowDuplicates() {
        func track(_ id: String) -> Song {
            Song(id: id, title: "Test \(id)", artist: "Artist", album: "Album",
                 coverArt: nil, albumId: nil, duration: 180,
                 suffix: "mp3", size: 5000, playCount: nil)
        }
        let player = MusicPlayer()
        player.play([track("a"), track("b"), track("c")])
        XCTAssertEqual(player.queue.map(\.id), ["a", "b", "c"])
        player.playNext(track("extra"))
        XCTAssertEqual(player.queue.map(\.id), ["a", "extra", "b", "c"])
        player.addToQueue(track("b"))
        XCTAssertEqual(player.queue.map(\.id), ["a", "extra", "b", "c", "b"])
        player.moveUpcoming(from: 4, to: 1)
        XCTAssertEqual(player.queue.map(\.id), ["a", "b", "extra", "b", "c"])
        player.removeUpcoming(at: 2)
        XCTAssertEqual(player.queue.map(\.id), ["a", "b", "b", "c"])
        player.removeUpcoming(at: 0)
        XCTAssertEqual(player.queue.first?.id, "a")
        player.clearUpcoming()
        XCTAssertEqual(player.queue.map(\.id), ["a"])
        player.stop()
    }

    func testOfflineFileHeadersUsePlayableExtensions() {
        XCTAssertEqual(OfflineLibrary.audioExtension(header: Data("fLaCxxxxsample".utf8),
            declared: "mp3"), "flac")
        XCTAssertEqual(OfflineLibrary.audioExtension(header: Data("ID3xxxxsample".utf8),
            declared: "mp3"), "mp3")
        XCTAssertEqual(OfflineLibrary.audioExtension(header: Data("OggSxxxxsample".utf8),
            declared: "opus"), "ogg")
        XCTAssertNil(OfflineLibrary.audioExtension(
            header: Data("{\"error\":\"not signed in\"}".utf8), declared: nil))
        XCTAssertNil(OfflineLibrary.audioExtension(
            header: Data("<html>Login required</html>".utf8), declared: nil))
    }

    func testServerRemovalReferencesHidePrivatePlaylistNames() throws {
        let impact = try JSONDecoder().decode(RemovalImpact.self, from: Data(
            """
            {"ticket":"signed-check-ticket","confirmation":"REMOVE_FROM_SHARED_LIBRARY",
             "referenceCount":2,"hiddenPrivateCount":1,"incompleteScope":true,
             "references":[
               {"id":"p1","name":"My Mix","owner":"me","own":true,"restricted":false},
               {"id":null,"name":null,"owner":null,"own":false,"restricted":true}]}
            """.utf8))
        XCTAssertEqual(impact.references.count, 2)
        XCTAssertEqual(impact.references[0].safeDescription, "Your playlist: My Mix")
        XCTAssertEqual(impact.references[1].safeDescription,
                       "Another user's private playlist (name hidden)")
    }

    func testInvidiousFallbackAndAdminResponsesDecode() throws {
        let result = try JSONDecoder().decode(InvidiousSearchResponse.self, from: Data(
            """
            {"available":true,"results":[{"videoId":"v123456789A",
             "title":"Example track","artist":"Example channel","duration":180}]}
            """.utf8))
        XCTAssertEqual(result.results?.first?.title, "Example track")
        let status = try JSONDecoder().decode(InvidiousImportStatus.self,
            from: Data(#"{"configured":true,"importEnabled":false}"#.utf8))
        XCTAssertEqual(status.importEnabled, false)
        let admin = try JSONDecoder().decode(AdminOverview.self,
            from: Data(#"{"usersCount":3,"indexedSongs":120,"storage":{"status":"ready","files":98}}"#.utf8))
        XCTAssertEqual(admin.storage?.files, 98)
    }

}

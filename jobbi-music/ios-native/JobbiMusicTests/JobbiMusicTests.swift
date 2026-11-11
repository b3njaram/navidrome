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
}

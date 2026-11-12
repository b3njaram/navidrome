import Foundation

struct Song: Codable, Identifiable, Hashable {
    let id: String
    var title: String
    var artist: String
    var album: String?
    var coverArt: String?
    var albumId: String?
    var duration: Double?
    var suffix: String?
    var size: Int64?
    var playCount: Int?

    var displayAlbum: String { album ?? "Unknown album" }
    var durationSeconds: Double { duration ?? 0 }
}

struct MusicAlbum: Codable, Identifiable, Hashable {
    let id: String
    var name: String
    var artist: String?
    var coverArt: String?
    var songCount: Int?
}

struct MusicPlaylist: Codable, Identifiable, Hashable {
    let id: String
    var name: String
    var songCount: Int?
    var isPublic: Bool?
    var owner: String?
    enum CodingKeys: String, CodingKey {
        case id, name, songCount, owner
        case isPublic = "public"
    }
}

struct CollectionDetail: Decodable {
    let id: String?
    let name: String?
    let artist: String?
    let owner: String?
    let isPublic: Bool?
    let song: [Song]?
    let entry: [Song]?
    enum CodingKeys: String, CodingKey {
        case id, name, artist, owner, song, entry
        case isPublic = "public"
    }
    var tracks: [Song] { song ?? entry ?? [] }
    var title: String { name ?? "Collection" }
}

struct HomeResponse: Decodable {
    let recent: [MusicAlbum]?
    let featured: [MusicAlbum]?
    let played: [MusicAlbum]?
    let songs: [Song]?
    let playlists: [MusicPlaylist]?
}

struct SearchResponse: Decodable {
    let song: [Song]?
    let album: [MusicAlbum]?
}

struct StarredResponse: Decodable {
    let song: [Song]?
    let album: [MusicAlbum]?
}

struct RecommendationWeather: Decodable {
    let city: String
    let temperature: Double?
    let condition: String?
}

struct Recommendations: Decodable {
    let recentTracks: [Song]?
    let topWeek: [Song]?
    let topMonth: [Song]?
    let madeForYou: [Song]?
    let timeMix: [Song]?
    let timeLabel: String?
    let weatherMix: [Song]?
    let weatherLabel: String?
    let weather: RecommendationWeather?
    let weatherError: String?
    let trackingAvailable: Bool?
    let trackingNote: String?
}

struct UserSession: Codable {
    let username: String
    let admin: Bool
    let csrfToken: String
}

struct PlaylistMutation: Decodable {
    let playlist: CollectionDetail?
}

struct CreatePlaylistResponse: Decodable {
    let playlist: MusicPlaylist
}

struct SocialPerson: Codable, Identifiable {
    var username: String
    var display_name: String?
    var bio: String?
    var discoverable: Bool?
    var has_avatar: Bool?
    var blend_opt_in: Bool?
    var id: String { username }
    var displayName: String { display_name ?? username }
}

struct SocialPlaylist: Codable, Identifiable {
    let id: String
    var title: String
    var owner: String?
    var visibility: String?
    var description: String?
    var song_count: Int?
}

struct SocialOverview: Decodable {
    let me: SocialPerson?
    let friends: [SocialPerson]?
    let incoming: [SocialPerson]?
    let outgoing: [SocialPerson]?
    let playlists: [SocialPlaylist]?
    let discover: [SocialPlaylist]?
}

struct SocialProfile: Decodable {
    let profile: SocialPerson
    let playlists: [SocialPlaylist]?
}

struct SocialPlaylistDetail: Decodable {
    let playlist: SocialPlaylist
    let tracks: [SocialTrack]?
}

struct SocialTrack: Decodable, Identifiable {
    let id: String
    let track_id: String
    let title: String
    let artist: String?
    let album: String?
    let cover_art: String?
    let duration: Double?
    var song: Song {
        Song(id: track_id, title: title, artist: artist ?? "Unknown artist",
             album: album, coverArt: cover_art, albumId: nil,
             duration: duration, suffix: nil, size: nil, playCount: nil)
    }
}

struct SoulseekStatus: Decodable {
    let configured: Bool?
    let serverConnected: Bool?
    let message: String?
}

struct SoulseekFile: Identifiable, Hashable {
    let username: String
    let filename: String
    let size: Int64
    var id: String { username + "|" + filename }
    var fileFormat: String { filename.split(separator: ".").last.map(String.init)?.uppercased() ?? "" }
    var displayName: String {
        filename.split(whereSeparator: { $0 == "/" || $0 == "\\" }).last.map(String.init) ?? filename
    }
}

struct SongImportReply: Decodable {
    let queued: Bool?
    let status: String?
    let message: String?
}


struct InvidiousVideo: Decodable, Identifiable {
    let videoId: String
    let title: String
    let artist: String?
    let duration: Double?
    let url: String?
    let thumbnail: String?
    var id: String { videoId }
}

struct InvidiousSearchResponse: Decodable {
    let available: Bool?
    let instance: String?
    let message: String?
    let results: [InvidiousVideo]?
}

struct InvidiousImportStatus: Decodable {
    let configured: Bool?
    let importEnabled: Bool?
    let message: String?
}

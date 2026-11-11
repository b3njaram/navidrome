import SwiftUI

@main
struct JobbiMusicApp: App {
    @StateObject private var api = JobbiAPI()
    @StateObject private var library = MusicLibrary()
    @StateObject private var player = MusicPlayer()
    @StateObject private var offline = OfflineLibrary()

    var body: some Scene {
        WindowGroup {
            RootView(api: api, library: library, player: player, offline: offline)
                .environmentObject(api)
                .environmentObject(library)
                .environmentObject(player)
                .environmentObject(offline)
                .tint(.pink)
        }
    }
}

@MainActor
final class MusicLibrary: ObservableObject {
    @Published var home: HomeResponse?
    @Published var recommendations: Recommendations?
    @Published var albums: [MusicAlbum] = []
    @Published var playlists: [MusicPlaylist] = []
    @Published var favorites: [Song] = []
    @Published var busy = false
    @Published var message: String?

    func refresh(api: JobbiAPI) async {
        guard api.user != nil else { return }
        busy = true
        defer { busy = false }
        do {
            async let homeReq: HomeResponse = api.get("/api/home")
            async let favoritesReq: StarredResponse = api.get("/api/starred")
            async let albumsReq: AlbumDirectory = api.get("/api/library/albums?offset=0&size=100")
            async let playlistsReq: [MusicPlaylist] = api.get("/api/playlists")
            home = try await homeReq
            favorites = try await favoritesReq.song ?? []
            albums = try await albumsReq.albums
            playlists = try await playlistsReq
        } catch { message = error.localizedDescription }
        await refreshRecommendations(api: api)
    }

    func refreshRecommendations(api: JobbiAPI) async {
        guard api.user != nil else { return }
        let city = UserDefaults.standard.string(forKey: "jobbi.weatherCity") ?? ""
        let offset = TimeZone.current.secondsFromGMT() / -60
        let query = "/api/recommendations?timezoneOffsetMinutes=\(offset)"
            + (city.isEmpty ? "" : "&city=" + JobbiAPI.encode(city))
        do { recommendations = try await api.get(query) }
        catch { message = "Recommendations unavailable: \(error.localizedDescription)" }
    }

    func toggleFavorite(_ song: Song, api: JobbiAPI) async {
        let add = !favorites.contains(where: { $0.id == song.id })
        do {
            try await api.send("/api/star", json: ["id": song.id, "starred": add])
            if add { favorites.append(song) }
            else { favorites.removeAll(where: { $0.id == song.id }) }
        } catch { message = error.localizedDescription }
    }

    func addToPlaylist(_ song: Song, playlist: MusicPlaylist, api: JobbiAPI) async {
        do {
            try await api.send("/api/playlists/" + JobbiAPI.encode(playlist.id),
                method: "PATCH", json: ["addSongId": song.id])
            message = "Added to \(playlist.name)."
        } catch { message = error.localizedDescription }
    }
}

struct AlbumDirectory: Decodable {
    let albums: [MusicAlbum]
}

struct RootView: View {
    @ObservedObject var api: JobbiAPI
    @ObservedObject var library: MusicLibrary
    @ObservedObject var player: MusicPlayer
    @ObservedObject var offline: OfflineLibrary
    @State private var restoring = true
    @State private var selectedTab = 0
    @State private var showingPlayer = false
    @State private var offlineOnly = false

    var body: some View {
        Group {
            if restoring {
                ProgressView("Restoring secure session…")
            } else if api.user == nil {
                if offlineOnly {
                    NavigationStack {
                        OfflineView()
                            .toolbar {
                                ToolbarItem(placement: .topBarTrailing) {
                                    Button("Sign in") {
                                        player.stop()
                                        offlineOnly = false
                                    }
                                }
                            }
                    }
                    .safeAreaInset(edge: .bottom) {
                        if player.hasMusic {
                            MiniPlayerView(onOpen: { showingPlayer = true })
                                .padding(.horizontal, 10)
                        }
                    }
                    .sheet(isPresented: $showingPlayer) {
                        NowPlayingView().presentationDragIndicator(.visible)
                    }
                } else {
                    LoginView(onSuccess: {
                        offlineOnly = false
                        await initializeSession()
                    }, onOffline: {
                        guard let remembered = CredentialVault.load() else { return }
                        offline.configure(server: remembered.server,
                            username: remembered.username)
                        offlineOnly = true
                    })
                }
            } else {
                TabView(selection: $selectedTab) {
                    Tab("Listen Now", systemImage: "house.fill", value: 0) {
                        NavigationStack { ListenNowView() }
                    }
                    Tab("Search", systemImage: "magnifyingglass", value: 1) {
                        NavigationStack { MusicSearchView() }
                    }
                    Tab("Library", systemImage: "square.stack.fill", value: 2) {
                        NavigationStack { LibraryView() }
                    }
                    Tab("Community", systemImage: "person.2.fill", value: 3) {
                        NavigationStack { CommunityView() }
                    }
                    Tab("Settings", systemImage: "gearshape.fill", value: 4) {
                        NavigationStack { SettingsView() }
                    }
                }
                .tabBarMinimizeBehavior(.onScrollDown)
                .tabViewBottomAccessory(isEnabled: player.hasMusic) {
                    MiniPlayerView(onOpen: { showingPlayer = true })
                }
                .sheet(isPresented: $showingPlayer) {
                    NowPlayingView()
                        .presentationDragIndicator(.visible)
                }
                .alert("Jobbi Music", isPresented: Binding(
                    get: { library.message != nil },
                    set: { if !$0 { library.message = nil } }
                )) {
                    Button("OK") { library.message = nil }
                } message: { Text(library.message ?? "") }
            }
        }
        .task {
            player.configure(api: api, offline: offline)
            await api.restore()
            if api.user != nil { await initializeSession() }
            restoring = false
        }
    }

    private func initializeSession() async {
        if let username = api.user?.username {
            offline.configure(server: api.server, username: username)
            await library.refresh(api: api)
        }
    }
}

struct LoginView: View {
    @EnvironmentObject private var api: JobbiAPI
    let onSuccess: () async -> Void
    let onOffline: () -> Void
    @State private var server = UserDefaults.standard.string(forKey: "jobbi.server")
        ?? "https://music.jobbisoft.com.mx"
    @State private var username = ""
    @State private var password = ""
    @State private var remember = true
    @State private var working = false
    @FocusState private var focused: Bool

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    Spacer(minLength: 56)
                    Image(systemName: "music.note.house.fill")
                        .font(.system(size: 56, weight: .medium))
                        .foregroundStyle(.pink)
                        .frame(maxWidth: .infinity)
                        .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Your music. Your place.")
                            .font(.largeTitle.bold())
                        Text("Stream your private music library in a native iPhone experience.")
                            .foregroundStyle(.secondary)
                    }
                    VStack(spacing: 16) {
                        TextField("HTTPS music server", text: $server)
                            .textInputAutocapitalization(.never)
                            .keyboardType(.URL)
                            .textContentType(.URL)
                            .autocorrectionDisabled()
                        TextField("Username", text: $username)
                            .textInputAutocapitalization(.never)
                            .textContentType(.username)
                            .autocorrectionDisabled()
                        SecureField("Password", text: $password)
                            .textContentType(.password)
                            .focused($focused)
                        Toggle("Keep me signed in securely", isOn: $remember)
                            .font(.subheadline)
                    }
                    .padding()
                    .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 22))
                    Button {
                        Task {
                            working = true
                            do {
                                try await api.login(username: username,
                                    password: password, server: server, remember: remember)
                                await onSuccess()
                            } catch { api.error = error.localizedDescription }
                            working = false
                        }
                    } label: {
                        HStack {
                            if working { ProgressView().tint(.white) }
                            Text(working ? "Signing in…" : "Listen now")
                            Image(systemName: "arrow.right")
                        }
                        .frame(maxWidth: .infinity, minHeight: 54)
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(working || username.isEmpty || password.isEmpty)
                    if CredentialVault.load() != nil {
                        Button(action: onOffline) {
                            Label("Listen to downloaded music offline",
                                  systemImage: "arrow.down.to.line.compact")
                        }
                        .buttonStyle(.bordered)
                    }
                    if let error = api.error {
                        Label(error, systemImage: "exclamationmark.triangle")
                            .font(.footnote)
                            .foregroundStyle(.red)
                            .accessibilityAddTraits(.updatesFrequently)
                    }
                    Text("Credentials go only to the HTTPS server you choose. Remembered sign-ins are stored in iOS Keychain.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                .padding(24)
                .frame(maxWidth: 560)
                .frame(maxWidth: .infinity)
            }
            .scrollDismissesKeyboard(.interactively)
            .background(Color(uiColor: .systemGroupedBackground))
        }
    }
}

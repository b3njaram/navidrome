import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var api: JobbiAPI
    @EnvironmentObject private var library: MusicLibrary
    @EnvironmentObject private var player: MusicPlayer
    @EnvironmentObject private var offline: OfflineLibrary
    @AppStorage("jobbi.quality") private var quality = "balanced"
    @AppStorage("jobbi.weatherCity") private var weatherCity = ""
    @State private var signingOut = false

    var body: some View {
        Form {
            Section("Account") {
                LabeledContent("Signed in as", value: api.user?.username ?? "")
                LabeledContent("Server", value: api.server)
                    .lineLimit(2)
                    .textSelection(.enabled)
                LabeledContent("Role", value: api.user?.admin == true
                    ? "Administrator" : "Listener")
            }
            if api.user?.admin == true {
                Section("Server administration") {
                    NavigationLink {
                        AdminDashboardView()
                    } label: {
                        Label("Admin Console", systemImage: "server.rack")
                            .fontWeight(.semibold)
                    }
                    Text("NAS storage, user management, library rescans and import configuration.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
            }
            Section {
                Picker("Streaming quality", selection: $quality) {
                    Text("Original / Lossless").tag("original")
                    Text("High quality · 320 kbps").tag("balanced")
                    Text("Data saver · 128 kbps").tag("saver")
                }
                Text("Changing quality applies to the next streamed track.")
                    .font(.caption).foregroundStyle(.secondary)
            } header: {
                Text("Playback")
            }
            Section("Your iPhone") {
                LabeledContent("Downloaded tracks", value: "\(offline.songs.count)")
                if !offline.batchLabel.isEmpty {
                    LabeledContent("Latest download", value: offline.batchLabel)
                }
                if let issue = offline.lastError {
                    Text(issue).font(.caption).foregroundStyle(.red)
                }
                Button("Download all playlists to this iPhone") {
                    Task { await offline.downloadAllPlaylists(library.playlists, api: api) }
                }
                .disabled(library.playlists.isEmpty || offline.isBatchDownloading)
                NavigationLink {
                    OfflineView()
                } label: {
                    Label("Manage downloaded music", systemImage: "arrow.down.to.line")
                }
                Text("Offline copies are stored privately for this signed-in account. Downloading a playlist does not change your NAS music library.")
                    .font(.caption).foregroundStyle(.secondary)
            }
            Section("Personal recommendations") {
                TextField("Weather city (optional)", text: $weatherCity)
                    .textInputAutocapitalization(.words)
                    .onSubmit { Task { await library.refreshRecommendations(api: api) } }
                if !weatherCity.isEmpty {
                    Button("Disable Weather Mix", role: .destructive) {
                        weatherCity = ""
                        Task { await library.refreshRecommendations(api: api) }
                    }
                }
                Text("We don't request GPS access. City names are sent only when you enable the weather mix.")
                    .font(.caption).foregroundStyle(.secondary)
            }
            Section {
                Button("Sign out", role: .destructive) { signingOut = true }
            } footer: {
                Text("Your Navidrome password is held in the device-only iOS Keychain only when you enable remembered sign-in. Signing out clears it.")
            }
            Section {
                LabeledContent("App", value: "Jobbi Music · Native iOS")
                LabeledContent("Design", value: "SwiftUI · Liquid Glass")
            }
        }
        .navigationTitle("Account")
        .navigationBarTitleDisplayMode(.large)
        .confirmationDialog("Sign out of Jobbi Music?", isPresented: $signingOut) {
            Button("Sign out", role: .destructive) {
                Task {
                    player.stop()
                    await api.logout()
                }
            }
        }
    }
}

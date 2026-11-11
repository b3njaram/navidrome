import SwiftUI

struct ListenNowView: View {
    @EnvironmentObject private var api: JobbiAPI
    @EnvironmentObject private var library: MusicLibrary
    @EnvironmentObject private var player: MusicPlayer
    @AppStorage("jobbi.weatherCity") private var city = ""
    @State private var editingCity = ""
    @State private var showingWeather = false

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 28) {
                if let first = library.home?.songs?.first {
                    featured(song: first)
                        .padding(.horizontal)
                }
                if let recommendations = library.recommendations {
                    SongShelf(title: "Recently Added Songs", subtitle: "Fresh in your library",
                        songs: recommendations.recentTracks ?? [])
                    SongShelf(title: "Top This Week", subtitle: "Your most played songs this week",
                        songs: recommendations.topWeek ?? [], showPlays: true)
                    SongShelf(title: "Top This Month", subtitle: "Your last 30 days",
                        songs: recommendations.topMonth ?? [], showPlays: true)
                    SongShelf(title: "Made for You", subtitle: "Your favorite sounds, plus discovery",
                        songs: recommendations.madeForYou ?? [])
                    SongShelf(title: recommendations.timeLabel ?? "Daily Mix",
                        subtitle: "For the time of day", songs: recommendations.timeMix ?? [])
                    if recommendations.topMonth?.isEmpty ?? true {
                        Text("Your weekly and monthly charts begin with listening recorded after the server update.")
                            .font(.footnote).foregroundStyle(.secondary)
                    }
                    if let weather = recommendations.weather {
                        VStack(alignment: .leading, spacing: 7) {
                            Label(weather.city, systemImage: "cloud.sun.fill")
                            if let temp = weather.temperature {
                                Text("\(Int(temp.rounded()))°C right now")
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                            SongShelf(title: recommendations.weatherLabel ?? "Weather Mix",
                                subtitle: "Matched using your library tags",
                                songs: recommendations.weatherMix ?? [])
                        }
                    }
                    if let error = recommendations.weatherError, !error.isEmpty {
                        Label(error, systemImage: "cloud.slash")
                            .font(.footnote).foregroundStyle(.secondary)
                    }
                } else if library.busy {
                    ProgressView("Preparing your recommendations…")
                }
                AlbumShelf(title: "Fresh in Your Library", albums: library.home?.recent ?? [])
                    .padding(.horizontal, -16)
                AlbumShelf(title: "On Repeat", albums: library.home?.played ?? [])
                    .padding(.horizontal, -16)
                if !(library.home?.songs ?? []).isEmpty {
                    SongShelf(title: "Discover Your Collection",
                        subtitle: "Shuffle a handful of tracks",
                        songs: library.home?.songs ?? [])
                }
                weatherSettings
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 32)
        }
        .navigationTitle("Listen Now")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    Task { await library.refresh(api: api) }
                } label: { Image(systemName: "arrow.clockwise") }
                    .accessibilityLabel("Refresh music")
            }
        }
        .refreshable { await library.refresh(api: api) }
        .sheet(isPresented: $showingWeather) {
            NavigationStack {
                Form {
                    Section {
                        TextField("City, e.g. Ciudad Juárez", text: $editingCity)
                            .textInputAutocapitalization(.words)
                        Text("Location services are never requested. Weather data comes from the city you enter.")
                            .font(.footnote).foregroundStyle(.secondary)
                    }
                    if !city.isEmpty {
                        Section {
                            Button("Turn off weather recommendations", role: .destructive) {
                                city = ""
                                showingWeather = false
                                Task { await library.refreshRecommendations(api: api) }
                            }
                        }
                    }
                }
                .navigationTitle("Weather Mix")
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") { showingWeather = false }
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Save") {
                            city = String(editingCity.trimmingCharacters(in: .whitespacesAndNewlines).prefix(80))
                            showingWeather = false
                            Task { await library.refreshRecommendations(api: api) }
                        }
                    }
                }
            }
            .presentationDetents([.medium])
        }
    }

    private func featured(song: Song) -> some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack {
                Image(systemName: "sparkles")
                Text("MADE FOR YOUR EARS").font(.caption.bold())
            }
            .foregroundStyle(.white.opacity(0.8))
            Text("Your soundtrack,\nyour way.")
                .font(.largeTitle.bold())
                .foregroundStyle(.white)
            Text("Your entire music library in one beautiful place.")
                .foregroundStyle(.white.opacity(0.82))
                .font(.subheadline)
            Button {
                player.play(library.home?.songs ?? [song])
            } label: {
                Label("Play something good", systemImage: "play.fill")
                    .font(.headline)
            }
            .buttonStyle(.glassProminent)
            .tint(.white)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(24)
        .background(
            RoundedRectangle(cornerRadius: 26)
                .fill(LinearGradient(colors: [.pink, .purple, .indigo],
                                     startPoint: .topLeading, endPoint: .bottomTrailing))
        )
    }

    private var weatherSettings: some View {
        Button {
            editingCity = city
            showingWeather = true
        } label: {
            Label(city.isEmpty ? "Set up Weather Mix" : "Weather Mix · \(city)",
                  systemImage: "cloud.sun")
                .font(.subheadline.weight(.medium))
        }
        .buttonStyle(.bordered)
    }
}

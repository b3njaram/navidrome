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
                        .padding(.horizontal, 16)
                }
                AlbumShelf(title: "Recently Added", albums: library.home?.recent ?? [])
                AlbumShelf(title: "Jump Back In", albums: library.home?.played ?? [])
                if let recommendations = library.recommendations {
                    SongShelf(title: "New in Your Library",
                        subtitle: "Just added to your collection",
                        songs: recommendations.recentTracks ?? [])
                    SongShelf(title: "Heavy Rotation",
                        subtitle: "Your most played songs this week",
                        songs: recommendations.topWeek ?? [], showPlays: true)
                    SongShelf(title: "Top Songs This Month",
                        subtitle: "Your last 30 days",
                        songs: recommendations.topMonth ?? [], showPlays: true)
                    SongShelf(title: "Made for You",
                        subtitle: "A mix of your favorites and discoveries",
                        songs: recommendations.madeForYou ?? [])
                    SongShelf(title: recommendations.timeLabel ?? "Daily Mix",
                        subtitle: "Music for this time of day",
                        songs: recommendations.timeMix ?? [])
                    if recommendations.topMonth?.isEmpty ?? true {
                        Text("Your listening charts will appear as you play more music.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                            .padding(.horizontal, 16)
                    }
                    if let weather = recommendations.weather {
                        VStack(alignment: .leading, spacing: 12) {
                            HStack {
                                Image(systemName: "cloud.sun.fill")
                                    .foregroundStyle(MusicAppearance.accent)
                                Text(weather.city).font(.headline)
                                if let temp = weather.temperature {
                                    Text("\(Int(temp.rounded()))°C")
                                        .foregroundStyle(.secondary)
                                }
                            }
                            .padding(.horizontal, 16)
                            SongShelf(title: recommendations.weatherLabel ?? "Weather Mix",
                                subtitle: "Selected for your weather",
                                songs: recommendations.weatherMix ?? [])
                        }
                    }
                    if let error = recommendations.weatherError, !error.isEmpty {
                        Label(error, systemImage: "cloud.slash")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                            .padding(.horizontal, 16)
                    }
                } else if library.busy {
                    ProgressView("Finding music for you…")
                        .padding(.horizontal, 16)
                }
                AlbumShelf(title: "Explore Your Collection",
                    albums: library.home?.featured ?? [])
                if !(library.home?.songs ?? []).isEmpty {
                    SongShelf(title: "Play Something Good",
                        subtitle: "Rediscover songs from your collection",
                        songs: library.home?.songs ?? [])
                }
                weatherSettings
                    .padding(.horizontal, 16)
            }
            .padding(.top, 12)
            .padding(.bottom, 34)
        }
        .background(MusicAppearance.canvas)
        .navigationTitle("Home")
        .navigationBarTitleDisplayMode(.large)
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
        ZStack(alignment: .bottomLeading) {
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(
                    LinearGradient(colors: [
                        MusicAppearance.accent,
                        Color(red: 0.47, green: 0.08, blue: 0.27),
                        Color(red: 0.16, green: 0.10, blue: 0.24)
                    ], startPoint: .topLeading, endPoint: .bottomTrailing)
                )
            HStack {
                Spacer()
                CoverArt(art: song.coverArt, size: 245, cornerRadius: 16)
                    .rotationEffect(.degrees(11))
                    .shadow(color: .black.opacity(0.45), radius: 20, y: 17)
                    .offset(x: 47, y: -33)
            }
            .clipped()
            LinearGradient(colors: [.clear, .black.opacity(0.15), .black.opacity(0.64)],
                           startPoint: .top, endPoint: .bottom)
            VStack(alignment: .leading, spacing: 10) {
                Text("PERSONAL RADIO")
                    .font(.caption2.weight(.heavy))
                    .tracking(1.6)
                    .foregroundStyle(.white.opacity(0.85))
                Text("Your music.\nYour way.")
                    .font(.system(size: 31, weight: .bold, design: .rounded))
                    .tracking(-0.8)
                    .foregroundStyle(.white)
                    .fixedSize(horizontal: false, vertical: true)
                Text("The next great song is already in your library.")
                    .font(.subheadline)
                    .foregroundStyle(.white.opacity(0.86))
                    .lineLimit(2)
                Button {
                    player.play(library.home?.songs ?? [song])
                } label: {
                    Label("Play something good", systemImage: "play.fill")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.black)
                        .padding(.horizontal, 16)
                        .frame(height: 39)
                        .background(.white, in: Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Play something good")
                .padding(.top, 8)
            }
            .padding(23)
        }
        .frame(height: 313)
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
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

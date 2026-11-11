import SwiftUI

private struct PeopleResponse: Decodable {
    let users: [SocialPerson]?
}

struct CommunityView: View {
    @EnvironmentObject private var api: JobbiAPI
    @State private var overview: SocialOverview?
    @State private var mode = 0
    @State private var query = ""
    @State private var people: [SocialPerson] = []
    @State private var error: String?
    @State private var busy = false

    var body: some View {
        List {
            Section {
                Picker("Community", selection: $mode) {
                    Text("Discover").tag(0)
                    Text("Friends").tag(1)
                    Text("My Profile").tag(2)
                }
                .pickerStyle(.segmented)
            }
            if mode == 0 {
                Section("People") {
                    HStack {
                        TextField("Search people", text: $query)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .submitLabel(.search)
                            .onSubmit { Task { await findPeople() } }
                        Button("Find", systemImage: "magnifyingglass") {
                            Task { await findPeople() }
                        }
                        .disabled(query.trimmingCharacters(in: .whitespaces).count < 2)
                    }
                    ForEach(people) { person in
                        NavigationLink {
                            SocialProfileView(username: person.username)
                        } label: { personRow(person) }
                    }
                }
                Section("Public playlists") {
                    if (overview?.discover ?? []).isEmpty {
                        Text("No shared playlists to discover yet.")
                            .foregroundStyle(.secondary)
                    }
                    ForEach(overview?.discover ?? []) { playlist in
                        NavigationLink {
                            SocialPlaylistView(id: playlist.id)
                        } label: {
                            Label {
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(playlist.title)
                                    Text("@\(playlist.owner ?? "unknown") · \(playlist.song_count ?? 0) songs")
                                        .font(.caption).foregroundStyle(.secondary)
                                }
                            } icon: { Image(systemName: "music.note.list") }
                        }
                    }
                }
            } else if mode == 1 {
                Section("Friends") {
                    ForEach(overview?.friends ?? []) { person in
                        NavigationLink {
                            SocialProfileView(username: person.username)
                        } label: { personRow(person) }
                    }
                }
                Section("Incoming requests") {
                    ForEach(overview?.incoming ?? []) { person in
                        HStack {
                            Text(person.displayName)
                            Spacer()
                            Button("Accept") {
                                Task {
                                    do {
                                        try await api.send("/api/social/friends/"
                                            + JobbiAPI.encode(person.username) + "/respond",
                                            json: ["accept": true])
                                        await reload()
                                    } catch { error = error.localizedDescription }
                                }
                            }
                            .buttonStyle(.bordered)
                        }
                    }
                }
                Section("Shared with me") {
                    ForEach(overview?.playlists ?? []) { playlist in
                        NavigationLink {
                            SocialPlaylistView(id: playlist.id)
                        } label: { Text(playlist.title) }
                    }
                }
            } else if let username = api.user?.username {
                Section {
                    NavigationLink {
                        SocialProfileView(username: username)
                    } label: {
                        Label("Edit my profile", systemImage: "person.crop.circle")
                    }
                }
                Section("My playlists") {
                    ForEach((overview?.playlists ?? []).filter {
                        $0.owner?.lowercased() == username.lowercased()
                    }) { playlist in
                        NavigationLink {
                            SocialPlaylistView(id: playlist.id)
                        } label: { Text(playlist.title) }
                    }
                }
            }
            if let error {
                Section {
                    Label(error, systemImage: "exclamationmark.triangle")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }
        }
        .navigationTitle("Community")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Refresh", systemImage: "arrow.clockwise") {
                    Task { await reload() }
                }
            }
        }
        .task { await reload() }
        .refreshable { await reload() }
    }

    private func personRow(_ person: SocialPerson) -> some View {
        HStack(spacing: 12) {
            Image(systemName: "person.crop.circle.fill")
                .font(.title2).foregroundStyle(.pink)
            VStack(alignment: .leading, spacing: 2) {
                Text(person.displayName)
                Text("@\(person.username)")
                    .font(.caption).foregroundStyle(.secondary)
            }
        }
    }

    private func findPeople() async {
        do {
            let response: PeopleResponse = try await api.get(
                "/api/social/people?q=" + JobbiAPI.encode(query))
            people = response.users ?? []
        } catch { error = error.localizedDescription }
    }

    private func reload() async {
        busy = true
        defer { busy = false }
        do {
            overview = try await api.get("/api/social/home")
            error = nil
        } catch { error = error.localizedDescription }
    }
}

struct SocialPlaylistView: View {
    @EnvironmentObject private var api: JobbiAPI
    @EnvironmentObject private var player: MusicPlayer
    let id: String
    @State private var detail: SocialPlaylistDetail?
    @State private var error: String?

    var body: some View {
        List {
            if let detail {
                Section {
                    VStack(alignment: .leading, spacing: 10) {
                        Text(detail.playlist.title).font(.title.bold())
                        Text("@\(detail.playlist.owner ?? "unknown") · \(detail.playlist.visibility ?? "private")")
                            .font(.caption).foregroundStyle(.secondary)
                        Button {
                            player.play((detail.tracks ?? []).map(\.song))
                        } label: { Label("Play playlist", systemImage: "play.fill") }
                        .buttonStyle(.borderedProminent)
                    }
                }
                Section("Tracks") {
                    let tracks = (detail.tracks ?? []).map(\.song)
                    ForEach(Array(tracks.enumerated()), id: \.element.id) { index, song in
                        SongRow(song: song, queue: tracks, index: index)
                    }
                }
            } else if let error {
                ContentUnavailableView("Unable to open playlist",
                    systemImage: "lock", description: Text(error))
            } else {
                ProgressView("Loading shared playlist…")
            }
        }
        .navigationTitle("Shared Playlist")
        .task {
            do { detail = try await api.get("/api/social/playlists/" + JobbiAPI.encode(id)) }
            catch { error = error.localizedDescription }
        }
    }
}

struct SocialProfileView: View {
    @EnvironmentObject private var api: JobbiAPI
    let username: String
    @State private var data: SocialProfile?
    @State private var name = ""
    @State private var bio = ""
    @State private var discoverable = true
    @State private var avatarRevision = 0
    @State private var message: String?
    private var mine: Bool { username.lowercased() == api.user?.username.lowercased() }

    var body: some View {
        Form {
            if let profile = data?.profile {
                Section {
                    HStack(spacing: 16) {
                        let avatarPath = "/api/social/profiles/"
                            + JobbiAPI.encode(username) + "/avatar?v=" + String(avatarRevision)
                        AsyncImage(url: api.url(avatarPath)) { image in
                            image.resizable().scaledToFill()
                        } placeholder: {
                            Image(systemName: "person.crop.circle.fill")
                                .resizable().scaledToFit().foregroundStyle(.pink)
                        }
                        .frame(width: 78, height: 78).clipShape(Circle())
                        VStack(alignment: .leading, spacing: 4) {
                            Text(profile.displayName).font(.title2.bold())
                            Text("@\(profile.username)")
                                .font(.caption).foregroundStyle(.secondary)
                            Text(profile.bio ?? "").font(.subheadline)
                        }
                    }
                }
                if mine {
                    Section("Your profile") {
                        TextField("Display name", text: $name)
                        TextField("About you", text: $bio, axis: .vertical)
                            .lineLimit(2...4)
                        Toggle("Allow other listeners to find me", isOn: $discoverable)
                        PhotoUploadButton(path: "/api/social/me/avatar",
                                          title: "Change profile picture") {
                            avatarRevision += 1
                            await load()
                        }
                        Button("Save profile") {
                            Task {
                                do {
                                    try await api.send("/api/social/me", method: "PATCH",
                                        json: ["displayName": name, "bio": bio,
                                               "discoverable": discoverable])
                                    message = "Profile updated."
                                    await load()
                                } catch { message = error.localizedDescription }
                            }
                        }
                        .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty)
                    }
                } else {
                    Section {
                        Button("Send friend request") {
                            Task {
                                do {
                                    try await api.send("/api/social/friends/request",
                                        json: ["username": username])
                                    message = "Friend request sent."
                                } catch { message = error.localizedDescription }
                            }
                        }
                    }
                }
                Section("Visible shared playlists") {
                    ForEach(data?.playlists ?? []) { playlist in
                        NavigationLink {
                            SocialPlaylistView(id: playlist.id)
                        } label: { Text(playlist.title) }
                    }
                }
            } else {
                ProgressView("Loading profile…")
            }
        }
        .navigationTitle(mine ? "My Profile" : "@\(username)")
        .task { await load() }
        .alert("Community", isPresented: Binding(
            get: { message != nil }, set: { if !$0 { message = nil } }
        )) {
            Button("OK") { message = nil }
        } message: { Text(message ?? "") }
    }

    private func load() async {
        do {
            let result: SocialProfile = try await api.get(
                "/api/social/profiles/" + JobbiAPI.encode(username))
            data = result
            if mine {
                name = result.profile.displayName
                bio = result.profile.bio ?? ""
                discoverable = result.profile.discoverable ?? true
            }
        } catch { message = error.localizedDescription }
    }
}

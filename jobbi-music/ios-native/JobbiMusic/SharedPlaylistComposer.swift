import SwiftUI

enum SharedPlaylistMode {
    case create
    case importPlaylist(id: String, title: String)
    case invite(id: String, title: String)

    var heading: String {
        switch self {
        case .create: "Create shared playlist"
        case .importPlaylist: "Collaborate on playlist"
        case .invite: "Invite collaborator"
        }
    }
    var sourceTitle: String? {
        switch self {
        case .create: nil
        case let .importPlaylist(_, title), let .invite(_, title): title
        }
    }
    var requiresUsername: Bool {
        if case .invite = self { return true }
        return false
    }
}

/// One invitation flow for a new social playlist, a collaborative copy of a
/// Navidrome playlist, and invitations to an existing social playlist.
struct SharedPlaylistComposer: View {
    @EnvironmentObject private var api: JobbiAPI
    @Environment(\.dismiss) private var dismiss

    let mode: SharedPlaylistMode
    var onSuccess: ((String) -> Void)? = nil
    @State private var title = ""
    @State private var description = ""
    @State private var username = ""
    @State private var canEdit = true
    @State private var isPublic = false
    @State private var friends: [SocialPerson] = []
    @State private var busy = false
    @State private var failure: String?
    @State private var preparedPlaylistID: String?

    private var trimmedUsername: String {
        username.trimmingCharacters(in: .whitespacesAndNewlines)
            .trimmingCharacters(in: CharacterSet(charactersIn: "@"))
    }
    private var canSubmit: Bool {
        if case .create = mode {
            guard !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return false }
        }
        return !busy && (!mode.requiresUsername || !trimmedUsername.isEmpty)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    if case .create = mode {
                        TextField("Playlist name", text: $title)
                            .textInputAutocapitalization(.sentences)
                        TextField("Description (optional)", text: $description, axis: .vertical)
                            .lineLimit(2...4)
                        Toggle("Public playlist", isOn: $isPublic)
                    } else if let source = mode.sourceTitle {
                        Text(source).font(.headline)
                        if case .importPlaylist = mode {
                            Text("This creates a collaborative copy. Your original Navidrome playlist stays unchanged.")
                                .font(.footnote).foregroundStyle(.secondary)
                        }
                    }
                } header: { Text("Playlist") }

                Section {
                    TextField("Jobbi Music username", text: $username)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    if !friends.isEmpty {
                        Menu {
                            ForEach(friends) { friend in
                                Button(friend.displayName + " (@" + friend.username + ")") {
                                    username = friend.username
                                }
                            }
                        } label: {
                            Label("Choose from friends", systemImage: "person.2")
                        }
                    }
                    Toggle("Allow this person to add and remove tracks", isOn: $canEdit)
                } header: { Text("Collaborator") } footer: {
                    Text("The person must have a Jobbi Music account. Invitations require acceptance; private playlists remain hidden until accepted.")
                }

                if let failure {
                    Section {
                        Label(failure, systemImage: "exclamationmark.triangle")
                            .foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle(mode.heading)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(actionLabel) { Task { await submit() } }
                        .disabled(!canSubmit)
                }
            }
            .task {
                do {
                    let home: SocialOverview = try await api.get("/api/social/home")
                    friends = home.friends ?? []
                } catch {
                    // Username entry remains available without friend suggestions.
                }
            }
        }
    }

    private var actionLabel: String {
        if !trimmedUsername.isEmpty { return "Invite" }
        return "Create"
    }

    private func submit() async {
        guard canSubmit else { return }
        busy = true
        failure = nil
        defer { busy = false }
        do {
            let id: String
            if let preparedPlaylistID {
                id = preparedPlaylistID
            } else {
                switch mode {
                case .create:
                    let result: CreateSocialPlaylistResponse = try await api.send(
                        "/api/social/playlists",
                        json: [
                            "title": title.trimmingCharacters(in: .whitespacesAndNewlines),
                            "description": description,
                            "visibility": isPublic ? "public" : "private",
                            // Creating with an invite is atomic on the server.
                            "invitees": trimmedUsername.isEmpty ? [] :
                                [["username": trimmedUsername, "canEdit": canEdit]]
                        ])
                    id = result.playlist.id
                    preparedPlaylistID = id
                case let .importPlaylist(sourceID, _):
                    let result: ImportSocialPlaylistResponse = try await api.send(
                        "/api/social/playlists/import",
                        json: ["navidromePlaylistId": sourceID, "visibility": "private"])
                    id = result.id
                    preparedPlaylistID = id
                case let .invite(socialID, _):
                    id = socialID
                }
            }
            // The create endpoint already sends the invitation in its transaction.
            if !trimmedUsername.isEmpty {
                if case .create = mode {
                    // Invitation was sent atomically with playlist creation.
                } else {
                    try await api.send("/api/social/playlists/"
                        + JobbiAPI.encode(id) + "/invitations",
                        json: ["username": trimmedUsername, "canEdit": canEdit])
                }
            }
            onSuccess?(id)
            dismiss()
        } catch {
            failure = error.localizedDescription
        }
    }
}

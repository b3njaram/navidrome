import SwiftUI

struct RemovalReference: Decodable, Identifiable {
    let id: String?
    let name: String?
    let owner: String?
    let own: Bool?
    let restricted: Bool?
    let privateReference: Bool?

    enum CodingKeys: String, CodingKey {
        case id, name, owner, own, restricted
        case privateReference = "private"
    }

    var safeDescription: String {
        if restricted == true { return "Another user's private playlist (name hidden)" }
        if own == true { return "Your playlist: \(name ?? "Unnamed playlist")" }
        return "\(owner ?? "Another listener") has this song in \(name ?? "a playlist")"
    }
}

struct RemovalImpact: Decodable {
    let references: [RemovalReference]
    let referenceCount: Int?
    let hiddenPrivateCount: Int?
    let incompleteScope: Bool?
    let warning: String?
    let ticket: String
    let confirmation: String
}

/// Requires a server-issued, short-lived ticket so references are checked
/// again before a recording is moved to recoverable NAS quarantine.
struct ServerRemovalView: View {
    @EnvironmentObject private var api: JobbiAPI
    @EnvironmentObject private var library: MusicLibrary
    @Environment(\.dismiss) private var dismiss
    let song: Song
    var onRemoved: (() -> Void)? = nil

    @State private var impact: RemovalImpact?
    @State private var typed = ""
    @State private var loading = true
    @State private var moving = false
    @State private var error: String?
    private var route: String { "/api/songs/" + JobbiAPI.encode(song.id) }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Label("Shared NAS recording", systemImage: "externaldrive.fill.badge.exclamationmark")
                        .foregroundStyle(.red)
                    Text(song.title).font(.headline)
                    Text(song.artist).foregroundStyle(.secondary)
                    Text("Removing from the server affects every listener, not just your playlist. The recording moves to recoverable NAS quarantine; it is not permanently deleted.")
                        .font(.footnote)
                }
                if loading {
                    ProgressView("Checking all accessible playlists…")
                } else if let impact {
                    Section("Playlist references (\(impact.referenceCount ?? impact.references.count))") {
                        if impact.references.isEmpty {
                            Text("No accessible references were found.")
                                .foregroundStyle(.secondary)
                        }
                        ForEach(Array(impact.references.prefix(45).enumerated()), id: \.offset) { _, reference in
                            Label(reference.safeDescription, systemImage: "music.note.list")
                        }
                        if impact.references.count > 45 {
                            Text("And \(impact.references.count - 45) more references.")
                        }
                    }
                    Section {
                        Text(impact.warning ?? "Other listeners may have private playlists or Favorites that cannot be inspected.")
                            .foregroundStyle(.red)
                        Text("Private playlist names are never disclosed. Even if no references are visible, removing the recording can break other people's saved music.")
                            .font(.footnote)
                        TextField("Type REMOVE to confirm", text: $typed)
                            .textInputAutocapitalization(.characters)
                            .autocorrectionDisabled()
                            .accessibilityIdentifier("confirmServerRemoval")
                        Button(role: .destructive) {
                            Task { await quarantine(ticket: impact.ticket) }
                        } label: {
                            if moving { ProgressView("Moving to quarantine…") }
                            else { Label("Move recording to NAS quarantine", systemImage: "trash") }
                        }
                        .disabled(moving || typed != "REMOVE" || impact.ticket.isEmpty)
                    } header: { Text("Confirmation required") }
                } else {
                    ContentUnavailableView("Removal unavailable",
                        systemImage: "lock.shield",
                        description: Text(error ?? "The NAS quarantine worker may be disabled. No song was removed."))
                    Button("Retry check") { Task { await load() } }
                }
            }
            .navigationTitle("Remove from server?")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
            .task { await load() }
            .alert("Removal failed", isPresented: Binding(
                get: { error != nil && impact != nil },
                set: { if !$0 { error = nil } }
            )) { Button("OK") { error = nil } }
            message: { Text(error ?? "") }
        }
    }

    private func load() async {
        loading = true
        error = nil
        do {
            impact = try await api.get(route + "/removal-impact")
        } catch {
            impact = nil
            self.error = error.localizedDescription
        }
        loading = false
    }

    private func quarantine(ticket: String) async {
        guard typed == "REMOVE" else { return }
        moving = true
        defer { moving = false }
        do {
            try await api.send(route + "/quarantine", json: [
                "ticket": ticket, "confirm": "REMOVE_FROM_SHARED_LIBRARY"
            ])
            library.message = "Recording moved to recoverable NAS quarantine. A library rescan was requested."
            onRemoved?()
            await library.refresh(api: api)
            dismiss()
        } catch {
            self.error = error.localizedDescription
            // The server may reject a stale ticket when references change.
            // Never attempt a second removal without a fresh warning.
            if self.error?.localizedCaseInsensitiveContains("expired") == true ||
               self.error?.localizedCaseInsensitiveContains("changed") == true {
                impact = nil
                await load()
            }
        }
    }
}

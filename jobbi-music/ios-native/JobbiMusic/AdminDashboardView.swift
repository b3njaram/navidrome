import SwiftUI

struct AdminStorage: Decodable {
    let status: String?
    let musicBytes: Int64?
    let usedBytes: Int64?
    let freeBytes: Int64?
    let totalBytes: Int64?
    let files: Int?
}

struct AdminOverview: Decodable {
    let storage: AdminStorage?
    let usersCount: Int?
    let indexedSongs: Int?
    let indexedAlbums: Int?
    let accountManagementEnabled: Bool?
    let directSearchConfigured: Bool?
    let httpsOnlyCookies: Bool?
}

struct ManagedAccount: Decodable, Identifiable {
    let id: String
    let username: String
    let name: String?
    let isAdmin: Bool?
}

struct ManagedAccounts: Decodable {
    let users: [ManagedAccount]
    let readOnly: Bool?
    let message: String?
}

/// The backend enforces mustAdmin on every operation; this UI never assumes
/// visibility alone authorizes modifying another listener's account.
struct AdminDashboardView: View {
    @EnvironmentObject private var api: JobbiAPI
    @State private var overview: AdminOverview?
    @State private var accounts: ManagedAccounts?
    @State private var working = false
    @State private var error: String?
    @State private var notice: String?
    @State private var username = ""
    @State private var fullName = ""
    @State private var email = ""
    @State private var password = ""
    @State private var deletion: ManagedAccount?
    @State private var deleteConfirm = ""

    var body: some View {
        Form {
            if api.user?.admin != true {
                ContentUnavailableView("Administrator only", systemImage: "lock.shield")
            } else {
                if let overview {
                    Section("Server") {
                        LabeledContent("Indexed recordings",
                            value: overview.indexedSongs.map(String.init) ?? "Unavailable")
                        LabeledContent("Indexed albums",
                            value: overview.indexedAlbums.map(String.init) ?? "Unavailable")
                        LabeledContent("Navidrome users",
                            value: overview.usersCount.map(String.init) ?? "Unavailable")
                        LabeledContent("NAS audio files",
                            value: overview.storage?.files.map(String.init) ?? "Unavailable")
                        LabeledContent("Music storage",
                            value: formatBytes(overview.storage?.musicBytes))
                        LabeledContent("Available space",
                            value: formatBytes(overview.storage?.freeBytes))
                        LabeledContent("Total volume",
                            value: formatBytes(overview.storage?.totalBytes))
                        LabeledContent("Soulseek configured",
                            value: overview.directSearchConfigured == true ? "Yes" : "No")
                        LabeledContent("Secure cookies",
                            value: overview.httpsOnlyCookies == true ? "Enabled" : "Unavailable")
                    }
                    Section("Maintenance") {
                        Button {
                            Task { await rescan() }
                        } label: { Label("Rescan music library", systemImage: "arrow.clockwise") }
                            .disabled(working)
                        Button {
                            Task { await reload() }
                        } label: { Label("Refresh server status", systemImage: "arrow.triangle.2.circlepath") }
                            .disabled(working)
                    }
                    Section("Listener accounts") {
                        if let accounts {
                            if accounts.users.isEmpty {
                                Text("No accounts were returned.")
                            }
                            ForEach(accounts.users) { account in
                                HStack {
                                    VStack(alignment: .leading) {
                                        Text(account.username).font(.body.weight(.medium))
                                        Text(account.isAdmin == true ? "Administrator" : account.name ?? "Listener")
                                            .font(.caption).foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                    if account.isAdmin != true &&
                                       accounts.readOnly != true &&
                                       account.username != api.user?.username {
                                        Button(role: .destructive) {
                                            deletion = account
                                            deleteConfirm = ""
                                        } label: {
                                            Image(systemName: "person.crop.circle.badge.minus")
                                        }
                                        .accessibilityLabel("Delete \(account.username)")
                                    }
                                }
                            }
                            if accounts.readOnly == true {
                                Text(accounts.message ?? "Account management is read-only on this NAS.")
                                    .font(.footnote).foregroundStyle(.secondary)
                            }
                        } else {
                            ProgressView("Loading accounts…")
                        }
                    }
                    if overview.accountManagementEnabled == true &&
                       accounts?.readOnly != true {
                        Section("Create a listener account") {
                            TextField("Username", text: $username)
                                .textInputAutocapitalization(.never).autocorrectionDisabled()
                            TextField("Display name", text: $fullName)
                            TextField("Email", text: $email)
                                .keyboardType(.emailAddress)
                                .textInputAutocapitalization(.never)
                            SecureField("Temporary password", text: $password)
                            Button("Create listener") {
                                Task { await createListener() }
                            }
                            .disabled(working || username.isEmpty || password.count < 8)
                            Text("New accounts are listeners, never administrators. Share their credentials privately.")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                    }
                } else if working {
                    ProgressView("Loading your NAS administration dashboard…")
                } else {
                    ContentUnavailableView("Admin status unavailable",
                        systemImage: "externaldrive.badge.exclamationmark",
                        description: Text(error ?? "The NAS did not return an overview."))
                    Button("Retry") { Task { await reload() } }
                }
                if let notice {
                    Section("Status") { Text(notice).foregroundStyle(.secondary) }
                }
                if let error {
                    Section("Error") {
                        Text(error).foregroundStyle(.red).font(.footnote)
                    }
                }
            }
        }
        .navigationTitle("Admin Console")
        .task { if api.user?.admin == true { await reload() } }
        .alert("Delete listener account?", isPresented: Binding(
            get: { deletion != nil },
            set: { if !$0 { deletion = nil } }
        )) {
            TextField("Type exact username", text: $deleteConfirm)
                .textInputAutocapitalization(.never)
            Button("Delete permanently", role: .destructive) {
                if let deletion, deleteConfirm == deletion.username {
                    Task { await deleteAccount(deletion) }
                }
                deletion = nil
            }
            .disabled(deleteConfirm != deletion?.username)
            Button("Cancel", role: .cancel) { deletion = nil }
        } message: {
            Text("This deletes the listener account and may remove personal playlists. Type the username to confirm. Music recordings on the NAS are not deleted.")
        }
    }

    private func formatBytes(_ amount: Int64?) -> String {
        guard let amount, amount >= 0 else { return "Unavailable" }
        return ByteCountFormatter.string(fromByteCount: amount, countStyle: .file)
    }

    private func reload() async {
        working = true
        error = nil
        defer { working = false }
        do {
            async let overviewResult: AdminOverview = api.get("/api/admin/overview")
            async let accountsResult: ManagedAccounts = api.get("/api/admin/accounts")
            overview = try await overviewResult
            accounts = try await accountsResult
        } catch { self.error = error.localizedDescription }
    }

    private func rescan() async {
        working = true
        defer { working = false }
        do {
            try await api.send("/api/library/scan")
            notice = "Navidrome library scan requested."
        } catch { self.error = error.localizedDescription }
    }

    private func createListener() async {
        working = true
        defer { working = false }
        do {
            try await api.send("/api/admin/accounts", json: [
                "username": username.trimmingCharacters(in: .whitespaces),
                "name": fullName,
                "email": email,
                "password": password
            ])
            password = ""
            username = ""
            fullName = ""
            email = ""
            notice = "Listener created. Share credentials securely."
            let updated: ManagedAccounts = try await api.get("/api/admin/accounts")
            accounts = updated
        } catch { self.error = error.localizedDescription }
    }

    private func deleteAccount(_ account: ManagedAccount) async {
        guard account.isAdmin != true,
              account.username != api.user?.username else { return }
        working = true
        defer { working = false }
        do {
            try await api.send("/api/admin/accounts/" + JobbiAPI.encode(account.id)
                + "?confirm=delete", method: "DELETE")
            notice = "Deleted listener \(account.username)."
            accounts = try await api.get("/api/admin/accounts")
        } catch { self.error = error.localizedDescription }
    }
}

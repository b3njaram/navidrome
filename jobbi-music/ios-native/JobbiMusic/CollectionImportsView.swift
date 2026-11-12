import SwiftUI

/// Progress is owned by Jobbi Music on the NAS, not by this phone or browser.
/// Imports continue after the app is closed while a valid server session exists.
struct SavedCollectionJobsResponse: Decodable {
    let jobs: [SavedCollectionJob]
}

struct SavedCollectionJob: Decodable, Identifiable {
    let id: String
    let filename: String
    let status: String
    let message: String?
    let authorized: Bool
    let total: Int
    let completed: Int
    let queued: Int
    let review: Int
    let pending: Int
    let createdAt: String?
}

struct CollectionImportsView: View {
    @EnvironmentObject private var api: JobbiAPI
    @State private var jobs: [SavedCollectionJob] = []
    @State private var loading = false
    @State private var error: String?
    @State private var busyID: String?

    var body: some View {
        List {
            Section {
                Text("Your imported collection JSON and song-by-song progress are saved on your NAS. Imports continue when this iPhone and your browser are closed.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            if let error {
                Section {
                    Label(error, systemImage: "exclamationmark.triangle")
                        .foregroundStyle(.red)
                }
            }
            if jobs.isEmpty && !loading {
                ContentUnavailableView("No saved imports",
                    systemImage: "doc.badge.arrow.up",
                    description: Text("Upload an Apple Music or Spotify JSON in Jobbi Music on the web. Its progress will appear here."))
            }
            ForEach(jobs) { job in
                Section {
                    VStack(alignment: .leading, spacing: 10) {
                        Text(job.filename)
                            .font(.headline)
                        HStack {
                            Text(job.status.capitalized)
                            Spacer()
                            Text("\(job.completed) / \(job.total) added")
                        }
                        .font(.subheadline)
                        ProgressView(value: Double(job.completed + job.review),
                                     total: Double(max(1, job.total)))
                        Text("\(job.queued) downloading · \(job.pending) pending · \(job.review) review")
                            .font(.caption).foregroundStyle(.secondary)
                        if let message = job.message, !message.isEmpty {
                            Text(message)
                                .font(.footnote).foregroundStyle(.secondary)
                        }
                        HStack {
                            if ["running", "monitoring", "reauth"].contains(job.status) {
                                Button("Pause") { Task { await control(job, "pause") } }
                                    .buttonStyle(.bordered)
                            }
                            if ["paused", "reauth"].contains(job.status) && job.authorized {
                                Button("Resume") { Task { await control(job, "resume") } }
                                    .buttonStyle(.borderedProminent)
                            }
                            if ["paused", "finished"].contains(job.status) && job.review > 0 {
                                Button("Retry unmatched") { Task { await control(job, "retry") } }
                                    .buttonStyle(.bordered)
                            }
                        }
                        .disabled(busyID == job.id)
                    }
                    .padding(.vertical, 5)
                }
            }
        }
        .navigationTitle("Saved imports")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Refresh", systemImage: "arrow.clockwise") {
                    Task { await refresh() }
                }
            }
        }
        .refreshable { await refresh() }
        .task {
            // Only a lightweight status refresh; the server owns the transfers.
            while !Task.isCancelled {
                await refresh()
                try? await Task.sleep(nanoseconds: 15_000_000_000)
            }
        }
    }

    private func refresh() async {
        guard !loading else { return }
        loading = true
        defer { loading = false }
        do {
            let result: SavedCollectionJobsResponse = try await api.get("/api/collection-jobs")
            jobs = result.jobs
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func control(_ job: SavedCollectionJob, _ action: String) async {
        busyID = job.id
        defer { busyID = nil }
        do {
            try await api.send("/api/collection-jobs/" + JobbiAPI.encode(job.id) + "/control",
                json: ["action": action])
            await refresh()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

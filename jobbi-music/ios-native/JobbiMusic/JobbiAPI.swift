import Foundation
import Combine

enum JobbiError: LocalizedError {
    case invalidServer
    case invalidPath
    case notSignedIn
    case invalidResponse
    case server(String)

    var errorDescription: String? {
        switch self {
        case .invalidServer: "Enter an HTTPS server address without a path or password."
        case .invalidPath: "Invalid music service request."
        case .notSignedIn: "Sign in to Jobbi Music first."
        case .invalidResponse: "The music server returned an unexpected response."
        case .server(let reason): reason
        }
    }
}

/// URLSession keeps the HttpOnly session cookie inaccessible to JavaScript.
/// AVURLAsset uses the same default HTTP cookie store for streaming.
@MainActor
final class JobbiAPI: ObservableObject {
    @Published private(set) var user: UserSession?
    @Published private(set) var server: String =
        UserDefaults.standard.string(forKey: "jobbi.server") ?? "https://music.jobbisoft.com.mx"
    @Published var busy = false
    @Published var error: String?

    static func validateServer(_ raw: String) throws -> String {
        let text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
            .trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard let components = URLComponents(string: text),
              components.scheme?.lowercased() == "https",
              let host = components.host, !host.isEmpty,
              components.user == nil, components.password == nil,
              components.query == nil, components.fragment == nil,
              components.path.isEmpty else { throw JobbiError.invalidServer }
        return text
    }

    static func encode(_ raw: String) -> String {
        raw.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? ""
    }

    func url(_ path: String) -> URL? {
        guard path.hasPrefix("/api/"), !path.contains(".."),
              !path.hasPrefix("//") else { return nil }
        return URL(string: server + path)
    }

    func configure(server candidate: String) throws {
        let next = try Self.validateServer(candidate)
        if server != next {
            user = nil
            let current = HTTPCookieStorage.shared.cookies ?? []
            current.filter { $0.domain.contains(URL(string: server)?.host ?? "invalid-host") }
                .forEach { HTTPCookieStorage.shared.deleteCookie($0) }
        }
        server = next
        UserDefaults.standard.set(next, forKey: "jobbi.server")
    }

    private func makeRequest(_ path: String, method: String,
                             json: [String: Any]?, upload: Data?,
                             contentType: String?) throws -> URLRequest {
        guard let endpoint = url(path) else { throw JobbiError.invalidPath }
        var request = URLRequest(url: endpoint)
        request.httpMethod = method
        request.timeoutInterval = method == "GET" ? 35 : 60
        request.setValue("JobbiMusic-iOS/1.0", forHTTPHeaderField: "User-Agent")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if method != "GET", let user {
            request.setValue(user.csrfToken, forHTTPHeaderField: "X-CSRF-Token")
        }
        if let upload {
            request.httpBody = upload
            request.setValue(contentType ?? "image/jpeg", forHTTPHeaderField: "Content-Type")
        } else if method != "GET" {
            request.httpBody = try JSONSerialization.data(withJSONObject: json ?? [:])
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        return request
    }

    func raw(_ path: String, method: String = "GET",
             json: [String: Any]? = nil, upload: Data? = nil,
             contentType: String? = nil) async throws -> Data {
        let request = try makeRequest(path, method: method, json: json,
                                      upload: upload, contentType: contentType)
        let (data, reply): (Data, URLResponse)
        do {
            (data, reply) = try await URLSession.shared.data(for: request)
        } catch {
            throw JobbiError.server("Could not reach \(server). Check the network and NAS: \(error.localizedDescription)")
        }
        guard let http = reply as? HTTPURLResponse else { throw JobbiError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else {
            let message = ((try? JSONSerialization.jsonObject(with: data)) as? [String: Any])?["error"] as? String
            throw JobbiError.server(message ?? "Music server returned HTTP \(http.statusCode).")
        }
        return data
    }

    func get<T: Decodable>(_ path: String, as type: T.Type = T.self) async throws -> T {
        let payload = try await raw(path)
        do { return try JSONDecoder().decode(type, from: payload) }
        catch { throw JobbiError.server("Unexpected music data format: \(error.localizedDescription)") }
    }

    func send<T: Decodable>(_ path: String, method: String = "POST",
                            json: [String: Any] = [:], as type: T.Type = T.self) async throws -> T {
        let payload = try await raw(path, method: method, json: json)
        return try JSONDecoder().decode(type, from: payload)
    }

    func send(_ path: String, method: String = "POST",
              json: [String: Any] = [:]) async throws {
        _ = try await raw(path, method: method, json: json)
    }

    func imageUpload(_ path: String, jpeg: Data) async throws {
        guard jpeg.count >= 16 && jpeg.count <= 1_048_576 else {
            throw JobbiError.server("Picture exceeds the 1 MB server limit.")
        }
        _ = try await raw(path, method: "POST", upload: jpeg, contentType: "image/jpeg")
    }

    func login(username: String, password: String, server: String,
               remember: Bool) async throws {
        try configure(server: server)
        let session: UserSession = try await send("/api/login",
            json: ["username": username, "password": password])
        guard !session.csrfToken.isEmpty, !session.username.isEmpty else {
            throw JobbiError.invalidResponse
        }
        user = session
        if remember {
            do {
                try CredentialVault.save(RememberedLogin(server: self.server,
                    username: username, password: password))
            } catch {
                // An active session is still usable if Keychain is unavailable.
                self.error = error.localizedDescription
            }
        } else { CredentialVault.clear() }
    }

    func restore() async {
        guard let saved = CredentialVault.load() else { return }
        do {
            try await login(username: saved.username, password: saved.password,
                            server: saved.server, remember: true)
        } catch {
            self.error = "Saved sign-in unavailable: \(error.localizedDescription)"
        }
    }

    func logout() async {
        try? await send("/api/logout")
        user = nil
        CredentialVault.clear()
    }

    func download(_ path: String) async throws -> URL {
        let request = try makeRequest(path, method: "GET", json: nil,
                                      upload: nil, contentType: nil)
        let (temp, response) = try await URLSession.shared.download(for: request)
        guard let http = response as? HTTPURLResponse,
              (200..<300).contains(http.statusCode) else {
            try? FileManager.default.removeItem(at: temp)
            throw JobbiError.server("Original recording download failed.")
        }
        return temp
    }
}

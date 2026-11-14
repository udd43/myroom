//
// MyRoomScannerApp.swift
// 아이폰 15 Pro (iOS 16+) 전용 Apple RoomPlan LiDAR 2D/3D 도면 및 USDZ 스캐너
// Xcode에서 iOS App 프로젝트 생성 후 이 파일을 넣고 Info.plist에 NSCameraUsageDescription을 추가하면
// 아이폰 15 Pro에서 바로 방을 스캔해 .usdz 모델과 .json 치수 도면을 MyRoom 웹/서버로 바로 전송할 수 있습니다.
//

import SwiftUI
import RoomPlan

@main
struct MyRoomScannerApp: App {
    var body: some Scene {
        WindowGroup {
            RoomPlanScannerScreen()
        }
    }
}

struct RoomPlanScannerScreen: View {
    @AppStorage("myroom_server_url") private var serverURL = "https://myroom-api-jj.duckdns.org"
    @AppStorage("myroom_admin_password") private var adminPassword = ""

    @State private var isScanning = true
    @State private var showSettings = false
    @State private var roomTitle = "아이폰 LiDAR 스캔 매물"
    @State private var existingRoomId = ""

    @State private var exportedUSDZ: URL?
    @State private var exportedJSON: URL?
    @State private var isUploading = false
    @State private var statusText = "아이폰 15 Pro로 방의 벽·창문·문을 천천히 비춰주세요."

    var body: some View {
        ZStack(alignment: .bottom) {
            if RoomCaptureSession.isSupported {
                RoomCaptureViewContainer(
                    isScanning: $isScanning,
                    onExported: { usdz, json in
                        self.exportedUSDZ = usdz
                        self.exportedJSON = json
                        self.statusText = "RoomPlan 스캔 완료 (.usdz & .json 추출됨)"
                    }
                )
                .ignoresSafeArea()
            } else {
                Text("이 기기는 LiDAR RoomPlan을 지원하지 않습니다.")
                    .padding()
            }

            VStack(spacing: 10) {
                if showSettings {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("MyRoom 서버 원클릭 업로드 설정")
                            .font(.caption.bold())
                        TextField("서버 주소 (예: https://myroom-api-jj.duckdns.org)", text: $serverURL)
                            .textFieldStyle(.roundedBorder)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                        SecureField("관리자 비밀번호 (설정 시 입력)", text: $adminPassword)
                            .textFieldStyle(.roundedBorder)
                        TextField("새 매물 이름", text: $roomTitle)
                            .textFieldStyle(.roundedBorder)
                        TextField("기존 매물 ID 덮어쓰기 (비우면 새 매물 자동 생성)", text: $existingRoomId)
                            .textFieldStyle(.roundedBorder)
                            .textInputAutocapitalization(.never)
                    }
                    .padding(12)
                    .background(.ultraThickMaterial)
                    .cornerRadius(12)
                    .padding(.horizontal, 16)
                }

                Text(statusText)
                    .font(.footnote)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .background(.ultraThinMaterial)
                    .clipShape(Capsule())

                HStack(spacing: 10) {
                    Button {
                        showSettings.toggle()
                    } label: {
                        Image(systemName: "gearshape")
                    }
                    .buttonStyle(.bordered)

                    if isScanning {
                        Button("스캔 완료 및 도면 추출") {
                            isScanning = false
                        }
                        .buttonStyle(.borderedProminent)
                    } else {
                        if exportedUSDZ != nil || exportedJSON != nil {
                            Button {
                                Task { await uploadToMyRoomServer() }
                            } label: {
                                Label(isUploading ? "전송 중…" : "서버로 즉시 전송", systemImage: "icloud.and.arrow.up")
                            }
                            .buttonStyle(.borderedProminent)
                            .disabled(isUploading)
                        }

                        if let usdz = exportedUSDZ {
                            ShareLink("USDZ", item: usdz)
                                .buttonStyle(.bordered)
                        }
                        if let json = exportedJSON {
                            ShareLink("JSON", item: json)
                                .buttonStyle(.bordered)
                        }
                    }
                }
            }
            .padding(.bottom, 28)
        }
    }

    @MainActor
    private func uploadToMyRoomServer() async {
        let base = serverURL.trimmingCharacters(in: .whitespacesAndNewlines).trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard !base.isEmpty, let _ = URL(string: base) else {
            statusText = "올바른 서버 주소를 설정(톱니바퀴)에 입력해 주세요."
            showSettings = true
            return
        }

        isUploading = true
        defer { isUploading = false }

        do {
            var targetId = existingRoomId.trimmingCharacters(in: .whitespacesAndNewlines)
            if targetId.isEmpty {
                statusText = "서버에 새 매물 생성 중…"
                targetId = try await createRoomOnServer(baseURL: base)
                existingRoomId = targetId
            }

            if let jsonURL = exportedJSON {
                statusText = "2D RoomPlan 도면(.json) 업로드 중…"
                try await uploadFile(baseURL: base, roomId: targetId, fileURL: jsonURL, filename: "myroom_roomplan.json", mimeType: "application/json")
            }

            if let usdzURL = exportedUSDZ {
                statusText = "3D LiDAR 모델(.usdz) 업로드 중…"
                try await uploadFile(baseURL: base, roomId: targetId, fileURL: usdzURL, filename: "myroom_lidar.usdz", mimeType: "model/vnd.usdz+zip")
            }

            statusText = "전송 완료! 웹 MyRoom(매물 ID: \(targetId))에서 바로 확인할 수 있습니다."
        } catch {
            statusText = "전송 실패: \(error.localizedDescription)"
        }
    }

    private func applyAuthHeaders(to request: inout URLRequest) {
        let pwd = adminPassword.trimmingCharacters(in: .whitespacesAndNewlines)
        if !pwd.isEmpty {
            request.setValue(pwd, forHTTPHeaderField: "X-MyRoom-Password")
        }
    }

    private func createRoomOnServer(baseURL: String) async throws -> String {
        guard let url = URL(string: "\(baseURL)/api/rooms") else {
            throw URLError(.badURL)
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        applyAuthHeaders(to: &request)

        let title = roomTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        let body: [String: Any] = [
            "title": title.isEmpty ? "아이폰 LiDAR 스캔" : title,
            "address": "iOS RoomPlan 현장 스캔",
            "dealType": "월세"
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            let code = (response as? HTTPURLResponse)?.statusCode ?? 0
            throw NSError(domain: "MyRoomAPI", code: code, userInfo: [NSLocalizedDescriptionKey: "매물 생성 실패 (HTTP \(code))"])
        }
        guard let obj = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let id = obj["id"] as? String else {
            throw NSError(domain: "MyRoomAPI", code: -1, userInfo: [NSLocalizedDescriptionKey: "서버 응답에 매물 ID가 없습니다."])
        }
        return id
    }

    private func uploadFile(baseURL: String, roomId: String, fileURL: URL, filename: String, mimeType: String) async throws {
        guard let url = URL(string: "\(baseURL)/api/rooms/\(roomId)/upload-3d") else {
            throw URLError(.badURL)
        }
        let fileData = try Data(contentsOf: fileURL)
        let boundary = "Boundary-\(UUID().uuidString)"

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        applyAuthHeaders(to: &request)

        var body = Data()
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"file\"; filename=\"\(filename)\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: \(mimeType)\r\n\r\n".data(using: .utf8)!)
        body.append(fileData)
        body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)

        let (_, response) = try await URLSession.shared.upload(for: request, from: body)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            let code = (response as? HTTPURLResponse)?.statusCode ?? 0
            throw NSError(domain: "MyRoomAPI", code: code, userInfo: [NSLocalizedDescriptionKey: "\(filename) 업로드 실패 (HTTP \(code))"])
        }
    }
}

struct RoomCaptureViewContainer: UIViewRepresentable {
    @Binding var isScanning: Bool
    var onExported: (URL, URL) -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(onExported: onExported)
    }

    func makeUIView(context: Context) -> RoomCaptureView {
        let view = RoomCaptureView(frame: .zero)
        view.captureSession.delegate = context.coordinator
        view.delegate = context.coordinator
        let config = RoomCaptureSession.Configuration()
        view.captureSession.run(configuration: config)
        return view
    }

    func updateUIView(_ uiView: RoomCaptureView, context: Context) {
        if !isScanning {
            uiView.captureSession.stop()
        }
    }

    final class Coordinator: NSObject, RoomCaptureViewDelegate, RoomCaptureSessionDelegate, NSCoding {
        var onExported: (URL, URL) -> Void

        init(onExported: @escaping (URL, URL) -> Void) {
            self.onExported = onExported
        }

        required init?(coder: NSCoder) { nil }
        func encode(with coder: NSCoder) {}

        func captureView(shouldPresent roomDataForProcessing: CapturedRoomData, error: Error?) -> Bool {
            return true
        }

        func captureView(didPresent processedResult: CapturedRoom, error: Error?) {
            let tmp = FileManager.default.temporaryDirectory
            let usdzURL = tmp.appendingPathComponent("myroom_lidar.usdz")
            let jsonURL = tmp.appendingPathComponent("myroom_roomplan.json")
            do {
                try processedResult.export(to: usdzURL, exportOptions: .parametric)
                let data = try JSONEncoder().encode(processedResult)
                try data.write(to: jsonURL)
                DispatchQueue.main.async {
                    self.onExported(usdzURL, jsonURL)
                }
            } catch {
                print("RoomPlan export error:", error)
            }
        }
    }
}

//
// MyRoomScannerApp.swift
// 아이폰 15 Pro (iOS 16+) 전용 Apple RoomPlan LiDAR 2D/3D 도면 및 USDZ 스캐너
// Xcode에서 iOS App 프로젝트 생성 후 이 파일을 넣고 Info.plist에 NSCameraUsageDescription을 추가하면
// 아이폰 15 Pro에서 바로 방을 스캔해 .usdz 모델과 .json 치수 도면을 MyRoom 웹/서버로 전송할 수 있습니다.
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
    @State private var isScanning = true
    @State private var exportedUSDZ: URL?
    @State private var exportedJSON: URL?
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

            VStack(spacing: 12) {
                Text(statusText)
                    .font(.footnote)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .background(.ultraThinMaterial)
                    .clipShape(Capsule())

                HStack(spacing: 12) {
                    if isScanning {
                        Button("스캔 완료 및 도면 추출") {
                            isScanning = false
                        }
                        .buttonStyle(.borderedProminent)
                    } else {
                        if let usdz = exportedUSDZ {
                            ShareLink("USDZ 3D 공유", item: usdz)
                                .buttonStyle(.borderedProminent)
                        }
                        if let json = exportedJSON {
                            ShareLink("RoomPlan JSON 도면 공유", item: json)
                                .buttonStyle(.bordered)
                        }
                    }
                }
            }
            .padding(.bottom, 32)
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


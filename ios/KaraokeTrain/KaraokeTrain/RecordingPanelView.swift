import AVFoundation
import SwiftUI

struct RecordingPanelView: View {
    @ObservedObject var model: RecordingModel
    @ObservedObject var microphone: MicrophoneModel
    @Binding var isPresented: Bool

    var body: some View {
        ScrollView {
        VStack(spacing: 14) {
            HStack {
                Label("Record performance", systemImage: "record.circle").font(.headline)
                Spacer()
                Button { isPresented = false } label: { Image(systemName: "xmark").padding(8) }.accessibilityLabel("Close recording panel")
            }
            if let camera = model.camera, model.phase == .recording {
                CameraPreview(session: camera.session).aspectRatio(16/9, contentMode: .fit).clipShape(RoundedRectangle(cornerRadius: 10))
            }
            switch model.phase {
            case .idle:
                Text("Record your microphone with the song. Music is mixed in when you save.").font(.caption).foregroundStyle(.secondary)
                HStack {
                    Button { begin(camera: false) } label: { Label("Audio", systemImage: "mic.fill") }
                    Button { begin(camera: true) } label: { Label("Camera", systemImage: "video.fill") }
                }.buttonStyle(.borderedProminent).tint(.pink)
            case .preparing:
                ProgressView(model.status)
                Button("Cancel") { model.discard() }
            case .recording:
                Text(time(model.elapsed)).font(.title.monospacedDigit()).foregroundStyle(.pink)
                Button("Stop & Save") { model.save() }.buttonStyle(.borderedProminent).tint(.pink)
                Text("15 minute maximum · Headphones reduce audio bleed").font(.caption2).foregroundStyle(.secondary)
            case .exporting:
                ProgressView(model.status)
                Button("Cancel & Discard", role: .destructive) { model.discard() }
            case .ready:
                Text(model.status).font(.subheadline)
                if let url = model.outputURL {
                    ShareLink(item: url) { Label("Share / Save to Files", systemImage: "square.and.arrow.up") }
                        .buttonStyle(.borderedProminent).tint(.pink)
                } else if model.canRetry { Button(model.cameraFailed ? "Save Audio Instead" : "Retry Save") { model.retrySave() }.buttonStyle(.bordered) }
                Button("Done / Discard", role: .destructive) { model.discard(); isPresented = false }
                    .font(.caption)
            }
            if let error = model.error { Text(error).font(.caption).foregroundStyle(.orange) }
        }
        .foregroundStyle(.white).padding(16)
        }.frame(width: 320).frame(maxHeight: 340)
        .background(Color(red: 20/255, green: 20/255, blue: 25/255).opacity(0.98))
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(.pink.opacity(0.5)))
    }
    private func begin(camera: Bool) {
        model.start(includeCamera: camera) { microphone.setEnabled(true) }
    }
    private func time(_ seconds: Double) -> String { let value = Int(max(0, seconds)); return String(format: "%d:%02d", value / 60, value % 60) }
}

private struct CameraPreview: UIViewRepresentable {
    let session: AVCaptureSession
    func makeUIView(context: Context) -> Preview { let view = Preview(); view.layerSession = session; return view }
    func updateUIView(_ view: Preview, context: Context) { view.layerSession = session }
    final class Preview: UIView {
        override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
        var layerSession: AVCaptureSession? {
            get { (layer as? AVCaptureVideoPreviewLayer)?.session }
            set {
                let preview = layer as! AVCaptureVideoPreviewLayer
                if preview.session !== newValue { preview.session = newValue }
                preview.videoGravity = .resizeAspectFill
            }
        }
    }
}

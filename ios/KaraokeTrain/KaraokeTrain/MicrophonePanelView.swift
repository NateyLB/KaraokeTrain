import SwiftUI

struct MicrophonePanelView: View {
    @Binding var isMicExpanded: Bool
    @ObservedObject var viewModel: PlayerViewModel
    @ObservedObject var microphone: MicrophoneModel

    var body: some View {
        VStack(spacing: 16) {
            HStack {
                Button { microphone.setEnabled(!microphone.enabled) } label: {
                    Label(microphone.isRequesting ? "Allow Mic…" : microphone.enabled ? "ON" : "OFF",
                          systemImage: microphone.enabled ? "mic.fill" : "mic.slash.fill")
                        .font(.caption.bold()).padding(.horizontal, 10).padding(.vertical, 6)
                        .background(microphone.enabled ? Color.pink.opacity(0.2) : .white.opacity(0.1))
                        .clipShape(Capsule())
                }.accessibilityLabel(microphone.enabled ? "Turn microphone off" : "Turn microphone on")
                Text("Settings").font(.subheadline.bold())
                Spacer()
                Button { isMicExpanded = false } label: { Image(systemName: "xmark").padding(8) }
                    .accessibilityLabel("Close microphone panel")
            }
            HStack {
                Text("MIC").font(.caption).foregroundStyle(.secondary).frame(width: 32)
                Slider(value: $microphone.volume, in: 0...1).tint(.pink)
                    .disabled(!microphone.enabled).accessibilityLabel("Microphone volume")
            }
            HStack {
                Text("VOC").font(.caption).foregroundStyle(.secondary).frame(width: 32)
                Slider(value: $viewModel.vocalsVolume, in: 0...1).tint(.pink)
                    .disabled(!viewModel.vocalsEnabled).accessibilityLabel("Vocals volume")
            }
            HStack(spacing: 8) {
                MicEffectButton(title: "Echo", icon: "waveform", isOn: $microphone.echo, color: .purple, isEnabled: microphone.enabled)
                MicEffectButton(title: "AutoTune", icon: "sparkles", isOn: $microphone.autoTune, color: .pink, isEnabled: microphone.enabled)
                    .accessibilityHint("Corrects toward the nearest chromatic note")
                MicEffectButton(title: "Noise Cancel", icon: "waveform.slash", isOn: $microphone.noiseCancellation, color: .blue, isEnabled: microphone.enabled)
            }
            if microphone.isListening {
                HStack {
                    ProgressView(value: microphone.reading.volume).tint(.pink)
                        .accessibilityLabel("Microphone level")
                    Text(microphone.reading.name ?? "—").font(.caption.monospacedDigit()).frame(width: 40)
                }
                if let cents = microphone.reading.cents {
                    Text(String(format: "%+.0f cents", cents)).font(.caption2).foregroundStyle(.secondary)
                }
            }
            if let error = microphone.error { Text(error).font(.caption).foregroundStyle(.orange) }
        }
        .foregroundStyle(.white).padding(16).frame(width: 300)
        .background(Color(red: 20/255, green: 20/255, blue: 25/255).opacity(0.95))
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(microphone.enabled ? .pink : .white.opacity(0.1)))
    }
}

struct MicEffectButton: View {
    let title: String
    let icon: String
    @Binding var isOn: Bool
    let color: Color
    let isEnabled: Bool

    var body: some View {
        Button { isOn.toggle() } label: {
            Label(title, systemImage: icon).font(.system(size: 10, weight: .medium))
                .frame(maxWidth: .infinity).padding(.vertical, 8)
                .foregroundStyle(isOn ? color : .gray)
                .background(isOn ? color.opacity(0.2) : .white.opacity(0.05))
                .clipShape(RoundedRectangle(cornerRadius: 8))
                .overlay(RoundedRectangle(cornerRadius: 8).stroke(isOn ? color : .white.opacity(0.1)))
        }.disabled(!isEnabled).opacity(isEnabled ? 1 : 0.4)
            .accessibilityValue(isOn ? "On" : "Off")
    }
}

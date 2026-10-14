import SwiftUI

struct MicrophonePanelView: View {
    @Binding var isMicExpanded: Bool
    @ObservedObject var viewModel: PlayerViewModel

    @State private var isMicEnabled = false
    @State private var micVolume: Float = 0.8
    @State private var echoOn = false
    @State private var autoTuneOn = false
    @State private var noiseCancelOn = false

    var body: some View {
        VStack(spacing: 16) {
            // Header
            HStack {
                Button(action: {
                    withAnimation(.easeInOut(duration: 0.2)) {
                        isMicEnabled.toggle()
                    }
                }) {
                    HStack(spacing: 6) {
                        Image(systemName: isMicEnabled ? "mic.fill" : "mic.slash.fill")
                            .font(.system(size: 12))
                        Text(isMicEnabled ? "ON" : "OFF")
                            .font(.system(size: 12, weight: .bold))
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(isMicEnabled ? Color.pink.opacity(0.2) : Color.white.opacity(0.1))
                    .foregroundColor(isMicEnabled ? .pink : .gray)
                    .cornerRadius(12)
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(isMicEnabled ? Color.pink : Color.gray.opacity(0.3), lineWidth: 1)
                    )
                }
                .disabled(true)
                .accessibilityHint("Microphone monitoring is not available in this port yet")

                Text("Settings")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(.white)

                Spacer()

                Button(action: {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        isMicExpanded = false
                    }
                }) {
                    Image(systemName: "xmark")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(.gray)
                        .padding(8)
                        .background(Color.white.opacity(0.1))
                        .clipShape(Circle())
                }
            }

            // Sliders
            Text("Microphone monitoring and effects are not ported yet. The vocals mixer below is functional.")
                .font(.caption2).foregroundStyle(.orange)
            VStack(spacing: 16) {
                HStack(spacing: 12) {
                    Text("MIC")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(.gray)
                        .frame(width: 32, alignment: .leading)
                    Slider(value: $micVolume, in: 0...1)
                        .accentColor(.pink)
                        .disabled(!isMicEnabled)
                        .opacity(isMicEnabled ? 1.0 : 0.4)
                }

                HStack(spacing: 12) {
                    Text("VOC")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(.gray)
                        .frame(width: 32, alignment: .leading)
                    Slider(value: $viewModel.vocalsVolume, in: 0...1)
                        .accentColor(.pink)
                }
            }

            // Buttons
            HStack(spacing: 8) {
                MicEffectButton(title: "Echo", icon: "waveform", isOn: $echoOn, color: .purple, isEnabled: isMicEnabled)
                MicEffectButton(title: "AutoTune", icon: "sparkles", isOn: $autoTuneOn, color: .pink, isEnabled: isMicEnabled)
                MicEffectButton(title: "Cancel", icon: "exclamationmark.circle", isOn: $noiseCancelOn, color: .blue, isEnabled: isMicEnabled)
            }

            if isMicEnabled && !noiseCancelOn {
                HStack(spacing: 4) {
                    Image(systemName: "exclamationmark.circle")
                        .font(.system(size: 10))
                    Text("Headphones required to prevent feedback")
                        .font(.system(size: 10))
                }
                .foregroundColor(.gray)
                .padding(.top, 4)
            }
        }
        .padding(16)
        .frame(width: 280)
        .background(
            Color(red: 20/255, green: 20/255, blue: 25/255)
                .opacity(0.95)
        )
        .cornerRadius(16)
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(isMicEnabled ? Color.pink : Color.white.opacity(0.1), lineWidth: 1)
        )
        .shadow(color: Color.black.opacity(0.5), radius: 15, x: 0, y: 10)
    }
}

struct MicEffectButton: View {
    let title: String
    let icon: String
    @Binding var isOn: Bool
    let color: Color
    let isEnabled: Bool

    var body: some View {
        Button(action: {
            withAnimation(.easeInOut(duration: 0.2)) {
                isOn.toggle()
            }
        }) {
            HStack(spacing: 4) {
                Image(systemName: icon)
                    .font(.system(size: 10))
                Text(title)
                    .font(.system(size: 11, weight: .medium))
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 8)
            .background(isOn ? color.opacity(0.2) : Color.white.opacity(0.05))
            .foregroundColor(isOn ? color : .gray)
            .cornerRadius(8)
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .stroke(isOn ? color : Color.white.opacity(0.1), lineWidth: 1)
            )
            .opacity(isEnabled ? 1.0 : 0.4)
        }
        .disabled(!isEnabled)
    }
}

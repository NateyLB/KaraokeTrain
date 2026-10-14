import SwiftUI

struct InfoModalView: View {
    @Binding var isInfoOpen: Bool
    @State private var showBenchmark = false

    var body: some View {
        ZStack {
            // Backdrop
            Color.black.opacity(0.6)
                .edgesIgnoringSafeArea(.all)
                .onTapGesture {
                    withAnimation {
                        isInfoOpen = false
                    }
                }

            // Modal Content
            VStack(alignment: .leading, spacing: 24) {
                // Header
                HStack {
                    HStack(spacing: 8) {
                        Image(systemName: "info.circle")
                            .font(.system(size: 24))
                            .foregroundColor(.purple)
                        Text("How to Karaoke")
                            .font(.title2)
                            .bold()
                            .foregroundColor(.white)
                    }

                    Spacer()

                    Button(action: {
                        withAnimation {
                            isInfoOpen = false
                        }
                    }) {
                        Image(systemName: "xmark")
                            .font(.system(size: 16, weight: .bold))
                            .foregroundColor(.gray)
                            .padding(8)
                            .background(Color.white.opacity(0.1))
                            .clipShape(Circle())
                    }
                }

                ScrollView(showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 24) {

                        InfoSection(
                            icon: "magnifyingglass",
                            title: "Search & Queue",
                            description: "Use the Search button (top right) to find any song on YouTube. Add it to the queue. Songs will automatically be processed to separate the vocals and extract the lyrics."
                        )

                        InfoSection(
                            icon: "music.mic",
                            title: "Vocals & Volume",
                            description: "Tap the Microphone button (top right) to open the audio panel. You can adjust the original track's Vocals volume (slider) or completely toggle them off to sing over the instrumental."
                        )

                        InfoSection(
                            icon: "text.alignleft",
                            title: "Lyrics Sync",
                            description: "The AI automatically extracts precise word-by-word timestamps from the vocals. The lyrics will highlight smoothly as you sing along!"
                        )

                        InfoSection(
                            icon: "play.fill",
                            title: "Controls",
                            description: "You can toggle the bottom playback controls on and off using the Play icon at the top right to give yourself more screen space for the lyrics and video."
                        )
                    }
                    .padding(.bottom, 20)
                    #if DEBUG
                    Button("Device stem benchmark") { showBenchmark = true }
                        .buttonStyle(.bordered)
                    #endif
                }
            }
            .padding(24)
            .frame(maxWidth: 500)
            .frame(maxHeight: 600)
            .background(
                Color(red: 20/255, green: 20/255, blue: 25/255)
                    .opacity(0.95)
            )
            .cornerRadius(24)
            .overlay(
                RoundedRectangle(cornerRadius: 24)
                    .stroke(Color.white.opacity(0.1), lineWidth: 1)
            )
            .shadow(color: Color.black.opacity(0.5), radius: 20, x: 0, y: 10)
        }
        .sheet(isPresented: $showBenchmark) { SeparationBenchmarkView() }
    }
}

struct InfoSection: View {
    let icon: String
    let title: String
    let description: String

    var body: some View {
        HStack(alignment: .top, spacing: 16) {
            Image(systemName: icon)
                .font(.system(size: 24))
                .foregroundColor(.purple)
                .frame(width: 32)

            VStack(alignment: .leading, spacing: 6) {
                Text(title)
                    .font(.headline)
                    .foregroundColor(.white)

                Text(description)
                    .font(.subheadline)
                    .foregroundColor(.gray)
                    .lineSpacing(4)
            }
        }
    }
}

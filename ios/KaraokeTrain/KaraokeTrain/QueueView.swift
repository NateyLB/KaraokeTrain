import SwiftUI

struct QueueView: View {
    @ObservedObject var partyViewModel: PartyViewModel
    @Binding var isPresented: Bool
    var preparationStates: [String: SongPreparationState] = [:]
    var onRetry: ((String) -> Void)? = nil
    var onCancel: ((String) -> Void)? = nil

    let primaryAccent = Color(red: 139/255, green: 92/255, blue: 246/255)
    let secondaryAccent = Color(red: 236/255, green: 72/255, blue: 153/255)
    let glassBg = Color(red: 255/255, green: 255/255, blue: 255/255).opacity(0.05)

    var body: some View {
        VStack(spacing: 0) {
            // Header
            HStack {
                Image(systemName: "music.note.list")
                    .foregroundColor(secondaryAccent)
                    .font(.headline)

                let displayQueueCount = displayQueue.count
                Text("Up Next \(displayQueueCount > 0 ? "(\(displayQueueCount))" : "")")
                    .font(.headline)
                    .foregroundColor(.white)

                Spacer()

                Button(action: {
                    withAnimation(.easeInOut(duration: 0.3)) {
                        isPresented = false
                    }
                }) {
                    Image(systemName: "xmark")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(.white)
                        .padding(8)
                        .background(glassBg)
                        .clipShape(Circle())
                }
            }
            .padding(.horizontal, 24)
            .padding(.top, 24)
            .padding(.bottom, 16)

            if displayQueue.isEmpty {
                Spacer()
                Text("Queue is empty.")
                    .foregroundColor(.gray)
                    .font(.subheadline)
                Spacer()
            } else {
                ScrollView {
                    VStack(spacing: 12) {
                        ForEach(Array(displayQueue.enumerated()), id: \.element.id) { index, qSong in
                            let isProcessingSong = currentProcessingSong != nil && index == 0
                            let originalIndex = isProcessingSong ? -1 : (currentProcessingSong != nil ? index - 1 : index)

                            QueueItemRow(
                                qSong: qSong,
                                index: index,
                                originalIndex: originalIndex,
                                isProcessingSong: isProcessingSong,
                                totalQueueCount: partyViewModel.partyState?.queue.count ?? 0,
                                previousQueueID: originalIndex > 0 ? partyViewModel.partyState?.queue[originalIndex - 1].queueId : nil,
                                nextQueueID: (originalIndex >= 0 && originalIndex + 1 < (partyViewModel.partyState?.queue.count ?? 0)) ? partyViewModel.partyState?.queue[originalIndex + 1].queueId : nil,
                                partyViewModel: partyViewModel,
                                preparation: preparationStates[qSong.videoId], onRetry: onRetry, onCancel: onCancel
                            )
                        }
                    }
                    .padding(.horizontal, 24)
                    .padding(.bottom, 24)
                }
            }
        }
        .frame(maxWidth: .infinity)
        .frame(maxHeight: .infinity)
        .background(
            Color(red: 10/255, green: 10/255, blue: 15/255)
                .opacity(0.95)
                .background(Material.ultraThin)
        )
        .cornerRadius(20, corners: [.topLeft, .topRight])
        .shadow(color: Color.black.opacity(0.4), radius: 20, x: 0, y: -5)
    }

    private var currentProcessingSong: PartySong? {
        if let current = partyViewModel.partyState?.currentSong,
           !["ready", "done"].contains(preparationStates[current.videoId]?.phase.rawValue ?? current.jobStatus?.status ?? "pending") {
            return current
        }
        return nil
    }

    private var displayQueue: [PartySong] {
        var queue = partyViewModel.partyState?.queue ?? []
        if let current = currentProcessingSong {
            queue.insert(current, at: 0)
        }
        return queue
    }
}

struct QueueItemRow: View {
    let qSong: PartySong
    let index: Int
    let originalIndex: Int
    let isProcessingSong: Bool
    let totalQueueCount: Int
    let previousQueueID: String?
    let nextQueueID: String?
    @ObservedObject var partyViewModel: PartyViewModel
    var preparation: SongPreparationState?
    var onRetry: ((String) -> Void)?
    var onCancel: ((String) -> Void)?

    private var status: String { preparation?.phase.rawValue ?? qSong.jobStatus?.status ?? "pending" }

    let primaryAccent = Color(red: 139/255, green: 92/255, blue: 246/255)

    var body: some View {
        HStack(spacing: 12) {
            Text("\(index + 1)")
                .font(.subheadline)
                .fontWeight(.bold)
                .foregroundColor(.white.opacity(0.3))
                .frame(width: 20)

            AsyncImage(url: URL(string: qSong.thumbnail)) { image in
                image
                    .resizable()
                    .aspectRatio(contentMode: .fill)
            } placeholder: {
                Color.white.opacity(0.05)
                    .overlay(Image(systemName: "music.note").foregroundColor(.white.opacity(0.5)))
            }
            .frame(width: 40, height: 30)
            .cornerRadius(4)
            .clipped()

            VStack(alignment: .leading, spacing: 2) {
                Text(qSong.title)
                    .font(.subheadline)
                    .fontWeight(.semibold)
                    .foregroundColor(.white)
                    .lineLimit(1)

                Text(qSong.artist)
                    .font(.caption)
                    .foregroundColor(.white.opacity(0.6))
                    .lineLimit(1)
                if let preparation, preparation.phase != .ready {
                    Text(preparation.message).font(.caption2)
                        .foregroundStyle(preparation.phase == .error ? .orange : .white.opacity(0.6))
                        .lineLimit(2)
                }
            }

            Spacer(minLength: 8)

                VStack(alignment: .trailing, spacing: 4) {
                    Text(status.uppercased())
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(status == "ready" ? .green : .white.opacity(0.5))
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(status == "ready" ? Color.green.opacity(0.1) : Color.white.opacity(0.05))
                        .cornerRadius(4)

                    if status == "processing" {
                        let rawProgress = preparation.map { $0.progress * 100 } ?? qSong.jobStatus?.progress ?? 0
                        let progress = rawProgress.isFinite ? min(100, max(0, rawProgress)) : 0
                        Text("\(Int(progress))%").font(.caption2).foregroundStyle(.secondary)
                        GeometryReader { geo in
                            ZStack(alignment: .leading) {
                                RoundedRectangle(cornerRadius: 2)
                                    .fill(Color.white.opacity(0.1))
                                RoundedRectangle(cornerRadius: 2)
                                    .fill(primaryAccent)
                                    .frame(width: geo.size.width * CGFloat(progress / 100.0))
                            }
                        }
                        .frame(width: 50, height: 4)
                    }
                }

            HStack(spacing: 12) {
                if status == "error", let onRetry {
                    Button("Retry") { onRetry(qSong.videoId) }.font(.caption).foregroundStyle(.orange)
                }
                if status == "processing", let onCancel {
                    Button("Cancel") { onCancel(qSong.videoId) }.font(.caption).foregroundStyle(.orange)
                }
                if status == "ready" && !isProcessingSong {
                    Button(action: {
                        command("playNow", ["index": originalIndex])
                    }) {
                        Image(systemName: "play.fill")
                            .font(.system(size: 14))
                            .foregroundColor(.green)
                    }
                }

                VStack(spacing: 4) {
                    Button(action: {
                        command("reorder", ["oldIndex": originalIndex, "newIndex": originalIndex - 1], target: previousQueueID)
                    }) {
                        Image(systemName: "chevron.up")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundColor(isProcessingSong || originalIndex == 0 ? .white.opacity(0.1) : .white)
                    }
                    .disabled(isProcessingSong || originalIndex == 0)

                    Button(action: {
                        command("reorder", ["oldIndex": originalIndex, "newIndex": originalIndex + 1], target: nextQueueID)
                    }) {
                        Image(systemName: "chevron.down")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundColor(isProcessingSong || originalIndex == totalQueueCount - 1 ? .white.opacity(0.1) : .white)
                    }
                    .disabled(isProcessingSong || originalIndex == totalQueueCount - 1)
                }

                Button(action: {
                    if isProcessingSong {
                        command("next", [:])
                    } else {
                        command("remove", ["index": originalIndex])
                    }
                }) {
                    Image(systemName: "trash")
                        .font(.system(size: 14))
                        .foregroundColor(.red)
                }
            }
            .padding(.leading, 8)
        }
        .padding(12)
        .background(Color.white.opacity(0.05))
        .cornerRadius(8)
    }

    private func command(_ action: String, _ payload: [String: Any], target: String? = nil) {
        var payload = payload
        if ["remove", "playNow", "reorder"].contains(action), let queueId = qSong.queueId {
            payload["expectedQueueId"] = queueId
        }
        if let target { payload["expectedTargetQueueId"] = target }
        if action == "next" { payload["expectedCurrentQueueId"] = qSong.queueId as Any? ?? NSNull() }
        Task {
            do { try await partyViewModel.sendCommand(action: action, payload: payload) }
            catch { partyViewModel.errorMessage = error.localizedDescription }
        }
    }
}

extension View {
    func cornerRadius(_ radius: CGFloat, corners: UIRectCorner) -> some View {
        clipShape( RoundedCorner(radius: radius, corners: corners) )
    }
}

struct RoundedCorner: Shape {
    var radius: CGFloat = .infinity
    var corners: UIRectCorner = .allCorners

    func path(in rect: CGRect) -> Path {
        let path = UIBezierPath(roundedRect: rect, byRoundingCorners: corners, cornerRadii: CGSize(width: radius, height: radius))
        return Path(path.cgPath)
    }
}

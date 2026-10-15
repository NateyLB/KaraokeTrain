import SwiftUI

struct HomeView: View {
    var initialRoom: String? = nil
    @StateObject private var partyViewModel = PartyViewModel()
    @State private var joinCode = ""
    @FocusState private var isInputFocused: Bool
    @State private var navigateToRoom = false
    @State private var showInfo = false

    private var canHost: Bool { ServerAccess.credential()?.role != "guest" }

    let bgDark = Color(red: 10/255, green: 5/255, blue: 20/255)
    let bgStart = Color(red: 16/255, green: 8/255, blue: 36/255)
    let primaryAccent = Color(red: 139/255, green: 92/255, blue: 246/255)
    let secondaryAccent = Color(red: 236/255, green: 72/255, blue: 153/255)

    var body: some View {
        NavigationStack {
            ZStack {
                // Background Gradient
                RadialGradient(
                    gradient: Gradient(colors: [bgStart, bgDark]),
                    center: .topLeading,
                    startRadius: 50,
                    endRadius: 800
                )
                .ignoresSafeArea()

                GeometryReader { geometry in
                ScrollView {
                VStack(spacing: 28) {
                    VStack(spacing: 12) {
                        HStack(spacing: 10) {
                            Image(systemName: "music.note").foregroundStyle(primaryAccent)
                            Text("KaraokeTrain")
                                .foregroundStyle(LinearGradient(colors: [primaryAccent, secondaryAccent], startPoint: .leading, endPoint: .trailing))
                        }.font(.system(size: 36, weight: .heavy)).minimumScaleFactor(0.7).lineLimit(1)
                        Text("The ultimate AI-powered karaoke engine.")
                            .font(.subheadline).foregroundStyle(.white.opacity(0.65)).multilineTextAlignment(.center)
                    }.padding(.bottom, 20)
                    // Host Button
                    if canHost {
                    Button(action: {
                        Task { navigateToRoom = await partyViewModel.hostParty() }
                    }) {
                        VStack(spacing: 16) {
                            Image(systemName: "tv")
                                .font(.system(size: 40))
                                .foregroundStyle(primaryAccent)

                            VStack(spacing: 6) {
                                Text("Host a Party")
                                    .font(.title2.bold())
                                    .foregroundColor(.white)

                                Text("Start a new room on this display.")
                                    .font(.subheadline)
                                    .foregroundColor(.gray)
                            }
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 32)
                        .background(Color.white.opacity(0.02))
                        .overlay(
                            RoundedRectangle(cornerRadius: 16)
                                .stroke(primaryAccent.opacity(0.6), lineWidth: 2)
                        )
                        .cornerRadius(16)
                    }
                    }
                    Text("OR").font(.subheadline.bold()).foregroundStyle(.white.opacity(0.5))

                    // Join Form
                    VStack(spacing: 24) {
                        HStack(spacing: 12) {
                            Image(systemName: "iphone")
                                .font(.system(size: 24))
                                .foregroundStyle(secondaryAccent)

                            Text("Join a Party")
                                .font(.title2.bold())
                                .foregroundColor(.white)
                        }

                        HStack(spacing: 12) {
                            TextField("Enter room code", text: $joinCode)
                                .focused($isInputFocused)
                                .foregroundColor(.white)
                                .textInputAutocapitalization(.characters)
                                .disableAutocorrection(true)
                                .font(.system(size: 16, weight: .bold))
                                .padding()
                                .background(Color.white.opacity(0.05))
                                .cornerRadius(24)
                                .onSubmit { Task { navigateToRoom = await partyViewModel.joinParty(code: joinCode) } }
                                .onChange(of: joinCode) { _, value in
                                    joinCode = String(value.uppercased().filter { $0.isASCII && ($0.isLetter || $0.isNumber) }.prefix(4))
                                }

                            Button(action: {
                                Task { navigateToRoom = await partyViewModel.joinParty(code: joinCode) }
                            }) {
                                Text("Join")
                                    .font(.system(size: 16, weight: .bold))
                                    .foregroundColor(.white)
                                    .padding(.horizontal, 24)
                                    .padding(.vertical, 16)
                                    .background(
                                        LinearGradient(colors: [primaryAccent, secondaryAccent], startPoint: .leading, endPoint: .trailing)
                                    )
                                    .cornerRadius(24)
                                    .shadow(color: secondaryAccent.opacity(0.5), radius: 10, x: 0, y: 5)
                                    .opacity(joinCode.count >= 4 ? 1.0 : 0.5)
                            }
                            .disabled(joinCode.count < 4)
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .padding(32)
                    .background(Color.white.opacity(0.03))
                    .overlay(
                        RoundedRectangle(cornerRadius: 16)
                            .stroke(Color.white.opacity(0.05), lineWidth: 1)
                    )
                    .cornerRadius(16)
                }
                .frame(maxWidth: 400)
                .padding(.horizontal, 24).padding(.vertical, 48)
                .frame(maxWidth: .infinity, minHeight: geometry.size.height)
                .disabled(partyViewModel.isConnecting)
                }
                }
                VStack { HStack { Spacer(); Button { showInfo = true } label: {
                    Image(systemName: "questionmark.circle").font(.title2).foregroundStyle(.gray).padding(16)
                } }; Spacer() }
                if showInfo { InfoModalView(isInfoOpen: $showInfo) }
                if partyViewModel.isConnecting {
                    ProgressView("Connecting to karaoke servers…")
                        .padding().background(.ultraThinMaterial).clipShape(RoundedRectangle(cornerRadius: 12))
                }
            }
            .background(OrientationLifecycle(mask: .portrait))
            .navigationDestination(isPresented: $navigateToRoom) {
                if partyViewModel.isHosting {
                    RoomView(partyViewModel: partyViewModel)
                } else {
                    RemoteView(partyViewModel: partyViewModel)
                }
            }
        }
        .alert("Connection problem", isPresented: Binding(
            get: { partyViewModel.errorMessage != nil && !navigateToRoom },
            set: { if !$0 { partyViewModel.errorMessage = nil } }
        )) {
            Button("OK") { partyViewModel.errorMessage = nil }
        } message: { Text(partyViewModel.errorMessage ?? "Could not connect.") }
        .task {
            if let initialRoom { navigateToRoom = await partyViewModel.joinParty(code: initialRoom) }
        }
    }
}

#Preview {
    HomeView()
}

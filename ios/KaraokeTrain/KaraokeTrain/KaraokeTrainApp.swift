//
//  KaraokeTrainApp.swift
//  KaraokeTrain
//
//  Created by Nathan Howland on 9/19/26.
//

import SwiftUI
import AVFoundation

class AppDelegate: NSObject, UIApplicationDelegate {
    static var orientationLock = UIInterfaceOrientationMask.all

    func application(_ application: UIApplication, supportedInterfaceOrientationsFor window: UIWindow?) -> UIInterfaceOrientationMask {
        return AppDelegate.orientationLock
    }
}

enum DeviceOrientation {
    static func request(_ orientation: UIInterfaceOrientationMask, scene: UIWindowScene? = nil) {
        AppDelegate.orientationLock = orientation
        guard let windowScene = scene ?? UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene })
            .first(where: { $0.activationState == .foregroundActive }) else { return }
        if #available(iOS 16.0, *) {
            // Invalidate the controllers' cached orientation masks before
            // asking the scene to rotate, including any presented search view.
            for window in windowScene.windows {
                var controller = window.rootViewController
                while let current = controller {
                    current.setNeedsUpdateOfSupportedInterfaceOrientations()
                    controller = current.presentedViewController
                }
            }
            let requested: UIInterfaceOrientationMask
            if orientation == .allButUpsideDown {
                // Unlock search, and immediately honor how the phone is held.
                // Passing every allowed orientation can retain the room's old landscape.
                switch UIDevice.current.orientation {
                case .landscapeLeft: requested = .landscapeRight
                case .landscapeRight: requested = .landscapeLeft
                default: requested = .portrait
                }
            } else { requested = orientation }
            windowScene.requestGeometryUpdate(.iOS(interfaceOrientations: requested))
        } else {
            let rawValue = orientation == .landscape
                ? UIInterfaceOrientation.landscapeRight.rawValue
                : UIInterfaceOrientation.portrait.rawValue
            UIDevice.current.setValue(rawValue, forKey: "orientation")
        }
    }
}

/// Apply orientation when UIKit has actually attached the screen to a window.
/// SwiftUI onAppear can run before navigation has finished attaching it.
struct OrientationLifecycle: UIViewControllerRepresentable {
    let mask: UIInterfaceOrientationMask
    func makeUIViewController(context: Context) -> Controller { Controller(mask: mask) }
    func updateUIViewController(_ controller: Controller, context: Context) {
        guard controller.mask != mask else { return }
        controller.mask = mask
        if controller.view.window != nil { controller.apply() }
    }
    final class Controller: UIViewController {
        var mask: UIInterfaceOrientationMask
        init(mask: UIInterfaceOrientationMask) { self.mask = mask; super.init(nibName: nil, bundle: nil) }
        required init?(coder: NSCoder) { return nil }
        override func loadView() { view = UIView(); view.isUserInteractionEnabled = false }
        override func viewDidAppear(_ animated: Bool) { super.viewDidAppear(animated); apply() }
        func apply() {
            guard let scene = view.window?.windowScene else { return }
            var current: UIViewController? = self
            while let controller = current {
                controller.setNeedsUpdateOfSupportedInterfaceOrientations()
                current = controller.parent
            }
            DeviceOrientation.request(mask, scene: scene)
        }
    }
}

@main
struct KaraokeTrainApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate

    init() {
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default)
            try AVAudioSession.sharedInstance().setActive(true)
        } catch {
            print("Failed to set audio session category.")
        }
    }

    var body: some Scene {
        WindowGroup {
            HomeView()
        }
    }
}

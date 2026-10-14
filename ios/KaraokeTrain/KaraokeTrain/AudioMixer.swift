import Foundation
import AVFoundation
import MediaToolbox
import os

nonisolated enum AudioMixer {
    final class TapContext: Sendable {
        private let volume = OSAllocatedUnfairLock(initialState: Float(1))
        private let format = OSAllocatedUnfairLock(initialState: false)
        var vocalsVolume: Float {
            get { volume.withLock { $0 } }
            set { volume.withLock { $0 = newValue.isFinite ? min(1, max(0, newValue)) : 0 } }
        }
        var validFormat: Bool {
            get { format.withLock { $0 } }
            set { format.withLock { $0 = newValue } }
        }
    }

    static func createTap(context: TapContext) -> MTAudioProcessingTap? {
        let retained = Unmanaged.passRetained(context)
        var callbacks = MTAudioProcessingTapCallbacks(
            version: kMTAudioProcessingTapCallbacksVersion_0,
            clientInfo: retained.toOpaque(),
            init: { _, info, storage in storage.pointee = info },
            finalize: { tap in
                Unmanaged<TapContext>.fromOpaque(MTAudioProcessingTapGetStorage(tap)).release()
            },
            prepare: { tap, _, description in
                let context = Unmanaged<TapContext>.fromOpaque(MTAudioProcessingTapGetStorage(tap)).takeUnretainedValue()
                let format = description.pointee
                context.validFormat = format.mFormatID == kAudioFormatLinearPCM
                    && format.mFormatFlags & kAudioFormatFlagIsFloat != 0
                    && format.mFormatFlags & kAudioFormatFlagIsBigEndian == 0
                    && format.mBitsPerChannel == 32 && format.mChannelsPerFrame == 2
            },
            unprepare: { _ in },
            process: { tap, requested, _, buffers, delivered, flags in
                delivered.pointee = 0
                guard MTAudioProcessingTapGetSourceAudio(tap, requested, buffers, flags, nil, delivered) == noErr,
                      delivered.pointee > 0 else { return }
                let context = Unmanaged<TapContext>.fromOpaque(MTAudioProcessingTapGetStorage(tap)).takeUnretainedValue()
                let list = UnsafeMutableAudioBufferListPointer(buffers)
                // Never reinterpret unsupported sample types or read past delivered bytes.
                guard context.validFormat else {
                    for buffer in list { if let data = buffer.mData { memset(data, 0, Int(buffer.mDataByteSize)) } }
                    return
                }
                let volume = context.vocalsVolume
                if list.count == 2, list[0].mNumberChannels == 1, list[1].mNumberChannels == 1,
                   let left = list[0].mData?.assumingMemoryBound(to: Float.self),
                   let right = list[1].mData?.assumingMemoryBound(to: Float.self) {
                    let count = min(Int(delivered.pointee), Int(list[0].mDataByteSize / 4), Int(list[1].mDataByteSize / 4))
                    for i in 0..<count {
                        let value = left[i] + right[i] * volume
                        let mixed = value.isFinite ? min(1, max(-1, value)) : 0
                        left[i] = mixed; right[i] = mixed
                    }
                } else if list.count == 1, list[0].mNumberChannels == 2,
                          let data = list[0].mData?.assumingMemoryBound(to: Float.self) {
                    let count = min(Int(delivered.pointee), Int(list[0].mDataByteSize / 8))
                    for i in 0..<count {
                        let value = data[i * 2] + data[i * 2 + 1] * volume
                        let mixed = value.isFinite ? min(1, max(-1, value)) : 0
                        data[i * 2] = mixed; data[i * 2 + 1] = mixed
                    }
                }
            }
        )
        var tap: MTAudioProcessingTap?
        let status = MTAudioProcessingTapCreate(kCFAllocatorDefault, &callbacks,
                                                kMTAudioProcessingTapCreationFlag_PostEffects, &tap)
        guard status == noErr else { retained.release(); return nil }
        return tap
    }
}

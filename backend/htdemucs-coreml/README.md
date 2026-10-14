# HTDemucs → Core ML

Convert Meta's [Hybrid Transformer Demucs](https://github.com/facebookresearch/demucs) (HTDemucs) into a Core ML `.mlpackage` you can drop into a macOS or iOS app and run with `MLModel`.

The hard part of converting HTDemucs to Core ML is not the network itself — it is the STFT/ISTFT and the multi-head attention around it. This repo contains a **single-file converter** (`convert.py`, ~600 LoC) that solves the three blockers you hit otherwise:

1. Core ML doesn't support `complex64` → real-valued STFT/ISTFT.
2. `coremltools` can't trace `nn.MultiheadAttention` → manual decomposition.
3. Core ML's 1D `scatter_add` is fragile → pre-computed OLA index buffer.

The result is a **stand-alone `.mlpackage`** that takes raw stereo audio and outputs four stems (vocals, drums, bass, other) at 44.1 kHz.

## Why another conversion?

There is one prior public Core ML conversion of HTDemucs by [john-rocky/CoreML-Models](https://github.com/john-rocky/CoreML-Models) at 7.8 s segments / 80 MB. This repo offers:

- **Longer segments (10 s by default)** → fewer overlap-add boundaries on long files.
- **CLI flags** for segment length, FP16 quantization, compute-unit selection.
- **Source order** reordered to `[vocals, drums, bass, other]` (DJ/UI convention).
- **Documented workarounds** so you can reproduce or adapt the pipeline for other audio models (Spleeter, OpenUnmix, MDX-Net).

## Quick start

```bash
git clone https://github.com/dexxdean/htdemucs-coreml
cd htdemucs-coreml
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt

# default: 10 s segments, FP32, ~400 MB
python convert.py

# half size, ~200 MB, slight numerical drift but inaudible in practice
python convert.py --fp16

# shorter segments if you want lower latency / smaller buffers
python convert.py --segment 7
```

The output is `HTDemucs_CoreML.mlpackage` (or `HTDemucs_CoreML_FP16.mlpackage`).

## Usage in Swift

```swift
import CoreML
import AVFoundation

// 1. Load the model.
let url = Bundle.main.url(forResource: "HTDemucs_CoreML", withExtension: "mlpackage")!
let config = MLModelConfiguration()
config.computeUnits = .cpuAndGPU   // see "Compute units" below
let model = try MLModel(contentsOf: url, configuration: config)

// 2. Feed a (1, 2, 441000) Float32 MLMultiArray named "audio".
//    Output is a (1, 4, 2, 441000) Float32 array named "sources",
//    in the order [vocals, drums, bass, other].
```

A more complete example with chunking, overlap-add, and `AVAudioEngine` playback is in [`examples/swift/StemSeparator.swift`](examples/swift/StemSeparator.swift).

## Model I/O

| | |
|---|---|
| Input name | `audio` |
| Input shape | `(1, 2, segment_samples)` Float32 |
| Output name | `sources` |
| Output shape | `(1, 4, 2, segment_samples)` Float32 |
| Output order | `vocals, drums, bass, other` |
| Sample rate | 44 100 Hz, stereo |
| Default segment | 441 000 samples (10 s) |
| Min. deployment | macOS 14 / iOS 17 |

## Compute units

HTDemucs is **not stable on the Apple Neural Engine**. Use `.cpuAndGPU` (the default baked into the model). Forcing `.all` or `.cpuAndNeuralEngine` may produce silent garbage on some shapes — the validation step in `convert.py` will warn if numerical drift is large.

## File sizes

| Variant | Size | Notes |
|---|---|---|
| FP32, 10 s | ~400 MB | Default, full reference quality. |
| FP16, 10 s | ~200 MB | Inaudible quality difference for music separation. |
| FP32, 7.8 s | ~310 MB | Closer to john-rocky's segment length. |

## How it works

See [`CONVERSION_NOTES.md`](CONVERSION_NOTES.md) for the technical deep-dive on the three workarounds (real STFT, manual MHA, OLA scatter).

## License & attribution

This repo is **MIT-licensed** — see [`LICENSE`](LICENSE).

The converted model derives from [facebookresearch/demucs](https://github.com/facebookresearch/demucs) © Meta Platforms, Inc., MIT-licensed. The pre-trained HTDemucs weights are downloaded by the `demucs` Python package at conversion time from Meta's official release. **You must comply with Demucs' MIT license when redistributing the resulting `.mlpackage`** — keep the attribution in `ATTRIBUTION.md` alongside the model and in your app's about/legal screen.

This project is **not affiliated with Apple, Meta, or Demucs**. The package name `HTDemucs_CoreML.mlpackage` was chosen to avoid any confusion with Apple-internal model names (e.g., `MusicSourceSeparation`).

## Citation

If you use this in academic work, please cite the original Demucs papers:

```bibtex
@inproceedings{rouard2023hybrid,
  title={Hybrid Transformers for Music Source Separation},
  author={Rouard, Simon and Massa, Francisco and D{\'e}fossez, Alexandre},
  booktitle={ICASSP 2023},
  year={2023}
}
```

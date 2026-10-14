#!/usr/bin/env python3
"""Read-only validation of the existing artifact; never converts/overwrites it.

Run in the conversion venv. Uses deterministic synthetic stereo, not user songs.
Both original Demucs -> wrapper and wrapper -> shipped Core ML must pass.
This is a numerical smoke test, not a listening-quality/device-memory benchmark.
"""
import argparse
import gc
import resource
import time

import numpy as np
import torch
from demucs.pretrained import get_model
from convert import RealValuedHTDemucs, SOURCE_REORDER


def compare(name, reference, actual, max_error, relative_error):
    assert reference.shape == actual.shape, (reference.shape, actual.shape)
    assert np.isfinite(actual).all(), f"{name}: non-finite output"
    difference = reference.astype(np.float32) - actual.astype(np.float32)
    peak = float(np.max(np.abs(difference)))
    relative = float(np.sqrt(np.mean(difference ** 2)) / max(1e-8, np.sqrt(np.mean(reference ** 2))))
    print(f"{name}: peak={peak:.6g}, relative RMS={relative:.6g}", flush=True)
    assert peak <= max_error and relative <= relative_error, f"{name}: numerical drift exceeds limits"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--package', required=True)
    args = parser.parse_args()
    started = time.monotonic()
    torch.set_num_threads(2)
    torch.manual_seed(42)
    samples = 441000
    t = torch.arange(samples) / 44100
    audio = torch.stack([0.2 * torch.sin(2 * torch.pi * 220 * t),
                         0.15 * torch.sin(2 * torch.pi * 330 * t)])[None]
    audio += 0.02 * torch.randn_like(audio)
    print('Loading original Demucs (cached weights)…', flush=True)
    model = get_model('htdemucs').models[0].eval()
    model.use_train_segment = False
    with torch.inference_mode():
        original = model(audio)[:, SOURCE_REORDER].numpy().copy()
        wrapper = RealValuedHTDemucs(model, segment_samples=samples).eval()
        reference = wrapper(audio).numpy().copy()
    compare('Original -> wrapper', original, reference, 0.01, 0.02)
    input_audio = audio.numpy().copy()
    del model, wrapper, audio, original
    gc.collect()
    print('Loading shipped Core ML on CPU…', flush=True)
    import coremltools as ct
    model = ct.models.MLModel(args.package, compute_units=ct.ComputeUnit.CPU_ONLY)
    prediction = model.predict({'audio': input_audio})['sources']
    print(f'Core ML output: {prediction.shape}, {prediction.dtype}', flush=True)
    compare('Wrapper -> Core ML', reference, prediction, 0.1, 0.05)
    # Darwin ru_maxrss is bytes; this includes both frameworks and is NOT iOS peak memory.
    print(f'PASS in {time.monotonic() - started:.1f}s; macOS process peak RSS={resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024**2:.0f} MiB', flush=True)


if __name__ == '__main__':
    main()

# Moving the Core ML model to another Mac

The model is a local binary asset, not part of the Git commit. The app sources,
Xcode project, converter sources, and tests are committed. Cloning this repository
alone does not provide the model needed for uncached song separation.

## Transfer the existing validated artifact

1. On the original Mac, locate:
   `ios/KaraokeTrain/KaraokeTrain/HTDemucs_CoreML.mlpackage`.
2. In Finder, right-click the package and choose **Compress**. Transfer the ZIP
   using AirDrop, an external drive, or your own shared storage. Transfer the
   **whole package**, not just `weight.bin` or a compiled `.mlmodelc` folder.
3. On the other Mac, clone this repository and check out `codex/ios-port` (or the
   branch containing this work). Unzip the package into the identical relative
   path above. Keep the package name unchanged. The Xcode synchronized source
   folder includes the model automatically; do not add a duplicate reference.
4. From the repository root, verify the weight file:

   ```sh
   shasum -a 256 ios/KaraokeTrain/KaraokeTrain/HTDemucs_CoreML.mlpackage/Data/com.apple.CoreML/weights/weight.bin
   ```

   Expected SHA-256 for the currently validated weights:

   ```text
   37c5f1a450b156943fcd966d533f20e35a2aa287d5d7a536a113f8b549eaa41b
   ```

   Also verify that the package contains `Manifest.json` and
   `Data/com.apple.CoreML/model.mlmodel`. The weight checksum verifies the weights,
   not every file in the package.
5. Set up the ignored `LocalDevelopment.xcconfig`, server addresses, and signing
   team as described in [DEVICE_TESTING.md](DEVICE_TESTING.md), then build.

The current weights are approximately 181 MiB. Git deliberately ignores the
package and local secrets, so neither is transferred by a normal clone/pull.
Keep a separate backup of the ZIP. Git LFS or a versioned private artifact bucket
could automate this later; neither is configured by this commit.

## Converter and validation

Conversion sources and their upstream attribution are in
`backend/htdemucs-coreml/`. Prefer transferring the existing validated artifact
instead of regenerating it just to move machines. Regeneration can change
numerical results with different dependency versions; validate any replacement
before using it on a phone. See that directory's README and CONVERSION_NOTES.

With the converter's Python environment installed, validation is:

```sh
backend/htdemucs-coreml/venv/bin/python3 backend/htdemucs-coreml/validate_model.py --package ios/KaraokeTrain/KaraokeTrain/HTDemucs_CoreML.mlpackage
```

Synthetic numerical validation does not replace physical-device memory, thermal,
or real-song quality testing.

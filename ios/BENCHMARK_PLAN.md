# iPhone versus Mac mini processing benchmark

The first user-reported phone run completed ten seconds of generated audio in 15.473 seconds with CPU + GPU, unchanged nominal thermal state, and 11,514 MiB system-reported physical memory. The old report did not identify its hardware model. See [the raw result and interpretation](Benchmarks/2026-10-14-cpu-gpu.md). The restored iOS implementation sets `MLModelConfiguration.computeUnits = .cpuOnly`. Apple's [compute-unit options](https://developer.apple.com/documentation/coreml/mlcomputeunits) permit CPU/GPU/Neural Engine selection, but allowing an accelerator does not establish how much of this converted Demucs graph it will execute or its end-to-end speed.

Before choosing a default:

1. Use the same original input and model version. Test a short real-song excerpt, then a full representative song. Keep output private and use material the owner is authorized to process.
2. Measure cached startup separately. A cached song must skip inference on either platform.
3. On a physical iPhone, profile foreground Core ML with CPU-only, CPU/GPU and all allowed units. Warm up separately, run serially, and record cold load, per-segment inference, normalization/overlap, transfers, publication and total wall time. Simulator timing is Mac hardware timing.
4. Record peak available/resident memory, thermal state, battery impact, audio quality, cancellation and interruption behavior. Stop and cool between runs when thermal state changes. Keep the original memory and thermal checks while experimenting.
5. Compare the Mac mini's existing Demucs pipeline under the same input and representative room load. Report actual settings: segment size, overlap, shifts, compute device and precision. The converted phone model and Python CLI are not automatically equivalent configurations.
6. Report real-time factor (`processing seconds / audio seconds`), first-playable latency and full readiness. Include the complete separation + Qwen transcription/alignment + upload workflow; the earlier phone design still needs server transcription, so inference time alone is not the user-visible result.
7. Compare output against the CPU reference and listen for vocal leakage, transients and overlap-boundary artifacts before accepting a faster setting. Synthetic numerical agreement alone is not musical quality validation.

An API-backed client leaves room to add an on-device worker later if these measurements justify its complexity. Mac mini hosting also needs an always-on process, stable secure ingress and a durable job/room strategy before it becomes a dependable public service. The owner approved the Mac mini as the initial shared processor. No deployment was performed. Normal app processing is server-owned; accelerated Core ML runs only through the explicit Debug benchmark.

The Debug app now includes Help → Device stem benchmark with CPU / CPU + GPU / All available modes. It requires the existing model package and records a synthetic cold-load-inclusive run. Complete the real-song, memory and end-to-end measurements above before choosing a production on-device path.

The existing 222 MiB model is now present locally at `KaraokeTrain/KaraokeTrain/HTDemucs_CoreML.mlpackage` after the authorized move from Downloads. Its weights SHA-256 is `37c5f1a450b156943fcd966d533f20e35a2aa287d5d7a536a113f8b549eaa41b`. Debug model compilation passed. It remains ignored in Git and excluded from Release builds. The owner selected iPhone 18 for device testing; the paired iPhone Air is not the benchmark target.

The benchmark now offers 10-second quick and 30-second warm-timing workloads. It reports model-load time, every prediction API call, Swift input/output processing, padding, and warm full-window inference medians when available. Model instances are fresh, but Core ML system caching is not reset. The hardware identifier is included to distinguish physical models and simulator/Mac measurements. Sharing explicitly exports UTF-8 `.txt`, with Copy report as an alternative. The normal separation algorithm and server-backed playback are unchanged.

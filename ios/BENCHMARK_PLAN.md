# iPhone versus Mac mini processing benchmark

No phone timing has been measured in this continuation. The restored iOS implementation sets `MLModelConfiguration.computeUnits = .cpuOnly`. Apple's [compute-unit options](https://developer.apple.com/documentation/coreml/mlcomputeunits) permit CPU/GPU/Neural Engine selection, but allowing an accelerator does not establish how much of this converted Demucs graph it will execute or its end-to-end speed.

Before choosing a default:

1. Use the same original input and model version. Test a short real-song excerpt, then a full representative song. Keep output private and use material the owner is authorized to process.
2. Measure cached startup separately. A cached song must skip inference on either platform.
3. On a physical iPhone, profile foreground Core ML with CPU-only, CPU/GPU and all allowed units. Warm up separately, run serially, and record cold load, per-segment inference, normalization/overlap, transfers, publication and total wall time. Simulator timing is Mac hardware timing.
4. Record peak available/resident memory, thermal state, battery impact, audio quality, cancellation and interruption behavior. Stop and cool between runs when thermal state changes. Keep the original memory and thermal checks while experimenting.
5. Compare the Mac mini's existing Demucs pipeline under the same input and representative room load. Report actual settings: segment size, overlap, shifts, compute device and precision. The converted phone model and Python CLI are not automatically equivalent configurations.
6. Report real-time factor (`processing seconds / audio seconds`), first-playable latency and full readiness. Include the complete separation + Qwen transcription/alignment + upload workflow; the earlier phone design still needs server transcription, so inference time alone is not the user-visible result.
7. Compare output against the CPU reference and listen for vocal leakage, transients and overlap-boundary artifacts before accepting a faster setting. Synthetic numerical agreement alone is not musical quality validation.

An API-backed client leaves room to add an on-device worker later if these measurements justify its complexity. Mac mini hosting also needs an always-on process, stable secure ingress and a durable job/room strategy before it becomes a dependable public service. No deployment, accelerator default or processing ownership has been changed by this plan.

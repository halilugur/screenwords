# Screenwords Project Improvement Roadmap

## Executive summary

Screenwords has a strong foundation: a lossless JSON document model, revision-aware atomic edits, a shared browser rendering library, an embedded MCP server, local TTS, and a deterministic frame-driven MP4 pipeline. The highest-value next step is not adding more components. It is making existing authoring and export workflows dependable, observable, testable, and easy to recover when something fails.

Recommended order:

1. Make export completion and media timing trustworthy.
2. Make saving and long-running operations safe and observable.
3. Add browser-level regression coverage alongside Rust tests.
4. Improve editor feedback, revision synchronization, and timeline editing.
5. Optimize large-project memory and rendering using measurements.
6. Package the application and document its real runtime requirements.

This is a proposal, not a claim that these improvements have been implemented. This turn creates this document only; earlier renderer changes remain uncommitted.

## Review scope and evidence

Reviewed the manifest, document/edit architecture, renderer, HTTP request parser, UI routes, editor export/TTS/refresh flows, MCP server dispatch, TTS model discovery, and MP4 script.

Baseline verification: `cargo test --quiet` passes 110 tests. These are Rust tests; they do not by themselves establish browser correctness, TTS model independence, or MP4 end-to-end correctness.

Evidence labels used below:

- **Observed:** directly visible in inspected code.
- **Risk:** a plausible consequence requiring a targeted reproduction or integration test.
- **Proposal:** a recommended change, not a verified defect.

Important sources:

| Source | What it establishes |
|---|---|
| `Cargo.toml` | Rust crate, explicit ONNX Runtime and HTTPS dependencies |
| `src/project.rs` | Lossless JSON-backed typed views, track visibility/mute flags, word lookup |
| `src/edits.rs` | Atomic edits, conflict errors, JSON snapshot history |
| `src/render.rs` | Export data construction and shared player embedding |
| `src/ui.rs` | Preview, audio resolution, export and synthesis endpoints |
| `src/server.rs` | Shared document, MCP tools, persistence hooks |
| `src/httpd.rs` | Custom HTTP parsing and response writing |
| `src/assets/editor.html` | Editor state, polling, export and synthesis feedback |
| `tools/render-mp4.mjs` | Chrome/CDP capture, worker scheduling, FFmpeg muxing |
| `src/tts/mod.rs` | Backend routing and model discovery |

No `.github` directory or root README was present in the inspected root. That is not proof that external CI or external documentation does not exist.

## What should be preserved

### Lossless document storage

Keep unknown fields when loading and saving projects. Introduce validation at boundaries without converting the whole document into a restrictive schema that discards forward-compatible data.

### Atomic, revision-aware edits

Continue routing mutations through the edit engine. UI convenience features should not bypass conflict handling, undo grouping, or validation.

### Shared rendering

The editor and player should continue receiving the same component renderer library. Avoid fixes implemented separately in each page.

### Local-first execution

Keep narration on-device and project files portable. Network-dependent features should be explicit rather than silently required for ordinary editing.

### Deliberate dependency budget

The crate implements many foundations itself. Do not add frameworks as a reflex; weigh reduced maintenance and stronger correctness against build size and deployment cost.

## Priority overview

Effort estimates are relative engineering size, not calendar commitments: S = localized work; M = several modules and tests; L = architectural work and integration coverage.

| Priority | Improvement | Value | Effort | First proof of success |
|---|---|---|---|---|
| P0 | Export duration and muxing correctness | Prevent truncated deliverables | M | Short audio plus long outro exports completely |
| P0 | Export timeouts and strict frame completion | Prevent hangs and silent incomplete output | M | A dead worker produces a bounded actionable failure |
| P0 | Persistence failure audit and crash-safe writes | Protect user work | M | Failed save is reported; previous bundle remains readable |
| P0 | HTTP boundary hardening | Protect local server stability | M | Malformed and oversized requests are rejected predictably |
| P1 | Shared media resolution | Eliminate preview/export disagreement | M | UI and player select the same audio and MIME |
| P1 | Browser and MP4 integration tests | Catch actual visual/media regressions | M | Representative export fixtures run automatically |
| P1 | Background job lifecycle | Keep editor usable during export/TTS | L | Progress, cancel, and terminal status are reliable |
| P1 | Editor error and state preservation | Reduce user frustration | M | Failures remain visible and drafts survive refresh |
| P1 | Runtime diagnostics and setup documentation | Reduce installation failures | M | Fresh installation reports missing dependencies clearly |
| P2 | Revision-driven refresh | Improve consistency and reduce redundant work | M | Idle editor skips unchanged payloads |
| P2 | Timeline/inspector authoring improvements | Increase editing speed | L | Components can be precisely adjusted with undo |
| P2 | Model and voice capability reporting | Make TTS availability truthful | M | Missing model configurations are tested explicitly |
| P2 | History and embedded-asset memory budget | Scale to larger projects | L | Memory growth stays within a documented budget |
| P2 | Render performance benchmarks | Improve preview smoothness | M | Frame-time budget measured against representative scenes |
| P3 | Templates and guided story authoring | Improve first-use success | M | New user creates a complete story without guessing |
| P3 | Portable distribution and release process | Make project easier to adopt | L | Supported clean-machine install succeeds |

## 1. Export correctness before export speed

### 1.1 Preserve visual outros when audio ends earlier

**Observed:** the MP4 script passes `-shortest` when narration exists. The renderer now includes visible component end times in its duration, but this does not alone ensure FFmpeg retains that longer visual interval.

**Risk:** a visual outro longer than narration may be truncated by muxing.

Recommended work:

- Define one authoritative export duration in seconds and frames.
- Decide explicitly whether a shorter narration is padded with silence or simply ends while video continues.
- Avoid deriving final video length implicitly from the shortest input stream.
- Ensure preview, HTML export, and MP4 export use the same intended duration.
- Define handling for clips and audio-event ends too; the recent duration fix covers words and visible components, not a complete multitrack media duration policy.

Acceptance criteria:

- Narration of 5 seconds plus a 12-second visual timeline produces a 12-second video within one-frame tolerance.
- Audio longer than target duration follows a documented rule.
- A video without audio exports successfully.
- Fractional-frame durations cover all intended content.
- `ffprobe` checks stream durations and decoded frame counts in integration tests.

### 1.2 Fail on missing frames

**Observed:** frame capture writes a file only if a CDP response contains screenshot data, but increments progress regardless.

**Risk:** a failed capture can appear successful until encoding fails, or leave incomplete frame sequences.

Recommended work:

- Treat missing screenshot data as an error associated with worker and frame index.
- Check the full expected sequence before encoding.
- Retry only clearly transient failures with a small bounded policy.
- Report capture failure separately from encoding failure.
- Publish final output only after validation, rather than presenting a partially written target as finished.

Acceptance criteria:

- A simulated empty screenshot response cannot produce a success message.
- Progress reflects completed files, not attempted frames.
- Failed renders do not replace a previously valid export.

### 1.3 Add bounded CDP operations

**Observed:** CDP `send` promises have no request timeout, and pending requests are not visibly rejected when the WebSocket closes. Startup endpoint polling is bounded, but individual commands are not.

Recommended work:

- Give navigation, evaluation, screenshot capture, and overall export explicit deadlines.
- Reject every pending request on connection close or fatal error.
- Check protocol-level errors rather than assuming successful result shapes.
- Include worker, frame, phase, and useful diagnostics in errors.
- Ensure cancellation and process cleanup apply to every worker.

Acceptance criteria:

- Killing a worker during capture terminates the job within a documented timeout.
- The editor receives an actionable failure instead of waiting indefinitely.
- Temporary directories and child processes are cleaned up after failure.

### 1.4 Remove fixed machine assumptions

**Observed:** Chrome defaults to a macOS application path and CDP uses a fixed base port. CLI numeric arguments are converted with `Number` without comprehensive validity checks in the inspected script.

Recommended work:

- Resolve Chrome from explicit configuration, supported platform locations, then executable discovery.
- Validate FPS, worker count, CRF, max frames, and dimensions before starting children.
- Use collision-resistant port allocation or an alternative CDP transport.
- Report required Node capabilities, Chrome, and FFmpeg before capture begins.

Acceptance criteria:

- Invalid FPS and worker values fail before any browser starts.
- Two concurrent exports do not accidentally attach to each other's browser.
- An absent Chrome executable is diagnosed directly rather than as a delayed endpoint timeout.

## 2. Unify media behavior

### 2.1 Share audio selection and decoding

**Observed:** UI audio resolution and renderer embedding contain separate selection and loading logic. The UI supports data URI parsing, MIME resolution, and a sidecar fallback; renderer behavior is not identical.

Recommended work:

- Create one media resolver returning asset identity, MIME type, bytes/source, and relevant warnings.
- Reuse it for browser streaming and export embedding.
- Keep HTTP range handling separate from source resolution.
- Establish explicit rules for voice events, track role, mute flags, missing assets, and fallback assets.
- Validate malformed data URIs instead of treating every `data:` prefix as adequate.

Acceptance criteria:

- Preview and export select the same narration for the same project.
- WAV, MP3, and other supported formats retain correct MIME handling.
- Unreadable paths produce consistent diagnostics.
- Muted narration behavior is explicit and tested.

### 2.2 Define a real multitrack audio policy

Current export should not be mistaken for a complete audio mixer simply because the document supports voice, music, and SFX tracks.

Proposal:

- Inventory implemented playback versus document-only fields.
- Define support for event start, duration, trimming, gain, mute, fades, and overlaps.
- Introduce mixing only after that contract is documented.
- Implement voice/music ducking and normalization as optional later capabilities.
- Validate output loudness against the project settings when normalization is supported.

Acceptance criteria:

- A fixture containing delayed voice, background music, and an SFX event has verified timing.
- Unsupported audio settings are visible to the user rather than silently ignored.

## 3. Data safety and persistence

### 3.1 Audit persistence failures

**Observed:** persistence is invoked after committed edits in server dispatch. The exact failure propagation and crash consistency must be audited before asserting data-loss bugs.

Recommended work:

- Trace every mutating UI and MCP path through commit and save.
- Define whether success means an in-memory commit, a durable disk commit, or both.
- Surface write failures distinctly from edit validation failures.
- Show saved revision and current revision in the UI.
- Ensure blank/in-memory projects cannot imply durable saving when no bundle exists.

Acceptance criteria:

- Read-only directory, disk write failure, and invalid bundle path are covered.
- User receives a persistent unsaved-work warning after a failed save.
- A later successful save clears the warning only for the appropriate revision.

### 3.2 Crash-safe bundle updates

Proposal, contingent on the persistence audit:

- Write new content to same-filesystem temporary files.
- Flush/sync as needed for the chosen durability contract.
- Rename atomically and define consistency between `project.json` and revision metadata.
- Retain a recoverable prior revision or journal if multi-file publication requires it.
- Detect and explain recovery state at startup.

Do not implement atomic replacement as an isolated helper without deciding how paired revision files recover from an interrupted save.

### 3.3 Preserve unsaved narration drafts

**Observed:** synthesis success triggers a full page reload; script loading fills the text field only when empty.

Proposal:

- Track authored text independently from the last synthesized transcript.
- Display draft versus generated narration state.
- Preserve drafts across reload/reconnect with an explicit local storage or document policy.
- Warn before replacing existing narration with newly edited text.

Acceptance criteria:

- A failed synthesis does not lose edited script text.
- Reload preserves a draft without silently publishing it into the project.
- Draft recovery identifies which project it belongs to.

## 4. Long-running jobs

### 4.1 Export and TTS job lifecycle

**Observed:** editor export and synthesis are request/response workflows; export feedback largely consists of a disabled button and final status.

Proposal:

- Add a small job manager for queued, running, succeeded, failed, and cancelled states.
- Snapshot project revision when a job starts.
- Perform expensive work outside the document lock where possible.
- Commit generated assets only after checking whether intervening edits invalidate the result.
- Expose progress through polling initially; add streaming events only if needed.
- Attach export results to their source revision.

Suggested contract:

| Field | Purpose |
|---|---|
| Job ID | Stable identity for status and cancellation |
| Source revision | Explains which document version produced the result |
| Phase | Loading models, synthesis, capture, encode, validate |
| Progress | Completed units and total when measurable |
| Error code | Machine-readable failure category |
| Result | Final asset/export metadata |

Acceptance criteria:

- Editor stays responsive during export and synthesis.
- Cancellation has an explicit outcome and removes incomplete artifacts.
- Concurrent edits cannot silently receive stale generated timings.
- Reloading the page can reconnect to an active job.

## 5. Editor usability

### 5.1 Persistent error feedback

**Observed:** export failures briefly change button text to `Failed`; detailed information is placed in its title, then button state resets.

Proposal:

- Add an accessible status panel with durable error text and retry actions.
- Distinguish missing dependency, invalid project, browser failure, encoding failure, and save failure.
- Keep last job results visible after temporary button states reset.
- Let users view useful diagnostics without exposing tokens or environment secrets.

### 5.2 Preserve editor state

Proposal:

- Preserve tab, zoom, scroll position, selection, and playhead after relevant updates.
- Replace full-page synthesis reload with targeted state refresh when practical.
- Do not overwrite an active text edit during background refresh.
- Restore focus after dialogs and operations.

### 5.3 Timeline and component inspector

Proposal:

- Add selection-linked inspector controls for supported component params.
- Show resolved time and anchor source together.
- Provide precise numeric start/end inputs alongside dragging.
- Support snapping to word edges, scene boundaries, and frames.
- Make hidden/muted/disabled state visible and adjustable.
- Group drag changes into one undo step.
- Add duplication and deletion with clear selection feedback.

Acceptance criteria:

- A component can be moved, resized, duplicated, and undone using document edits.
- Keyboard users can perform the same core operations.
- Conflicting MCP edits are reported rather than overwritten.

### 5.4 Accessibility review

Proposal:

- Audit labels, focus order, contrast, disabled states, and keyboard shortcuts.
- Expose asynchronous progress through live status regions.
- Provide reduced-motion handling for editor chrome, without altering exported animation unless requested.
- Ensure timeline controls have text alternatives and accessible names.

This is an audit recommendation, not a claim that the existing interface is universally inaccessible.

## 6. Revision synchronization and performance

### 6.1 Refresh only when something changed

**Observed:** the editor refreshes summary, timeline, and words together and repeats refresh every 2.5 seconds while visible and not playing.

Proposal:

- Poll a lightweight revision/status endpoint first.
- Fetch only payloads affected by a newer revision.
- Discard older responses that arrive after newer state.
- Continue respecting active editing and playback state.
- Consider SSE after a robust revision-based implementation, not before.

Acceptance criteria:

- Idle projects avoid rebuilding unchanged large transcript and timeline payloads.
- Reordered network responses cannot move the editor back to an older revision.
- MCP changes become visible without losing current editor selection.

### 6.2 Bound undo memory

**Observed:** history steps store a complete JSON root. Projects may embed audio/image data, so snapshots can retain large payloads.

Risk: repeated edits on asset-heavy projects may increase memory substantially. Measure before choosing a new representation.

Proposal:

- Benchmark memory versus project size and undo count.
- Define a configurable history count/byte budget.
- Evaluate shared immutable asset storage or compact edit history only after establishing correctness requirements.
- Preserve undo semantics and unknown fields.

Acceptance criteria:

- Representative large projects have a measured and documented memory profile.
- History limits are visible, predictable, and do not invalidate current assets.

### 6.3 Measure rendering hotspots

Proposal:

- Benchmark simple captions, dense charts, many overlays, and image-heavy scenes.
- Track frame times at supported preview resolutions.
- Cache static text measurements and decoded images where safe.
- Index component active windows if repeated full scans prove expensive.
- Separate preview-quality settings from export quality.
- Optimize only measured bottlenecks; do not rewrite all 600 component entries speculatively.

## 7. TTS reliability and model management

### 7.1 Explicit model capabilities

**Observed:** model discovery checks selected marker files and backend routing depends on availability. The existing explicit-Supertonic-voice test also depends on the availability condition in routing, despite its comment describing pure naming behavior.

Risk: tests may behave differently when model files are absent. Verify in an isolated configuration before calling this a confirmed failure.

Proposal:

- Separate requested backend selection from capability validation.
- Report required files and missing files per backend.
- Make tests deterministic without requiring large model files.
- Explain language/voice availability in the picker.
- Avoid selecting a backend that cannot load the chosen voice without an actionable diagnostic.

Acceptance criteria:

- Routing tests pass with no staged models.
- Model-dependent inference tests are explicitly opt-in.
- Partial model installations are diagnosed before synthesis.

### 7.2 Reproducible model packaging

Proposal:

- Define a model manifest containing origin, expected files, hashes, and licensing metadata.
- Verify downloaded or staged files.
- Expose version and backend in generated narration metadata.
- Document storage, memory, and startup requirements after measurement.
- Separate application licensing from model usage terms.

### 7.3 Alignment quality checks

Proposal:

- Add sample scripts for punctuation, numbers, abbreviations, and multilingual text.
- Check monotonic word timings and bounds within generated audio.
- Mark estimated timings versus model-derived timings.
- Provide user-facing alignment adjustment rather than pretending every backend provides equivalent precision.

## 8. HTTP and local-server hardening

### 8.1 Strict request limits

**Observed:** `read_request` reads request and header lines without explicit line limits; Content-Length parsing falls back to zero; bodies are allocated/read using a 64 MiB clamp rather than visibly rejecting larger declared lengths.

Recommended work:

- Reject invalid Content-Length and conflicting duplicate values.
- Reject unsupported transfer encodings explicitly.
- Bound request line length, header bytes, header count, and body size.
- Return an appropriate client error rather than silently truncating an oversized body.
- Audit socket timeouts at listener/connection setup before declaring slow-client behavior defective.
- Give parser failures structured reasons so the server can return useful statuses.

Acceptance criteria:

- Oversized requests receive a documented error.
- Malformed lengths cannot be treated as empty valid payloads.
- Tests cover premature EOF, duplicate lengths, excessive headers, and invalid request lines.

### 8.2 Local origin and authorization audit

Proposal:

- Review MCP token handling and UI mutation route protection separately.
- Verify localhost binding, Host validation, browser Origin rules, and cross-origin mutation behavior.
- Keep tokens out of logs and generated HTML.
- Add focused tests for authorized and unauthorized requests.

This review does not establish an exploitable cross-origin vulnerability; it identifies a boundary worth testing because the application exposes local mutations.

## 9. Testing and continuous verification

### 9.1 Keep Rust tests, add missing layers

The 110 passing tests are a good baseline. Add tests where current coverage cannot prove the user-visible result.

| Layer | Recommended coverage |
|---|---|
| Unit | Timing, asset resolution, parser errors, edit conflicts |
| Property/fuzz | JSON, ZIP/DEFLATE, rational time, regex, HTTP boundary invariants |
| Browser smoke | Boot editor, load project, seek, render representative component families |
| Visual regression | Fixed-time screenshots with pinned fonts/browser and stable seeds |
| Media integration | MP4 dimensions, FPS, streams, duration, frame count, audio presence |
| Workflow | Synthesis failure, draft recovery, cancellation, stale revision handling |
| Persistence | Interrupted saves, failed writes, reopen and revision consistency |

Do not rely exclusively on tests that search source strings for renderer behavior. Retain useful structural checks, but pair them with actual execution.

### 9.2 Deterministic fixtures

Proposal:

- Small visual-only project.
- Short narration with long visual outro.
- Music asset preceding voice asset.
- Hidden track and disabled component.
- Out-of-order transcript words.
- Fractional-frame duration.
- Embedded text containing HTML script delimiters.
- Invalid/missing audio source.
- Dense chart and long wrapped caption.
- Large project with embedded media.

Keep fixtures small and rights-cleared. Do not require full TTS inference for every browser test.

### 9.3 CI policy

No repository `.github` directory was present during review. Proposal:

- Add CI using the hosting system actually chosen for the project.
- Run Rust tests and diff/style checks.
- Establish formatter/linter baseline before enforcing checks that would cause unrelated repository-wide churn.
- Run browser smoke tests on a supported environment.
- Run heavier MP4 and optional model tests on a separate schedule or explicit job.
- Store failing screenshots/logs as artifacts without secrets.

## 10. Documentation and distribution

### 10.1 Real setup guide

Proposal: create a root README covering:

- What Screenwords does and what is currently unsupported.
- Rust build and run commands verified against the CLI.
- Editor, MCP, and proxy modes.
- Node/Chrome/FFmpeg requirements for MP4 export.
- TTS staging and configuration.
- Project bundle layout and portability.
- Save/recovery behavior.
- Troubleshooting by failure category.

**Observed:** several source comments still describe an older zero-dependency architecture, while the manifest includes ONNX Runtime and HTTPS dependencies. Update those claims accurately without abandoning the deliberate dependency philosophy.

### 10.2 Diagnostic command

Proposal: a `doctor`-style CLI command that checks:

- Writable project/export locations.
- TTS model completeness.
- Node capabilities and Chrome/FFmpeg availability.
- Port configuration and runtime options.
- Application and model versions.

Keep diagnostics local and avoid printing API keys or bearer tokens.

### 10.3 Release packaging

Proposal:

- Declare supported operating systems rather than implying universal support.
- Bundle or clearly locate ONNX Runtime requirements.
- Provide release artifacts with checksums.
- Run clean-machine installation tests.
- Document where models live when launched outside the repository working directory.
- Introduce schema migration policy before future document-format changes.

## 11. Product improvements after reliability

### Guided project creation

Offer a clear sequence: choose format, write script, choose available voice, generate narration, select visual style, review captions, export. Explain missing prerequisites before the user reaches the export button.

### Useful templates

Prefer a small set of complete, editable stories over a large set of disconnected component demos. Templates should use the existing catalog and document operations, not special renderer branches.

### Catalog discovery

Add component previews, category filtering, required parameter hints, and compatible usage examples. Confirm runtime rendering for representative families before expanding the catalog further.

### Export presets

After correctness is established, offer quality/speed presets with explicit dimensions, FPS, and compression settings. Show estimated resource cost using measurements rather than invented render-time predictions.

### Project health panel

Expose missing assets, unresolved anchors, clipped caption risks, unavailable models, unsaved changes, and unsupported export settings in one review surface.

## Delivery phases

### Phase A: trustworthy output

Scope:

1. Reproduce long-outro muxing behavior with a small fixture.
2. Define duration policy across words, components, clips, and audio events.
3. Fix muxing to follow the policy.
4. Add strict frame completion and CDP deadlines.
5. Validate export arguments and runtime dependencies.
6. Add MP4 metadata assertions.

Exit criteria: successful exports are complete and failures are bounded and actionable.

### Phase B: safe workflows

Scope:

1. Audit persistence failure propagation.
2. Implement the agreed crash-safe save contract.
3. Unify audio/media resolution.
4. Add job state and source revision metadata.
5. Preserve drafts and show persistent operation errors.
6. Harden request parsing limits.

Exit criteria: failed jobs or saves do not silently lose work, freeze the workflow, or claim success.

### Phase C: fast, precise authoring

Scope:

1. Revision-driven refresh and stale-response protection.
2. Selection/zoom/playhead preservation.
3. Inspector and timeline precision controls.
4. Browser workflow and accessibility tests.
5. Model capability reporting independent of file-dependent unit tests.

Exit criteria: users and MCP agents can edit concurrently with predictable feedback and undo behavior.

### Phase D: scale and adoption

Scope:

1. History memory benchmarks and budgets.
2. Render performance benchmarks and targeted caching.
3. Setup guide and diagnostics.
4. Portable releases and model manifest.
5. Guided creation and curated templates.

Exit criteria: larger projects and fresh installations work within documented operating limits.

## Suggested first implementation batch

Start with this focused batch rather than attempting the whole roadmap at once:

- [ ] Add a short-audio/long-outro export fixture.
- [ ] Verify output durations with `ffprobe`.
- [ ] Remove implicit shortest-stream truncation according to a documented duration policy.
- [ ] Reject screenshot responses without data.
- [ ] Add CDP timeout and WebSocket-close rejection.
- [ ] Validate FPS/workers/CRF/max-frame inputs.
- [ ] Show detailed export failures persistently in the editor.
- [ ] Add automated coverage for success, dead worker, missing frame, and missing executable.

Why this batch first: it directly improves the file users deliver, closes gaps not covered by Rust unit tests, and can be implemented without rewriting the editor or document engine.

## What not to do yet

- Do not rewrite the application into a new UI framework simply to split files.
- Do not add hundreds more components before runtime coverage improves.
- Do not add cloud services to solve local job management.
- Do not replace the document model with a lossy typed conversion.
- Do not implement a general audio workstation before defining minimal supported mixing semantics.
- Do not optimize embedded assets or history without memory measurements.
- Do not introduce retries that hide deterministic validation errors.
- Do not claim browser/MP4/TTS correctness from passing Rust tests alone.

## Decisions that need a product choice

| Decision | Recommended default |
|---|---|
| Duration when audio ends first | Continue video to intended timeline end; allow silence |
| Duration when target is shorter than active content | Warn and cover content unless explicit trimming is requested |
| Export overwrite | Publish validated result atomically; retain prior valid output on failure |
| Concurrent synthesis and edits | Generate from a snapshot; refuse stale retiming without reconciliation |
| Undo limits | Measured configurable budget with visible truncation policy |
| Missing model/voice | Explicit capability error; no silent incompatible substitution |
| Runtime portability | Declare supported platforms and test them before promising others |
| Event transport | Revision polling first; streaming only when justified |

## Completion checklist for future improvement work

For every implemented item:

1. Link it to a concrete workflow or reproduced failure.
2. Add a failing regression test where practical.
3. Preserve unknown fields and revision-aware edit semantics.
4. Verify preview/export consistency when rendering or media changes.
5. Test relevant failure paths, not just success.
6. Run Rust tests plus the relevant browser/media checks.
7. Document runtime or behavior changes.
8. Avoid unrelated cleanup and preserve existing uncommitted work.
9. Report what was verified and what remains untested.

## Bottom line

The project does not need a cosmetic improvement pass as its next major step. It needs a trustworthy export contract, resilient job handling, safe persistence, and tests that execute the browser and media pipeline. Once those are stable, editor precision, performance, templates, and distribution will deliver substantially more value with less regression risk.

Model note: the exact model identifier is not exposed in this session.

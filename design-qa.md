# Light dashboard design QA

final result: passed

## Visual target and evidence

- Source visual truth: `demo/design/timeline-reference.png` and `demo/design/graph-reference.png` (the user-approved generated light UI mockups).
- Browser-rendered implementation: `demo/design/timeline-implementation.png`, `demo/design/graph-implementation.png`.
- Desktop: source and implementation both 1586 × 992 pixels; CSS viewport 1586 × 992; device density 1. No device/browser chrome. Page scroll aligned to zero. Full-view comparisons combine equal-size images at the same 50% scale; no mismatched density inference.
- Timeline state: selected fabricated issue reference. The executable sample contains 18 records and five flagged steps, whereas the reference compresses representative rows. The timeline scrolls to the selected record. Timeline / Graph tabs are intentionally available on both screens.
- Graph state: selected exponential-backoff claim, all nodes, fit view. Sample data is explicitly illustrative; no claim of a real running model.
- Side-by-side full-view evidence: `demo/design/timeline-comparison.png`, `demo/design/graph-comparison.png`.
- Focused inspector comparisons: `demo/design/timeline-detail-comparison.png`, `demo/design/graph-detail-comparison.png` (unscaled crops). Reviewed typography, argument highlighting, claim/diff readability, source link, badge and metadata.
- Narrow screen: `demo/design/mobile-implementation.png`, 390 × 844 CSS/pixels, density 1. Document width equals viewport width (390); panels stack and controls remain accessible.
- Live semantic-unavailable behavior: `demo/design/live-unverified.png` (isolated QA backend with semantic verification explicitly disabled).

## Comparison history

1. Initial comparison found P2 issues: small graph/code typography; selected timeline row partially outside the scroll area; detail content and extra sample disclaimer pushed the workspace below the intended desktop composition. Evidence: `demo/design/iteration-1-*-comparison.png`.
2. Increased graph and code typography, snapped selected-row scrolling to complete rows, reduced inspector spacing, and moved the longer sample disclaimer below the workspace. Sample mode remains identified in the header and summary. Added concise flagged-argument view with expandable complete original Event.
3. Re-captured both states at the source viewport, aligned page scroll and used graph fit view. Reviewed the final combined full views and inspector crops. No actionable P0/P1/P2 findings remain. React Flow attribution is retained; fresh-tab console has no errors or warnings.

## Required fidelity surfaces

- **Fonts/typography:** locally bundled Inter 400/500/600/700; matching sans-serif hierarchy, near-black headings, muted labels and monospace code. Readable badge, graph, code and timeline sizes. Exact generated-image font is unspecified; Inter is the chosen close match.
- **Spacing/layout:** white top navigation, generous outer margins, 65/35 workspace, right inspector, fine panel borders, compact summary and blue view tabs. Responsive stacking replaces columns on narrow screens. Extra restart/run-selection controls support the existing product.
- **Colors/tokens:** white background, near-white code blocks, pale blue selection, restrained blue primary control, soft amber/red findings and muted green support; no dark-theme styles or option.
- **Assets/image quality:** Phosphor library icons reproduce the outlined cube/event icon vocabulary. React Flow owns graph drawing and navigation. No rasterized UI, handcrafted asset replacements, stretched graphics or unnecessary generated decoration. Reference images are documentation only, never rendered as the working interface.
- **Copy/content:** actual backend verdicts drive live states. “No findings” does not overstate semantic support. Unavailable semantic checks show Unverified; absent supporting evidence is not drawn as a support edge. Sample verdicts are labeled illustrative, not model output. Context for provenance comparisons is labeled Earlier context.

## Interaction and integration verification

- All / Flagged filter yields five sample findings; source link resets the filter and selects the originating step.
- Timeline / Graph switching, graph node click and Enter activation, Selected step scope, and Fit View work.
- Playback at 2× reveals records, completes at 18, and preserves the distinction between presentation and execution. Pause/restart controls are implemented; no tools or replay POST calls are executed by the dashboard.
- Workspace dialog provides real-run selection and sample mode; live/sample effects are isolated. Escape, close, and keyboard focus trapping are implemented.
- Real backend: opened empty `light_stream_qa`, replayed 24 recorded Events to isolated SQLite-backed FastAPI, observed live SSE updates without refreshing. Posted one additional Event twice; UI and persisted snapshot show 25 records, not 26. Reload preserves all 25.
- Real unavailable mode: four deterministic findings appear; semantic claims remain Unverified. This check does not validate Laya inference, which was explicitly disabled for frontend QA.
- Final fresh-browser console: no errors or warnings. Earlier dev-session attribution warning was corrected by retaining React Flow attribution; HMR-only node-type warning is absent in the fresh session.
- Production TypeScript/Vite build and all 10 state/presentation tests pass.

## Follow-up polish (P3)

- Graph uses a functional three-column auto-layout rather than the mockup's manually positioned nodes; large runs can be focused with Selected step and navigated with pan/zoom.
- Small differences in generated mockup typography and icon geometry remain acceptable. Registry snapshots and model availability are product data, not visual constants.
- No Laya model download, production deployment, or real agent/tool execution was needed for this frontend change.

## Implementation checklist

- [x] Replace dark theme with the approved light visual direction.
- [x] Timeline and Graph views, details, filtering and source links.
- [x] Preserve existing backend and recorded replay integration.
- [x] Clearly separate illustrative sample and persisted results.
- [x] Browser interaction, responsive and console checks.
- [x] Recompare after P2 corrections; preserve source and implementation evidence.

## Scoped follow-up: technical pipeline disclosure

final result: passed

- Request: expose Laya, score fusion, FastAPI, SQLite and SSE for hackathon judges while retaining the approved simple light UI.
- Source baseline: `demo/design/timeline-implementation.png` (approved light dashboard). Added content is intentional under the new request; existing navigation, typography, colors, timeline, graph, and inspector are preserved.
- Latest browser evidence: `demo/design/pipeline-collapsed.png`, `demo/design/pipeline-expanded.png`, `demo/design/pipeline-mobile.png`.
- Full-view comparison: `demo/design/pipeline-comparison.png` combines the baseline and revised 1586 × 992 screenshots, both density 1, scroll zero, same issue-reference selection. Focused pipeline and score details were inspected at native size in the expanded screenshot. No source-asset replacement or density mismatch.
- Fonts, tokens and icon vocabulary remain Inter/Phosphor with fine borders, muted text and restrained blue selection. The default addition is an approximately 82px collapsed strip. Stage explanations and score breakdown only open after interaction; intentional page growth is scrollable.
- No P0/P1/P2 findings. Mobile (390 × 844) uses a horizontally scrollable stage row and vertically stacked explanation; document width remains exactly 390px both collapsed and expanded. Minor small-text density is consistent with the existing secondary metadata.
- Tested every stage: FastAPI via keyboard Enter, Rules, Laya, Score fusion, SQLite, SSE; disclosure open/close; selected-step changes update reported signals. Live `light_ui_qa` shows actual unavailable Laya, 24 stored records, and SSE resume cursor #24. Example mode explicitly uses illustrative labels and does not claim a database write or real stream.
- Score data is display-only: the backend's stored risk is shown unchanged. Missing findings are null/“—”, not manufactured probabilities. Semantic finding confidence is distinguished from raw Laya support probability; only total backend latency is shown.
- Console errors: none. Production build and all 13 state/presentation tests pass, including regressions for separate signals, preserved backend score and unavailable semantic output.

## Real Laya setup verification

The local preview now opens a real persisted run (`laya_live_001`) with `Laya connected`, `Persisted run data`, actual semantic finding confidence 0.8821 (displayed 0.88), and no illustrative label. Browser console errors: none. No layout or API contract change was needed. Evidence and measured performance are in `demo/LAYA_VALIDATION.md` and `demo/validation/laya-live-dashboard.png`; the five-case verifier and all 54 backend regression tests passed. Historical sample/degraded-mode checks above remain separate from this real-model validation.

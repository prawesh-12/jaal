# Jaal second-stage refinement, work plan

Source: user brief, 50 sections. Grouped into 9 workstreams below.
Status key: [ ] todo  [~] in progress  [x] done  [-] deliberately not done

## W1 Tokens and foundation  (spec 4, 5, 6, 47)
- [x] surface ladder: base / surface-1 / surface-2 / active
- [x] text ladder: primary / secondary / tertiary / metadata / disabled
- [x] motion tokens: --motion-fast/standard/slow + easing
- [x] type scale: hero 52-68, result 48-64, section 24-32, analytical 18-22,
      body 14-16, metadata 11-13
- [x] tabular numerals confirmed on every figure class
- [x] prefers-reduced-motion honoured for all new motion (spec 44)

## W2 Shared components  (spec 46)
- [x] AnimatedMetric / HighlightMetric
- [x] ChartCrosshair + shared tooltip (spec 32, 33)
- [x] Disclosure (failure expand, spec 17)
- [x] PipelineVisualizer, PipelineStage, PipelineConnector,
      PipelineControls, StageDetailPanel
- [x] no duplicated animation logic across pages

## W3 Overview  (spec 7, 8, 9, 10, 11, 13, 40)
- [x] two-part hero: headline+meta left, primary outcome right
- [x] primary outcome anchored, hierarchy around the number not just size
- [x] do-nothing vs with-Jaal comparison made visually obvious
- [x] system performance reads as one system, subtle separators
- [x] hover on a metric reveals definition / interpretation
- [x] tier table: primary label strong, critical columns emphasised,
      adaptive row marked exceptional, row hover, selected row surface
- [x] highlight genuinely high-value values (derived from data, not invented)

## W4 Cost  (spec 15, 32)
- [x] key insight before the chart
- [x] custom crosshair + tooltip, not the library default
- [x] tooltip shows threshold, cost, comparison to do-nothing, interpretation
- [x] sensitivity hierarchy

## W5 Failures  (spec 16, 17, 33)
- [x] failure overview -> response -> catalogue hierarchy
- [x] expandable catalogue entries, height+opacity transition
- [x] restrained red indicator, never a red component
- [x] recall chart hover: sophistication, blocked, with-review, precision

## W6 Pipeline, the signature work  (spec 18-30, 36, 37, 49)
- [x] large SVG staged visualisation, 7 stages + input/output
- [x] staged sequence, not continuous animation
- [x] per stage: INPUT / PROCESS / OUTPUT shown explicitly
- [x] scale changes made proportional where meaningful
- [x] controls: play, pause, replay, previous, next, auto/manual
- [x] compact stage indicator with current stage highlighted
- [x] tier selector keeps driving real data
- [x] timing: stage 500-900, flow 300-700, highlight 200-400, layout 500-800
- [x] ends with OUTPUT READY, no aggressive looping
- [x] blocking diagram wired to the BLOCK stage
- [x] cluster graph interactive, animated formation
- [x] feature importance hover reveals name/weight/rank/interpretation
- [x] StageDetailPanel driven by real data

## W7 Queue and Charts  (spec 40)
- [x] queue: operational clarity, priority, row inspection
- [x] charts: legends, interaction where the chart is ours

## W8 Cross-cutting  (spec 34, 41, 42, 43, 45)
- [x] microinteractions: nav underline, row hover, metric hover
- [x] whitespace audit
- [x] footer alignment and hierarchy
- [x] responsive 1440/1280/1024/768/mobile, pipeline vertical on mobile
- [x] performance: no unbounded loops, SVG over div soup

## Deviation, recorded
- [x] motion/react was installed, used, and then removed. Every animated
      element it drove started at opacity 0, so the pipeline diagram rendered
      blank until a frame loop ran. That is the wrong failure mode for the one
      thing on the site that does the explaining. The reveals are CSS keyframes
      now: animation-fill-mode guarantees the finished state, so a stalled
      loop or a slow device leaves the diagram fully drawn. Interaction-led
      motion is CSS transitions, and expand/collapse uses grid-template-rows,
      which animates height without measuring it in JavaScript.

## W9 Acceptance  (spec 50)
- [x] data unchanged, verified against results/ again
- [x] routes unchanged
- [x] no AI-slop regressions
- [x] all interaction items work

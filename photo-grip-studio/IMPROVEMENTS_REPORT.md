# Evertonians Grip Studio: development report

Prepared November 2, 2026.

## Scope and provenance

This report compares the current photo-measurement app with the original local checkout of [akhtar10x/Prybar-Ergo-Grip](https://github.com/akhtar10x/Prybar-Ergo-Grip), commit `f547edb` (v3.7.2). This is the repository identified in the workspace as the upstream source; the report does not independently establish the account owner's personal identity. Changes are reconstructed from that commit, the current source, validation records, and the current editing session. They are not a dated commit-by-commit development history.

The user's repository, [sloansobie/grip-studio](https://github.com/sloansobie/grip-studio), already contains a separate Python/Three.js studio. The photo app is delivered in `photo-grip-studio/`, preserving that existing application. This report concerns the photo app; it does not attribute the separate Python studio's features to the upstream photo app.

## What the original already provided

The upstream version already offered three-photo hand measurement, tape calibration, guided landmark taps, missing/shortened digit support, estimated dimensions, optional hand landmark assistance, browser STL generation, and a warm neutral interface. These capabilities are inherited, not newly invented in this revision.

## Improvements and changes

### Measurement workflow

- Added a dedicated manual measurement screen alongside the photo workflow, with individual numeric inputs and a finger dimension table.
- Added a fixed reference profile and a load-baseline action. The initial example matches the fixed reference, making unchanged geometry an explicit starting state.
- Editing inputs invalidates the previous downloadable build until regeneration, reducing the risk of exporting stale geometry.
- Retained guided photo capture, zoom, pan, draggable landmarks and tape calibration. Added image-edge assistance for palm-down and side-view measurements alongside landmark assistance. Suggested points require user review.
- Automatically advances from completed tape calibration into hand measurement; removed the redundant calibration/measurement toggle from the visible interface.
- Removed the visible advanced JSON entry and measurement-review/JSON-copy sections to simplify the interface. Their internal elements remain hidden to preserve existing measurement bookkeeping.

### Source-model personalization

- Integrated the supplied HY scanned handle as an embedded model and downloadable baseline.
- Changed the active browser generator to deform original source vertices using the difference between target and reference displacement fields, preserving the original triangulation.
- Matching right-hand baseline measurements return the original STL byte-for-byte. Small deviations produce continuous changes rather than an abrupt switch to a reconstructed baseline.
- Installed supplied finger/thumb calibration points and ellipsoid regions, used for approximate field relocation and region labels.
- Limited calibrated field relocation to 20% and smoothed the displacement field for 32 passes to reduce surface folds. These changes also soften local adjustments.
- Removed palm-length-driven geometry and palm/wrist overlays. Legacy palm length is ignored by the browser pipeline. Hand breadth and hand length should not be interpreted as directly controlling all local grip geometry.
- Restricted active browser output to right hands; left-hand generation is rejected. Historical files and underlying engine tests may still contain left-hand examples.
- Added automatic creation of the output directory to the standalone Python generator.

### Preview and calibration tools

- Added a rotatable shaded surface preview with the original baseline wireframe overlay, approximate digit regions, labels, reset view, and measured maximum/RMS vertex displacement.
- Added an explicit identical-geometry message when output and baseline coincide. Zero displacement is expected for baseline inputs.
- Changed the pinky region, label and guide line from teal to charcoal for stronger contrast with the green handle.
- Removed the visible ±10% diagnostic probing controls and measurement selector, while retaining preview of generated results.
- Removed skeletal-hand and separate-model controls and their main-preview rendering. Earlier development explored digit bone lengths, curl direction, contact-surface placement, finger tilt and thumb orientation; associated modules and tests remain, but those guides are no longer displayed in the main app.
- Added a separate region calibration editor with point placement, XYZ/radius editing, camera views, undo/reset and calibration import/export. Editor exports require explicit installation into project assets.
- Added a separate simplified viewer of the source model.

### Interface and maintainability

- Replaced the warm square-corner presentation with green accents, rounded cards and controls, clearer input grouping, and responsive styling.
- Applied the same visual treatment to the photo workspace, including photo-stage background, step tabs, calibration panels, controls, labels and tables.
- Split the original large page into HTML, stylesheet and focused script modules for UI, source model, deformation, rendering and calibration.
- Kept the core browser workflow usable as static files with embedded model data. Optional AI assistance still requires its external model download.
- Coalesced preview drawing through animation frames, capped display pixel density, cached parsed meshes and generation results, and separated preview updates from input changes.
- Versioned changed asset URLs to prevent cached scripts from referring to controls removed from the page. This resolved the blank preview seen during interface cleanup.

## Verification and supporting work

Added checks cover source identity, near-baseline continuity, changed grip dimensions, missing digits, source triangle count, right-hand restrictions, manual/photo controls, stale-download invalidation, edge assistance, preview result updates, animation-frame coalescing, region editing, resizing, and historical overlay geometry.

On this report's preparation run, nine existing JavaScript suites passed initially. Two interface suites still expected removed probing controls or an external temporary DOM file; these were updated to exercise current generated-output preview and to derive their DOM from the current HTML. Final results are recorded in `photo-grip-studio/validation/publication-tests.txt`.

Validation work also produced synthetic hand profiles, contact sheets, measurement scripts and a smoother 30-case right-hand experiment. The publication includes source scripts and written/JSON evidence; bulky generated STL batches, archives, temporary outputs and OS metadata are excluded. Some historical analysis scripts require those generated datasets to be recreated or restored.

## Limitations and unresolved work

This is an experimental personalization tool. Preserving the original model also preserves its defects. The recorded source analysis found 40 degenerate faces, 10 non-manifold edges, negative signed volume and at least five strict crossing pairs. The smoother 30-case experiment retained five crossing pairs per case, with four cases replacing one original crossing pair with a new pair. These results do not establish watertightness, printability, strength or ergonomic fit.

Calibration regions, inherited displacement mapping, thickness estimates and synthetic profiles remain approximations. Physical fit testing and a separately repaired baseline are still needed. The Python studio's validated-export workflow is a different pipeline and must not be taken as certification of this photo app's exports.

Earlier appended README sections describe intermediate designs, including reconstructed meshes, probing and skeletal displays. Where those accounts conflict, this report and the current code describe the present interface. Historical tests of the underlying radial engine or overlay modules do not prove the active output is suitable for printing.

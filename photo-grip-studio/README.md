# Evertonians Ergonomic Handle Generator

Parametric Python generator for the Phase 2 prybar handle. It takes 22 hand
measurements (mm) and produces a printable STL handle. No dependencies:
Python 3 only. Build v0.5.4 (October 2026).

## What it makes

A single-piece screwdriver-style handle:

- bar stub with a flat face at x=0 + 10mm blend (the prybar slots in here)
- rounded dome cap at the pinkie end
- four finger grooves wrapping the underside (index nearest the stub,
  ridges between fingers, fingertip curl toward the stub)
- palm swell on the +Y flank
- thumb channel on top, rotated 15 degrees about its own midpoint
  (rear 105 deg, mid 90 deg, tip 75 deg)
- the generator prints a stats JSON and enforces a never-exceed envelope

## Files

| File | Purpose |
| --- | --- |
| `grip_generator_v05.py` | The generator. All tuning constants live in the `K` dict. |
| `test_grip_generator_v05.py` | 34 automated checks (geometry, wiring, determinism). |
| `grip_estimator.py` | Estimates the grip diameter from the other measurements (11 built-in checks). |
| `hand_template.json` | Example inputs -- copy it and replace the values. |

## How to run

```
python3 grip_generator_v05.py hand_template.json -o . --name my_handle
```

Outputs:

- `my_handle.stl` -- binary STL, ready to slice
- `my_handle_params.json` -- inputs, constants, layout and stats; keep it
  next to the STL
- `my_handle_preview.svg` -- side and top views plus groove cross-sections

Use `--palm-side left` to y-mirror the handle for left hands.

The grip diameter cannot be photographed (it is a closed grip around an
object), so if no cone measurement exists, estimate it:

```
python3 grip_estimator.py hand.json
```

The estimator uses `grip_diameter = (thumb_length + middle_finger_length
+ thumb_thickness) / pi` -- when the hand closes around a cylinder, the
thumb and middle finger together span about one full circumference, and
the thumb tip overlapping the fingertip pad buys back one digit
thickness. Run `python3 grip_estimator.py --selftest` for its checks. If
`grip_diameter_inside` is already in the JSON, the estimator compares the
estimate against it and flags a difference larger than 2 mm.

## The 22 measurements

Hand and grip (4):

- `hand_length` -- wrist crease to longest fingertip; bounds handle length
- `hand_breadth` -- across the hand (e.g. at the thumb); palm swell height
- `palm_length` -- wrist crease to middle-finger base; swell extent
- `grip_diameter_inside` -- inside a clenched grip (e.g. sliding down a
  cone until thumb and middle finger barely touch); core diameter. This
  one cannot be taken from photographs -- use the cone method, or
  estimate it with `grip_estimator.py`

Thumb (3):

- `thumb_length` -- thumb channel length
- `thumb_breadth` -- thumb channel width
- `thumb_thickness` -- thumb channel depth

Per finger, 4 values each, index first, pinkie last (12):

- `finger_widths` -- groove size, spacing and positions
- `finger_lengths` -- groove wrap and fingertip curl
- `finger_thicknesses` -- groove depths

Web spaces (3):

- `web_spaces` -- gaps between adjacent fingers: index-middle, middle-ring,
  ring-pinkie

Optional:

- `palm_depth` -- unused in v0.5, kept for compatibility

In the input JSON the per-finger values are grouped into three lists of
four, so the 22 numbers sit in 11 named fields. Out-of-range values are
rejected with a clear error.

### Missing or shortened fingers (v0.5.5)

Hands differ. The generator accepts `null` entries for digits that are
not there, and small sizes for digits that are:

- `finger_lengths[i] = null` -- that finger is not present: the handle
  is built without its groove and without the ridges beside it. The row
  spacing is filled from the fingers that are present.
- `thumb_length = null` -- no thumb channel. (`thumb_breadth` may then
  be `null` too; a present thumb still requires `thumb_breadth`.)
- `null` entries in `finger_widths`, `finger_thicknesses` and
  `web_spaces` mean "not measured": they are filled from the mean of
  the measured values and recorded in the params JSON under
  `_provenance.v055_fills`.
- At least one finger must be present. Ranges accept short fingers:
  widths 5-30, lengths 5-115, thicknesses 4-30, thumb length 8-105,
  thumb breadth 8-36 mm.
- A fully intact hand rebuilds byte-identically to v0.5.4: every new
  code path is a no-op for present, in-range measurements.

`grip_estimator.py` follows the same contract: a missing middle finger
is replaced by the longest present finger; a missing thumb makes the
grip diameter impossible to estimate (a direct measurement is required).

## Tests

```
python3 test_grip_generator_v05.py
```

56 checks: watertight mesh (3 scales), envelope fit, stub/dome layout,
thumb-channel rotation, groove depths, palm swell, fingertip curl, input
wiring, determinism, plus the v0.5.5 set: frozen master numbers, missing
middle finger, shortened (nub) index finger, missing thumb, null web
fills and the new error cases. One check compares the body against a
reference STL and skips politely if that file is absent.

## Version notes

- v0.5.5 -- missing / shortened finger support (null entries, nub-friendly
  ranges); intact hands rebuild byte-identically to v0.5.4
- v0.5.4 -- cleanup only; geometry frozen, byte-identical to v0.5.3
- v0.5.3 -- tilt direction corrected (tip toward the palm flank)
- v0.5.2 -- rotate the thumb channel, not shift it
- v0.5.0 -- nub moved to the thumb side; simplified rewrite of the v0.4.4 body

## Local HY base-model replacement

The browser app (`index.html`) now embeds a template rebuilt from
`assets/base_handle.stl`, an unchanged copy of
`ErgonomicScrewdriver_Modified1_HY.stl`. Open `index.html` in a browser to
use it. The page contains its template and works without a server; optional
AI landmark detection requires its external model download.

The browser app is newer than the Python generator described above. It
calibrates hand photos against a ruler/tape, lets you adjust landmarks,
estimates measurements, and warps a template into a downloadable STL.
The Python v0.5.5 generator still builds its original mathematical handle;
it does not import the HY STL. Its tests do not validate the browser app.

### How the replacement was made

- Original upload: 13,780 triangles; bounding dimensions approximately
  49.91 × 118.14 × 49.11, assuming millimetres (STL has no unit metadata).
- The upload is rotated to the browser's longitudinal X axis and centred.
- Cross sections are sampled onto the existing 239 × 180 radial grid.
  Existing smoothing and closed-end reconstruction produce 86,040 triangles.
- The original upload contains degenerate/nonmanifold connectivity. It is
  retained unchanged; browser output is a reconstructed surface, not a
  byte-for-byte copy. Radial sampling uses the outermost intersection and
  interpolates missing directions, so slots, undercuts, fork details, and
  internal cavities may be filled or changed.
- Finger/thumb masks and reference-hand calibration are inherited from the
  upstream model, with longitudinal positions scaled to the new length.
  Orientation was selected by approximate geometric matching. These are
  starting assumptions, not newly measured ergonomic annotations. Check
  feature alignment and fit before printing a final part.

`assets/example_right.stl` and `assets/example_left.stl` demonstrate output
using `hand_template.json`; they are not personalized to your hand.

Rebuild with `python3 tools/replace_base.py` (NumPy required). The script
uses the checked-out upstream HEAD as its template source and rewrites
`index.html`. Verify browser geometry with `node test_browser_generator.cjs`.
The geometry checks cover closed edges, sphere topology, positive signed
volume, the size envelope and STL byte length, not self-intersections,
mechanical strength or ergonomic suitability.

### Built-in browser example

The page now loads the `hand_template.json` example values from an embedded
copy on startup and immediately generates the right-hand STL. The **Try an
example** section can reload this profile and jump to the build results.
Example values and copied JSON are labeled as sample data. Photo measurement
updates replace the example results. No example hand photos are included.

## Simplified baseline viewer (current entry point)

`index.html` now displays the exact uploaded STL using an offline canvas
viewer. Drag to rotate, reset the view, or download the unchanged original.
It has no hand measurements or deformation. The previous experimental app
is preserved as `index_advanced_backup.html`. Its geometry tests apply to that
advanced version, not the baseline viewer. `tools/replace_base.py` is an
advanced-version rebuild tool and overwrites index.html; do not run it against
this simplified viewer unless intentionally restoring the advanced workflow.

## Current interface and source organization

Open `index.html` with the accompanying `assets` directory in place. Choose
**Enter measurements** for the example/manual JSON workflow or **Measure
photos** for all three photo steps, calibration, AI landmarks, and digit
presence controls. The reference baseline is displayed in a disclosure and
cannot be edited through the interface. Detailed results and JSON export
are also collapsible. New input edits invalidate any previously generated
STL download.

- `index.html`: page structure and controls.
- `assets/app.css`: responsive styling.
- `assets/app.js`: photo measurements, manual/example input, and export UI.
- `assets/generator.js`: unchanged geometry engine.
- `assets/template.js`: embedded HY template and calibration.

The files use ordinary scripts, so local-file opening still works without
installation or a server. Keep these files together. The template rebuild
script now updates only `assets/template.js`, preserving interface edits.
Run `node test_browser_generator.cjs` for geometry checks. The simplified
viewer remains separately available in `simple_viewer.html`.

## Baseline identity and source deformation

The default example now equals the fixed reference hand. For the right hand,
matching reference values return assets/base_handle.stl byte-for-byte.
assets/source-model.js embeds that original model and the reference inputs.
assets/deform-source.js applies the difference between the old engine's target
and reference displacement fields to the original vertices, preserving the
source triangulation rather than replacing it with a radial surface. This
also retains source mesh defects. The interface reports actual closed-edge
connectivity; it does not certify the output for printing. Orientation and
feature regions remain approximate.

Run node test_source_deformation.cjs to check exact identity, continuity near
the reference, changed-size/missing-digit/mirrored output, and triangle count.
The older test_browser_generator.cjs checks the underlying radial engine.

## Deformation validation view

The validation panel overlays the original STL (gray wireframe) and generated
or diagnostic output (green). Drag to rotate. Select any of the 19 measurement
inputs and use −10%, baseline, or +10% to vary only that input relative to the
fixed reference. Diagnostic probes never replace the exported build. Show
 generated output returns to the latest generated result. Vertex movement
statistics include maximum and RMS displacement. Hand length and hand breadth
currently have no direct geometric effect and are identified in the selector.
Finger/thumb labels are approximate inherited template locations, not verified
landmarks on the source. Run `node test_validation.cjs` to exercise all 19
positive probes, identity reset, overlay initialization, and result switching.

### Viewer performance

Rendering is coalesced through requestAnimationFrame. The default wireframe
shows every fourth triangle and every sixteenth while dragging; full-detail
preview is optional. Downloaded meshes and displacement metrics retain all
triangles. Canvas backing dimensions are updated only when size changes, with
preview pixel density capped at 1.5. Parsed meshes are weakly cached and the
last eight generation results are cached. Selecting a measurement no longer
starts generation automatically; press a probe button. Baseline generation
reuses its reference deformation field. `test_validation.cjs` also checks that
100 pointer movements queue only one rendering frame.

## Separate region calibration editor

Open `orientation-editor.html` alongside the existing assets directory.
Choose a digit, enable **Place selected point on click**, and click the visible
STL surface. Drag with placement disabled to rotate. Adjust XYZ point coordinates
and ellipsoid radii, then Apply. Front/Side/Back, undo, reset, and JSON export /
import are provided. Points use the unmodified uploaded STL's coordinates in mm;
the camera pose is not part of calibration. These proposed ellipsoid regions are
independent of the generator's inherited radial masks. The main generator does
not yet import this calibration. Run `node test_orientation_editor.cjs` for control
and surface-picking checks; actual browser graphics require visual verification.

## Installed user calibration

`assets/hand-calibration.json` preserves the supplied grip-calibration.json;
`assets/calibration.js` makes it available without local-file fetch requests.
The main deformation samples the inherited displacement field at relocated
finger/thumb centers, blended inside the supplied ellipsoid radii. Outside
these ellipsoids, the inherited field remains active. This is an approximate
field relocation, not a newly fitted anatomical solver. Baseline identity
remains exact. Main viewer colors and region callouts use the supplied regions.
The skeletal guide uses their axial positions and contact directions, with
measurement-driven bone lengths and wrap radius. The separate editor includes
a baseline skeletal guide that follows edits immediately. Later editor exports
must be installed explicitly; browser edits do not rewrite project assets.

Finger overlay curl direction now follows the marked underside (negative
angular direction in the source cross-section); the thumb opposes it. Joint
locations are found along the displayed STL cross-section with half-finger-
thickness clearance while maintaining each assumed bone segment's measured
chord length. If a segment cannot reach another point within a half turn, it
uses a tangent continuation. This is still an estimated pose, not collision
or biomechanical validation. Palm-wrap tests check baseline finger curl sign,
joint locations on the offset cross-section, and preserved bone lengths.

## Palm removal

Palm paths, translucent patches, wrist bands, and the 65% palm-wrap assumption
have been removed from both viewers. Manual palm-length entry and its diagnostic
probe are removed. Browser geometry fixes the former palm-dependent axial
section at its reference scale. Legacy JSON may contain palm_length but it is
ignored; missing or null palm length does not prevent generation. Finger/thumb
geometry and grip diameter remain active. The standalone historical Python
v0.5 generator is unchanged. test_palm_wrap.cjs now guards palm independence
and absence of palm overlays rather than the obsolete wrap implementation.

The shared thumb overlay now runs mostly along the model's longitudinal −Y
axis toward the pinky end, with a small diagonal wrap, rather than curling
circumferentially like the fingers. It follows available cross-sections and
preserves the two assumed segment lengths. `test_thumb_orientation.cjs` checks
this direction and total length against the installed calibration for both
hands. This changes the skeletal visualization; the region centers and STL
calibration are not moved by it.

## Smoother right-hand revision (experimental)

The browser generator now supports only right-hand outputs. To reduce surface
folds, the calibrated displacement-field relocation is limited to 20% and the
field (not the source mesh) is smoothed for 32 passes. This reduces the visual
artifacts but also softens localized changes. The 30 regenerated cases and
independent crossing results are in `validation/right_hand_revision/`.
The original mesh is still non-manifold and self-intersecting, and four revised
cases have a crossing pair not seen in the original. These are not final or
print-ready. The original right-hand baseline still reproduces byte-for-byte.

# Hand-size sweep: STL validation

**Result: generation is numerically stable for the tested profiles, but the current meshes are not validated as print-ready.** Original mesh defects persist, and several deformations introduce additional triangle crossings. Do not interpret successful STL export as successful fit or valid solid geometry.

## Anthropometry and profiles

Reference: [ANSUR II original distribution, hosted by the University of Michigan](https://mreed.umtri.umich.edu/mreed/downloads/anthro/ANSUR2Distribution.zip), described by the [U.S. Army](https://www.army.mil/article/188601/for_good_measure_natick_releases_raw_data_from_army_wide_anthropometric_survey) and [UMTRI](https://mreed.umtri.umich.edu/mreed/downloads.html). The files contain 1,986 female and 4,082 male records. This is military anthropometry, not a civilian population standard or an ergonomic certification.

I selected an actual record at the nearest-rank 1st, 5th, 50th, 95th and 99th **hand-length** percentile for each sex. Breadth and palm length come from that same record; they are not independently matched percentiles. Tie choice is deterministic CSV order. No identifying or demographic details beyond sex are reproduced in the test profiles.

ANSUR II does not supply all digit dimensions required by this app. Finger length was estimated from hand length minus palm length, preserving baseline relative finger proportions. Thumb length was scaled by overall hand length; digit widths and thicknesses by hand breadth. Grip diameter uses the app's existing (thumb length + middle length + thumb thickness) / pi heuristic. These derived digit and grip measurements are **synthetic assumptions**, not published percentile standards. The subtraction is a landmark proxy and is not a validated finger-length prediction. Palm length is used only to construct this test proxy; it does not drive the generator.

For each of 10 observed anchors, thickness was varied to 85%, 100%, and 115% of the estimate; each was generated for both hands: **60 cases**. Bounds are plausible stress-test assumptions, not demonstrated joint population coverage.

| Anchor by hand length | Hand length mm | Same record breadth mm | Estimated grip mm | Strict crossing pairs* |
|---|---:|---:|---:|---:|
| female_P01 | 160 | 76 | 45.45 | 5 |
| female_P05 | 165 | 77 | 46.43 | 9 |
| female_P50 | 180 | 79 | 50.87 | 6 |
| female_P95 | 199 | 79 | 54.34 | 5 |
| female_P99 | 207 | 81 | 58.93 | 7 |
| male_P01 | 172 | 85 | 50.12 | 24 |
| male_P05 | 177 | 86 | 49.83 | 27 |
| male_P50 | 193 | 90 | 52.32 | 16 |
| male_P95 | 210 | 92 | 59.23 | 5 |
| male_P99 | 218 | 93 | 63.10 | 18 |

The requested F99 and M1 anchors are 207 mm and 172 mm long respectively. The wider F1–M99 span is 160–218 mm. A person does not have one percentile applicable to all dimensions.

## Independent geometry checks

- Successful generation, exact binary STL length and finite coordinates: **60/60**.
- Triangle count preserved: **13,780** throughout.
- New zero-area faces relative to source: **0** across all cases.
- Zero boundary edges: **60/60**. This does not establish watertightness: all retain **10 non-manifold edges** and **40 degenerate faces**.
- Source signed volume: **-149556.5 mm³**; all 60 generated cases also have negative signed volume. This indicates reversed aggregate winding under the usual outward-normal convention; the app currently displays its absolute magnitude.
- Source has at least **5 strict transverse triangle-crossing pairs**. Nominal right-hand profiles have **5–27**. For example M1 has **24**, so at least 19 pairs beyond the source count. F99 has **7**, at least 2 beyond the source count. These outputs fail the crossing check.
- Faces rotate more than 90 degrees relative to their original normals in some deformations. This flags regions for inspection; it is not by itself proof of inversion, since true rotation can also change a normal direction.

*Crossing check: AABB spatial-grid broad phase plus segment/triangle intersection tests on the actual exported vertices. It tests ten nominal right-hand profiles plus the source. Coplanar contacts, boundary-only contacts, shared-vertex pairs and degenerate triangles are excluded. Counts are lower bounds, not exhaustive self-intersection certification. The other 50 cases received structural checks only. The left-hand winding is corrected for reflection in comparisons.

Baseline identity and tiny-perturbation continuity regressions also pass. An additional 11-profile interpolation is saved in continuity.json; adjacent movement is measured, but no universal acceptable-displacement threshold is claimed.

## Files and next work

- `profiles.json`: every generated hand profile with provenance and thickness factors.
- `anthropometry/percentiles.json`: observed reference dimensions.
- `generation-results.json`: app results, including its reported checks.
- `mesh-audit.json`: independent checks on the actual STL vertices.
- `stls/`: all 60 generated STL files.
- `continuity.json`: displacement along the F1–M99 interpolation.

Reproduce from the project directory: `python3 validation/make_profiles.py`, `node validation/generate_cases.cjs`, `python3 validation/analyze_meshes.py` (NumPy required), `node validation/check_continuity.cjs`, then `python3 validation/write_report.py`.

The next geometry work should repair a separate copy of the original mesh, preserve the current original for baseline comparison, and constrain deformation to prevent crossings. Neither these tests nor the skeletal overlay establishes comfort, grip security, attachment strength, or biomechanical fit.

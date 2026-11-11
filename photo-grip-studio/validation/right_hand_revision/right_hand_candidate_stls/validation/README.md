# Right-hand grip revision — prototype meshes

These 30 files use the smoother deformation field and the user's calibrated
finger/thumb regions. The relative displacement is smoothed for 32 passes and
local calibration relocation is limited to 20% to reduce surface folds. This
also softens localized changes, so dimensional fit remains unverified. Only
right-hand STLs are included. An unchanged original is also included for
comparison. Baseline input still returns that original byte-for-byte.

The 30-case inspection found no newly degenerate triangles. All retained five
strict transverse crossing pairs, equal to the original count; four cases had
one newly appearing pair and one original pair no longer detected. The strict
crossing test excludes coplanar contacts, boundary contacts, shared vertices,
and degenerate triangles. Several meshes also have triangles with normals
rotated more than 90 degrees from the source. These signals do not alone prove
inversion but warrant geometric inspection.

The original has 40 degenerate faces, 10 non-manifold edges, negative signed
volume, and at least five crossings. These defects remain. **These files are
experimental and have not been validated as watertight, print-ready or fit for
load-bearing use.** The baseline was not repaired because the project requires
baseline output to reproduce the uploaded file exactly. A separately repaired
baseline and physical fit tests are needed before final use.

`results.json` includes independent measurements for every case. The profiles
are synthetic combinations informed by ANSUR II hand-length and breadth data;
individual finger dimensions and thickness factors are estimates, not a claim
of population coverage.

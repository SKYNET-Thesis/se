SO-101 model assets

The SO-101 robot model files in this folder come from TheRobotStudio/SO-ARM100
(https://github.com/TheRobotStudio/SO-ARM100), licensed under the Apache License 2.0.
A copy of the licence is in the LICENSE file next to this file.

meshes/*.stl: redistributed unmodified.
urdf/so101_new_calib.urdf: adapted from Simulation/SO101/so101_new_calib.urdf
(link names and formatting changed for the VISTA web viewer).

VISTA uses these files only to display the SO-101 arm in the browser.

meshes-web/*.msh and meshes-web/manifest.json: derived by VISTA from meshes/*.stl (Apache License 2.0, section 4(b): this is a
modification). Each file was produced by scripts/build-so101-web-meshes.ts: identical vertices welded, the triangle count reduced to
about one fifth with meshoptimizer (worst deviation 0.2% of the part's size, typically 0.02-0.06%), smooth normals recomputed with hard
edges kept, and the result written in VISTA's compact VMESH format. manifest.json lists, for every file, the SHA-256 of the unmodified
STL it came from. The STL originals in meshes/ are unchanged and are used as the fallback when a web mesh cannot be loaded.

The unmodified STL meshes were verified byte-for-byte (SHA-256) against TheRobotStudio/SO-ARM100, Simulation/SO101/assets, and the
LICENSE against that repository's Apache-2.0 LICENSE, on 2026-11-24.

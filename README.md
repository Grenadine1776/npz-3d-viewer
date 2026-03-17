# npz-3d-viewer

Small browser app for inspecting and previewing SMPL-family motion `.npz` files.

## Run

```bash
npm install
npm run dev
```

Then open the local Vite URL and upload an `.npz` file.

## Supported motion schema

Current viewer support is aimed at motion files like this schema:

- `poses`: `[frames, 156]`
- `Rh`: `[frames, 3]`
- `trans`: `[frames, 3]`
- optional metadata like `gender` and `betas`

This is closer to SMPL-H / SMPL-family pose data than plain 24-joint SMPL.

## Current scope

- parses `.npz` directly in the browser
- shows contained arrays, dtypes, shapes, and sample values
- plays motion as an approximate 3D stick figure
- draws the root trajectory

This viewer is meant for quick animation preview rather than full mesh rendering.

## Proprietary assets

`.npz` and `.fbx` files are gitignored by default because they may contain proprietary motion data.

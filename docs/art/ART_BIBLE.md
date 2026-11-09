# FarmVerse Art Bible

Use this guide whenever Codex or Antigravity generates, edits, or integrates FarmVerse art. The [Phaser MVP guide](../FARMVERSE_PHASER_MVP_GUIDE.md) defines the visual direction. This document records how to apply and verify it.

## Style reference

**Status:** Awaiting the first approved style reference. Save the approved image as `docs/art/approved_style.png` and record the camera, proportions, and color decisions it establishes here. Get approval for the image and these decisions before generating a batch. Use placeholder sprites to keep gameplay work moving.

- Use a hand-painted 2.5D look with a fixed isometric-like camera and consistent proportions across Farm and Store.
- Use moss and olive greens, warm earth browns, and muted gold. Light the scene like a warm afternoon with soft shadows.
- Aim for a cozy, refined casual look. Keep the shapes legible at gameplay scale, especially plot states and Normal versus Golden crops.
- Build scenes from reusable sprites. Create original assets and record the source or license of any reference used.

## Generate or revise a sprite

1. Read the approved reference and inspect neighboring approved sprites. For the first style sample, use the visual direction above and submit it for review.
2. Specify the asset's role, camera, scale, palette, lighting, canvas size, and transparency in the prompt. Request a clean silhouette and a clear contact point for placement.
3. Check dimensions, transparency, cropping, anchor, scale, and consistency across variants or frames. Preview the asset at gameplay size with related sprites when a scene is available.
4. Submit the candidate to the Lead. The assigned integrator places the approved game-ready copy in `web/public/assets/`. Keep editable originals in `art/source/` when useful for future edits or an engine change.

## Asset handoff

For each asset, include its ID or filename, path, intended scene or state, pixel dimensions, anchor, prompt or source reference, rights or credits if applicable, and approval status. Mark candidates as pending until reviewed. Keep this information with the task handoff until the asset set needs a dedicated manifest.

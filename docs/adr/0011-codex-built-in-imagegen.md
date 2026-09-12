# Use Codex built-in image_gen for image assets

`image_asset` calls Codex's built-in `image_gen` through `codex exec`, rather than invoking a direct image API or silently falling back. This preserves the approved no-API-key workflow and the validated generation/edit/enhancement behavior, but final artifacts begin under `$CODEX_HOME/generated_images/`; the tool must copy a decoded PNG through its staging flow before publishing it in the workspace. A direct API fallback requires a new explicit user decision and capability proof.

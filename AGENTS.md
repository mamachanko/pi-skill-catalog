# Repository Guidelines

## Scope
- This repository contains a Pi extension only.
- Do not patch Pi core from this repository.
- Keep behavior extension-scoped and observational unless explicitly requested otherwise.

## Product Intent
- Report which skills Pi actually loaded in the current session.
- Surface discrepancies between loaded skills and skills found in conventional directories.
- Do not silently import, merge, or broaden Pi behavior without explicit user approval.

## Code Style
- Keep the extension as a single focused TypeScript file unless complexity clearly requires splitting.
- Prefer small pure helper functions for path handling, skill discovery, and UI formatting.
- Avoid `any`.
- Keep messages technical and concise.

## UX Rules
- `/skills` must reflect only skills Pi actually loaded.
- Startup observability may mention conventional-directory skills that were not loaded, but only as diagnostics.
- Unknown `/skill:*` input should be flagged instead of falling through silently.

## Verification
- After changes, reload the extension in Pi and verify:
  - startup block renders once
  - startup block disappears after first input
  - `/skills` opens the custom selector
  - loaded skills insert exact `/skill:name` commands
  - not-loaded skills are reported as discrepancies only

## Git
- Stage only files changed in this repository.
- Do not use `git add .` or `git add -A`.

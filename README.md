# pi-skill-catalog

A Pi extension for skill observability.

## What it does

- shows a startup-only `Skills` block above the editor
- lists skills Pi actually loaded for the current session
- separately lists skills found in the conventional `~/.pi/agent/skills` directory that Pi did not load
- adds `/skills` to browse currently loaded skills in a custom selector
- blocks unknown `/skill:*` commands from silently falling through to the model

## Design principle

This extension is observational, not behavioral.

It does **not** import, merge, or activate extra skills on Pi's behalf. It only reports the discrepancy between:

- the skills Pi actually loaded for the current session
- the skills present on disk in the conventional `~/.pi/agent/skills` directory

That keeps the extension aligned with Pi's real behavior.

## Commands

- `/skills` — open the loaded-skills selector
- `/skills <name>` — insert `/skill:<name>` into the editor for a loaded skill

## Startup behavior

On startup, the extension renders a `Skills` block that shows:

1. skills loaded in the current Pi session
2. conventional-directory skills present on disk but not loaded

After the first input event, the startup block is removed.

## Install

### From npm

```bash
pi install npm:pi-skill-catalog
```

### From git

```bash
pi install git:github.com/mamachanko/pi-skill-catalog
```

### From a local checkout

```bash
pi install /absolute/path/to/pi-skill-catalog
```

## Development install

Copy or symlink `skill-catalog.ts` into the active Pi extensions directory.

Typical locations:

- active agent dir: `${PI_CODING_AGENT_DIR}/extensions/`
- default agent dir when `PI_CODING_AGENT_DIR` is unset: `~/.pi/agent/extensions/`

Example with a symlink:

```bash
ln -s "$PWD/skill-catalog.ts" "${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/extensions/skill-catalog.ts"
```

Then reload Pi:

```text
/reload
```

## Publish to npm

The conventional setup here is:

- publish an npm package named `pi-skill-catalog`
- include a `pi` manifest in `package.json`
- publish on version tags through GitHub Actions
- use npm trusted publishing for the workflow

### One-time setup

1. Create the package on npm under the account that should own it.
2. In npm, configure this repository as a trusted publisher for the package.
3. In GitHub, keep the publish workflow enabled.

### Release flow

1. Bump `package.json` version.
2. Commit the version change.
3. Create and push a matching git tag:

```bash
git tag v0.1.0
git push origin main --tags
```

4. GitHub Actions runs `.github/workflows/publish.yml`.
5. The workflow verifies the tarball with `npm pack --dry-run` and publishes to npm.

## Repository contents

- `skill-catalog.ts` — the extension
- `package.json` — npm package metadata and Pi manifest
- `.github/workflows/publish.yml` — npm publish workflow
- `AGENTS.md` — repository-specific guidance

## Development notes

This extension uses Pi's extension API and `@mariozechner/pi-tui` components to provide:

- startup-only observability UI
- a custom selector for loaded skills
- input interception for unknown or not-loaded `/skill:*` invocations

## Verification checklist

After changes, verify in Pi that:

- the startup block appears once
- it disappears after the first input
- `/skills` opens the custom selector
- selecting a loaded skill inserts the exact `/skill:name` command
- not-loaded conventional skills are reported as discrepancies only

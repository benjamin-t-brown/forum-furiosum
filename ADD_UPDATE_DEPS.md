# Adding and updating dependencies

This project pins dependency versions and restricts which packages may run install-time lifecycle scripts (`preinstall`, `install`, `postinstall`). The goal is reproducible installs and a smaller attack surface from arbitrary postinstall code.

## Requirements

- **Node.js** >= 20
- **npm** >= 11.17.0 (required for install-script allowlists)

npm is pinned in `package.json`:

```json
"packageManager": "npm@11.17.0"
```

### One-time setup

Enable Corepack so the pinned npm version is used automatically in this repo:

```bash
corepack enable
```

If Corepack cannot be enabled (e.g. permission errors on Windows), upgrade npm globally instead:

```bash
npm install -g npm@11.17.0
```

Verify:

```bash
npm --version   # should be 11.17.0 or newer
```

## Configuration

### `.npmrc`

| Setting | Purpose |
| --- | --- |
| `save-exact=true` | New dependencies are saved without `^` or `~` ranges |
| `strict-allow-scripts=true` | Install fails if a dependency has install scripts not covered by `allowScripts` |

### `package.json` → `allowScripts`

Only approved packages may run install scripts. Everything else is blocked.

Current policy:

| Package | Policy | Notes |
| --- | --- | --- |
| `argon2@0.41.1` | allowed | Native module; needs install scripts |
| `better-sqlite3@12.9.0` | allowed | Native module; needs install scripts |
| `esbuild` | denied (any version) | Transitive dev dependency; scripts not needed here |
| `fsevents` | denied (any version) | Optional macOS watcher; not needed on Linux/Windows |

Allowed entries are **version-pinned** for security. Denied entries use **name-only** entries so transitive version bumps do not require manual edits.

## Adding a dependency

```bash
npm install <package-name>
```

Because `save-exact=true` is set, the exact resolved version is written to `package.json` and `package-lock.json`.

If the new package (or one of its dependencies) has install scripts, `npm install` will fail with an `ESTRICTALLOWSCRIPTS` error listing the unreviewed packages.

**If the scripts are required** (e.g. a native addon):

```bash
npm approve-scripts <package-name>
```

**If the scripts are not required:**

```bash
npm deny-scripts <package-name>
```

Then confirm nothing is left unreviewed:

```bash
npm run deps:check-scripts
```

Expected output when clean:

```text
No packages with unreviewed install scripts.
```

## Updating a dependency

```bash
npm update <package-name>
```

Or install a specific version:

```bash
npm install <package-name>@<version>
```

After updating:

1. **Re-approve native modules** if their version changed:

   ```bash
   npm approve-scripts argon2 better-sqlite3
   ```

   `npm approve-scripts` writes pinned `pkg@version` entries to `allowScripts`.

2. **Check for new install scripts** introduced by the update:

   ```bash
   npm run deps:check-scripts
   ```

3. **Run tests:**

   ```bash
   npm test
   ```

4. **Commit** `package.json`, `package-lock.json`, and any changes to `allowScripts`.

## Useful commands

| Command | Purpose |
| --- | --- |
| `npm run deps:check-scripts` | List packages with install scripts not yet in `allowScripts` |
| `npm approve-scripts <pkg> …` | Allow install scripts for specific packages (pinned by default) |
| `npm approve-scripts --allow-scripts-pending` | Same as `deps:check-scripts` |
| `npm deny-scripts <pkg> …` | Explicitly deny install scripts (name-only entries) |
| `npm ci` | Clean install from lockfile (use in CI and Docker) |

## Docker

The `Dockerfile` enables Corepack and copies `.npmrc` alongside `package.json` and `package-lock.json`, so container builds use the same pinned npm version and install-script policy as local development.

```dockerfile
RUN corepack enable
COPY package.json package-lock.json .npmrc ./
RUN npm ci
```

Production stage uses `npm ci --omit=dev` with the same files.

## Troubleshooting

### `Unknown project config "strict-allow-scripts"`

Your npm version is too old (< 11.17). Upgrade npm or enable Corepack (see [One-time setup](#one-time-setup)).

### `ESTRICTALLOWSCRIPTS` on install

A dependency has install scripts that are not in `allowScripts`. Read the error output for package names, then approve or deny each one (see [Adding a dependency](#adding-a-dependency)).

### Native modules fail at runtime (`better-sqlite3`, `argon2`)

Ensure those packages are approved in `allowScripts` and that their install scripts actually ran during `npm install` / `npm ci`. Reinstall if needed:

```bash
rm -rf node_modules
npm ci
```

### Bumping `argon2` or `better-sqlite3`

After updating the version in `package.json`, re-run:

```bash
npm approve-scripts argon2 better-sqlite3
```

The old pinned entry in `allowScripts` will be replaced with the new version.

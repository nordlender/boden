# Scripts

Quality-of-life scripts for local dev. Run from the repo root, or via the
`npm run` aliases below.

## `dev-tunnel.sh` — `npm run dev:tunnel`

Starts the Astro dev server (if it isn't already running) and exposes it to
the internet with a public URL, using localtunnel. Useful for testing on a
phone or sharing a link with someone else.

The dev server keeps running in the background after you stop the tunnel
(Ctrl+C). Stop it separately with `npx astro dev stop`.

## `branch-status.sh` — `npm run branches`

Prints a table of every local branch: whether it's merged into `main`, its
PR number (if it was merged via a "Merge pull request #N" commit), how many
commits ahead of `main` it is, when it was last touched, and which worktree
(if any) has it checked out.

Use this to see what's safe to clean up before running `prune-worktrees.sh`,
or just to get a picture of what's in flight.

```
npm run branches
```

## `prune-worktrees.sh` — `npm run worktrees:prune`

Removes worktrees whose branch has already been merged into `main`, and
deletes the now-unneeded branch. Safe by default:

- **Dry run unless you pass `--yes`** — with no flags it only lists what it
  *would* remove.
- Never touches the main worktree or the one you're currently running from.
- Skips locked worktrees.
- Skips a worktree if it has uncommitted or untracked changes, even if its
  branch is merged — you'll see it listed under "Skipped" with the reason.

```
npm run branches            # see what's merged first (optional)
npm run worktrees:prune     # dry run — lists what would be removed
npm run worktrees:prune -- --yes   # actually remove them
```

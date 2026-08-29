# Starting the dev server

## Which worktree/branch?

Before starting the server, an agent should ask the user which
worktree/branch to serve — different worktrees can have very different
content (e.g. one branched from `main` with just the starter template vs.
`feature/auth` with the actual site), and serving the wrong one looks like
a broken site rather than a wrong-branch problem. Present the agent's
current worktree as option 1 (the likely default), but confirm rather than
assuming it's the one the user wants to see.

This project uses Astro. To make the dev server reachable from outside the
container (not just `localhost` inside it), bind it to `0.0.0.0` on port
`4321` explicitly:

```
npx astro dev --background --host 0.0.0.0 --port 4321
```

(If `astro` is installed as a project dependency but not on your `PATH`,
`npx astro ...` resolves it from `node_modules/.bin`. Run `npm install`
first if `node_modules` doesn't exist yet.)

## Managing the background server

```
npx astro dev status   # check if it's running, PID, uptime
npx astro dev logs      # tail server logs
npx astro dev stop      # stop it
```

## Verifying it's up

```
curl -I http://localhost:4321
```

A `200 OK` (or similar) response confirms the server is listening.

## Port 4321 already in use

If `astro dev status` shows it's already running, either reuse that
instance or stop it first:

```
npx astro dev stop
```

If something *other* than this project's dev server is holding the port,
find and stop it manually:

```
lsof -i :4321
kill <pid>
```

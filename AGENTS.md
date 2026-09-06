## Terminology

This project is being reworked around two distinct concepts — use these terms consistently, don't substitute "product" and "item" for each other:

- **Product**: a category-level listing an admin creates (e.g. "Edelrid Harness"). Holds shared info (title, description, category) and the option rows (e.g. Size, Color) that define its variants.
- **Item**: one specific permutation of a product's options (e.g. "Edelrid Harness, Green, M"). Items are what actually get rented — orders/rentals always reference items, never products. Products exist only to categorize and display items in the web shop.

See `docs/schema.md` for the full schema and design rationale.

## Project docs

Start with `README.md` for the overview, stack, and setup. `TASKS.md` is the
live task tracker — check it before starting work so you don't duplicate or
contradict something already decided. Topic-specific detail lives in
`docs/` — see `README.md`'s Documentation section for the full index.

## Development

Before starting the dev server, ask the user which worktree/branch to
serve — different worktrees can have very different content, and serving
the wrong one looks like a broken site rather than a wrong-branch problem.
Present the agent's current worktree as the likely default, but confirm
rather than assuming it's the one the user wants to see.

Start it in background mode, bound to `0.0.0.0` so it's reachable from
outside the container:

```
npx astro dev --background --host 0.0.0.0 --port 4321
```

Manage it with `npx astro dev status`, `npx astro dev logs`, and
`npx astro dev stop`. Verify it's up with `curl -I http://localhost:4321`.

If port 4321 is already in use by something other than this project's dev
server, find and stop it manually: `lsof -i :4321` then `kill <pid>`.

## Astro documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)

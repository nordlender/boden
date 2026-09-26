## Terminology

This project is being reworked around two distinct concepts — use these terms consistently, don't substitute "product" and "item" for each other:

- **Product**: a category-level listing an admin creates (e.g. "Edelrid Harness"). Holds shared info (title, description, category) and the option rows (e.g. Size, Color) that define its variants.
- **Item**: one specific permutation of a product's options (e.g. "Edelrid Harness, Green, M"). Items are what actually get rented — orders/rentals always reference items, never products. Products exist only to categorize and display items in the web shop.

See `docs/schema.md` for the full schema and design rationale.

## Development

When starting the dev server, use background mode:

```
astro dev --background --host 0.0.0.0 --port [port]
```

The usable ports are 4321, 4322, 4323, 4324.
Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)

### Styling

This project uses a semantic theme-token system (`--ui-*`/`--color-*` in `src/styles/global.css`) for all colors, with light/dark mode support. Never use raw Tailwind palette classes (`bg-slate-100`, `text-gray-500`, literal `white`/`black`, etc.) in components or pages — use the semantic utilities (`bg-surface`, `text-text-muted`, `border-selected-border`, ...) instead. See `docs/styling.md` for the full token reference and rules.

## Workflow
### Tasks
Tasks are now done through GitHub issues. Use the github-issue-tasks skill. When planning work-items this should be used.

### Commits
All commits should use the conventional commits format.

### PR's
Generally work is done on separate worktrees. If there is one set of features for one worktree, one can continue there. For example, one worktree for reservation, one for cart, and so on. Also, worktrees can branch off existing worktrees for minor work items or new features. If, for example, there is a functioning cart page, and one wants to add a new feature, a new PR should be created for that feature branching off cart.

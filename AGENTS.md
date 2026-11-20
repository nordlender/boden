## Terminology

This project is being reworked around these distinct concepts — use these terms consistently, don't substitute "product", "item" and "unit" for each other:

- **Product**: a category-level listing an admin creates (e.g. "Edelrid Harness"). Holds shared info (title, description, category) and the option rows (e.g. Size, Color) that define its variants.
- **Item**: one specific permutation of a product's options (e.g. "Edelrid Harness, Green, M"). Items are what actually get rented — orders/rentals always reference items, never products. Products exist only to categorize and display items in the web shop.
- **Unit**: one physical object of an item (e.g. the Dragon Cam #2 bought in 2023 with serial 0042). Admin-only: an item's stock is the number of its active units, and units carry the per-object details (brand, model, marking, serial, dates, status, opts) and a history of notes (messages with `unitId` set). Rentals never reference units — a moderator hands out an item, not a particular unit.

See `docs/schema.md` for the full schema and design rationale.

## Development

When starting the dev server, use background mode:

```
astro dev --background --host 0.0.0.0 --port [port]
```

The usable ports are 4321, 4322, 4323, 4324.
Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

### Checks

Before finishing a change, run what applies: `npm test` (vitest), `npm run typecheck` (`astro check`), `npm run lint`, and `npm run docs:check` / `npm run docs:schema:check` when docs or `src/db/schema.ts` changed. The schema block in `docs/schema.md` is generated (`npm run docs:schema`); never edit it by hand.

## Documentation

Project docs live in `docs/` (schema, stock model, styling, spacing, sizing, icons, wizard, moderator review). Check the relevant one before working in that area.

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)

### Styling

This project uses a semantic theme-token system (`--ui-*`/`--color-*` in `src/styles/global.css`) for all colors, with light/dark mode support. Never use raw Tailwind palette classes (`bg-slate-100`, `text-gray-500`, literal `white`/`black`, etc.) in components or pages — use the semantic utilities (`bg-surface`, `text-text-muted`, `border-border-strong`, ...) instead. See `docs/styling.md` for the full token reference and rules.

Spacing works the same way: semantic spacing tokens (`p-card`, `gap-region`, `gap-stack`, `px-gutter`, ...) plus shared primitives — wrap pages in `ui/Page.astro`, panels in `ui/Card.astro`, alerts in `ui/Callout.astro`, and take field/table/menu classes from `src/lib/form-styles.ts`, `table-styles.ts` and `layout-styles.ts` instead of hand-rolling padding. The default is roomy; only the shop grid and small elements stay dense. See `docs/spacing.md`.

### Reuse components before creating new ones

Before writing a new component (or hand-rolling markup that looks like one), search `src/components/` (especially `ui/`) and the style libs in `src/lib/` for something that already does, or closely resembles, what the user asked for.

1. **Reuse as-is** if an existing component fits. This is the default.
2. **If one closely resembles the need but doesn't quite fit, prefer refactoring it** (new prop, slot, or variant, or extracting a shared piece) over creating a near-duplicate.
3. **Refactoring needs the user's approval, in two steps:**
   1. First ask whether they want the refactor at all: name the component, what it can't do today, and why refactoring beats a new component.
   2. If they agree, ask again before touching anything, this time showing the concrete changes: the proposed diff or code for the component's new API and implementation, plus the existing call sites it affects. Only apply it once they confirm that.
4. **Create a new component only when nothing existing is close enough**, and say briefly what you looked at and why it didn't fit.

Don't refactor a shared component on your own initiative, even for a small tweak: other pages depend on it.

## Workflow
### Tasks
Tasks are now done through GitHub issues. Use the github-issue-tasks skill. When planning work-items this should be used.

### Commits
All commits should use the conventional commits format.

### PR's
Generally work is done on separate worktrees. If there is one set of features for one worktree, one can continue there. For example, one worktree for reservation, one for cart, and so on. Also, worktrees can branch off existing worktrees for minor work items or new features. If, for example, there is a functioning cart page, and one wants to add a new feature, a new PR should be created for that feature branching off cart.

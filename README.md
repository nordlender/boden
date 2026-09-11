# Boden

A gear-rental web shop for a climbing club. Members browse the catalogue and
request a rental online, then pick the gear up in person — a moderator
retrieves it, checks it out, and later checks it back in. Login and
membership status come from [bloc](https://bloc.net) (osiklatring.no's
membership backend), not a separate account system.

## Stack

- [Astro](https://astro.build) (hybrid static/SSR) + [Tailwind CSS](https://tailwindcss.com)
- [Drizzle ORM](https://orm.drizzle.team) over SQLite (`better-sqlite3`)
- [auth-astro](https://github.com/nowaythatworked/auth-astro) with a custom bloc OAuth provider
- [Vitest](https://vitest.dev) for tests, [ESLint](https://eslint.org) for linting

## Terminology

Two concepts are used consistently throughout the code and docs — don't
substitute one for the other:

- **Product** — a category-level listing an admin creates (e.g. "Edelrid
  Harness"). Holds shared info (title, description, category) and the
  option rows (e.g. Size, Color) that define its variants.
- **Item** — one specific permutation of a product's options (e.g. "Edelrid
  Harness, Green, M"). Items are what actually get rented — orders always
  reference items, never products directly.

See [`docs/schema.md`](docs/schema.md) for the full schema.

## Getting started

Requires Node >= 22.12.

```sh
npm install
cp .env.example .env   # then fill in bloc credentials, see below
npm run dev
```

The dev server binds to `localhost:4321` by default. Running inside a
container and need it reachable from outside? See the Development section
in [`AGENTS.md`](AGENTS.md).

### Environment variables

See [`.env.example`](.env.example) for the full list — bloc OAuth app
credentials, the OAuth redirect URI, a session secret, and a temporary
comma-separated admin/moderator user-id allowlist (bloc has no role API
yet).

### Scripts

| Command | Action |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Build for production |
| `npm run preview` | Preview a production build locally |
| `npm test` | Run the test suite once |
| `npm run test:watch` | Run tests in watch mode |
| `npm run typecheck` | Run `astro check` |
| `npm run lint` | Run ESLint |

## Project structure

```
src/
├── auth.ts              # bloc OAuth provider config (auth-astro)
├── components/
│   ├── shop/             # catalogue grid, product cards
│   ├── cart/             # cart sidebar, checkout form
│   ├── nav/               # navbar, user menu, cart button
│   └── wizard/            # admin product/item wizard
├── db/
│   ├── schema.ts          # Drizzle schema (see docs/schema.md)
│   └── migrations/
├── lib/                  # auth, cart, orders, wizard, shop query helpers
├── middleware/            # session + role-gate middleware
└── pages/
    ├── api/                # cart, orders, wizard API routes
    ├── products/[slug]     # product detail page
    ├── admin/               # admin item management
    └── auth/                # sign-in page
```

## Documentation

- Tasks are tracked as [GitHub issues](https://github.com/nordlender/boden/issues), not a `TASKS.md` file.
- [`docs/schema.md`](docs/schema.md) — the current database schema and design rationale.
- [`docs/wizard.md`](docs/wizard.md) — the admin product/item wizard design and implementation notes.
- [`docs/icons.md`](docs/icons.md) — icon system (astro-icon + morphicons).
- [`docs/moderator-review.md`](docs/moderator-review.md) — the moderator order-review page (planned).
- [`docs/auth-handoff.md`](docs/auth-handoff.md), [`docs/auth-testing.md`](docs/auth-testing.md), [`docs/auth-work-items.md`](docs/auth-work-items.md) — bloc OAuth implementation history, manual testing guide, and open items.
- [`docs/bloc-api.md`](docs/bloc-api.md) — notes from exploring bloc's API.
- [`docs/rental-shop.md`](docs/rental-shop.md) — the original project spec.
- [`docs/schema-legacy-fixes.md`](docs/schema-legacy-fixes.md) — historical, superseded by `docs/schema.md`; kept because a few decisions in it are still cited by number elsewhere.

For agent-specific workflow notes (dev server conventions, worktree etiquette), see [`AGENTS.md`](AGENTS.md).

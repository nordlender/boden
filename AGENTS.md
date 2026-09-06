## Terminology

This project is being reworked around two distinct concepts — use these terms consistently, don't substitute "product" and "item" for each other:

- **Product**: a category-level listing an admin creates (e.g. "Edelrid Harness"). Holds shared info (title, description, category) and the option rows (e.g. Size, Color) that define its variants.
- **Item**: one specific permutation of a product's options (e.g. "Edelrid Harness, Green, M"). Items are what actually get rented — orders/rentals always reference items, never products. Products exist only to categorize and display items in the web shop.

See `schema_v2.md` for the full schema and design rationale.

## Development

When starting the dev server, use background mode:

```
astro dev --background
```

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

## Development

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

### Exposing the dev server externally (tunnel)

To let someone reach the dev server from outside this machine/container (e.g.
to preview from a browser that can't reach `localhost` here):

1. Temporarily add to `astro.config.mjs`:

   ```js
   server: { host: true, allowedHosts: true },
   ```

   `host: true` binds `0.0.0.0` instead of just `localhost`. `allowedHosts: true`
   disables Vite's Host-header check, which otherwise 403s any request whose
   `Host` isn't `localhost` — including every tunnel domain. **Revert this
   before committing**; it's only needed while deliberately tunneling.

   Note: passing `--host --allowed-hosts` as CLI flags to `astro dev --background`
   does **not** work as of Astro 7.2.4 — the background-mode re-exec
   (`cli/server.js`'s `buildBackgroundArgs`) re-serializes the `allowedHosts`
   boolean via `String(flags.allowedHosts)`, so `true` becomes the literal
   string `"true"` and gets parsed back as a bogus single hostname rather than
   the wildcard. The `astro.config.mjs` option is the only reliable way to get
   the wildcard while using `--background`.

2. `astro dev --background`
3. Expose it with a tunnel, e.g. [localtunnel](https://github.com/localtunnel/localtunnel)
   (no install/sudo needed):

   ```
   npx --yes localtunnel --port 4321
   ```

   Prints a `https://<random-name>.loca.lt` URL. Run it as a background/detached
   process — it dies when the launching shell exits otherwise.
4. When done: stop the tunnel process, then `astro dev stop`, then revert the
   `astro.config.mjs` server block.

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)

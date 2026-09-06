# Contributing

## Commit messages

This repo uses [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/#specification).

```
<type>[optional scope][optional !]: <description>

[optional body]

[optional footer(s)]
```

- `type` is one of: `feat`, `fix`, `build`, `chore`, `ci`, `docs`, `style`, `refactor`, `perf`, `test`.
- A `!` after the type/scope, or a `BREAKING CHANGE:` footer, marks a breaking change.
- Merge commit messages must also follow the rule (a merge PR's squash/merge commit message is what gets linted).

Examples:

```
feat(cart): allow quantity edits before checkout
fix: prevent double-booking on overlapping order dates
feat!: drop legacy schema fallback
```

See also this [merge-commit convention gist](https://gist.github.com/qoomon/5dfcdf8eec66a051ecd85625518cfd13), which this repo's rules follow for merge/PR titles.

Enforcement:

- Locally, a `commit-msg` git hook (via husky + commitlint) rejects non-conforming commit messages. It's installed automatically on `npm install` (`prepare` script).
- In CI, the `commitlint` job on pull requests lints every commit on the PR branch.
- The `commitlint` check is required in GitHub branch protection for `main`, so non-conforming PRs can't merge.

# Contributing

Thanks for helping! Changes go through pull requests: `master` can't be pushed to directly.

## Workflow

1. Branch off `master`: `git checkout -b feat/short-name`
2. Install your copy into herdr to try it: `./install.sh` (it backs up whatever it replaces; `RANCH_NO_SWITCH=1` skips switching your open window)
3. Run the checks: `node --test` and `python3 -m unittest discover -s tools`
4. Open a PR. CI must pass before it can be merged:
   - **ci-ok**: Node tests (22 and 24), art tests, and a check that the checked-in SVGs match the drawing code
   - **PR title**: see below
5. PRs are **squash-merged**, and the PR title becomes the commit message on `master`.

## Art and sounds

The animal sounds are drawn in code too: edit `tools/sounds.py`, run `python3 tools/sounds.py` and commit the regenerated WAVs. Every picture is drawn in code in `tools/sprites.py`. Edit the drawing functions, never the SVGs, then run `python3 tools/sprites.py` and commit the regenerated files. The top-left 6x6 of every standing animal must stay empty (badges are drawn there); a test enforces it.

If you change how the cards animate, regenerate the README's demo with `python3 tools/demo_gif.py`.

## PR titles

PR titles follow [Conventional Commits](https://www.conventionalcommits.org):

```
type(scope): what it does
```

| type | for |
|---|---|
| `feat` | a new feature |
| `fix` | a bug fix |
| `docs` | README, CHANGELOG, RECIPE, comments only |
| `refactor` | code change that doesn't change behaviour |
| `perf` | faster or lighter |
| `test` | tests only |
| `ci` | GitHub Actions |
| `build` | installer, packaging |
| `style` | formatting only |
| `chore` | anything else that isn't user-facing |
| `revert` | undoing an earlier change |

`scope` is optional and lowercase, e.g. `sprites`, `flock`, `meadows`, `board`, `theme`.
Add `!` for a breaking change, e.g. `feat(layout)!: rename the layout file`.

Examples:

```
feat(flock): add a new rare animal
fix(meadows): keep the reviewer card under the last space
docs: explain the warning toasts
ci: run the art check on every PR
```

## Changelog

User-facing changes go under a version heading in [CHANGELOG.md](CHANGELOG.md). A release is its own `chore(release): x.y.z` PR.

# AGENTS.md

Vue 2.6 + Vue CLI 5 SPA. Front end only: the backend (`qux-java`), the
WebSocket server and Mongo are separate containers. Demo at quant-ux.com.

## Commands

`node_modules` is **not** installed in this checkout. Docker is the path of
record; CI runs exactly these two commands so they cannot drift apart.

| Task | Command |
|---|---|
| Unit tests (all) | `make test` |
| Unit tests (one suite / name) | `make test ARGS="--runInBand -t WidgetTreeUtil"` |
| Lint (report only) | `make lint` |
| Full stack up / down | `make up` / `make down` |
| Prod image | `make build-prod QUX_PUBLIC_PATH=/quant-ux/` |
| Dev image (serves on :8082) | `make build-dev` |

`make test` and `make lint` run in the `test-deps` Docker stage (`node:16`)
with `src/` and `tests/` bind-mounted; only `package.json`, the lockfile and
five root configs are baked in (`Dockerfile:66-73`). So:

- `npm run test:unit` / `npm run lint` on the host need `npm install` first,
  and the host Node is far newer than the image's 16.
- `make lint` forces `--no-fix` on purpose — the trees are bind-mounted and
  the container must not rewrite them. `npm run lint` *fixes* by default.
- A test that needs a new root-level config file needs it added to that
  stage's `COPY` or it will silently be missing inside the container.

Green baseline: **69 suites / 256 tests**, lint 0. Report those numbers in
commit messages. Slow suites: `tSNE`, `Outlier*`, `Analytics`.

## Testing

`jest.config.js` is deliberately not using the `@vue/cli-plugin-unit-jest`
preset. That means **no `vue-jest` transform and `testEnvironment: node`**.
`.vue` files cannot be imported in a spec at all, and `@vue/test-utils` is
installed but unused. Test plain-JS classes and functions; reach widget
behaviour through the model, not by mounting a component.

- Needs `window`/`document`/`File`/`Blob`/`FormData`/`XMLHttpRequest`/
  `Headers`? Put `/** @jest-environment jsdom */` as the first comment.
- `modulePaths: ['<rootDir>/src']` is load-bearing — it is the only reason
  the 21 webpack aliases resolve under jest. Removing it silently stops
  suites running rather than failing them.
- Specs import src with relative paths (`../../src/core/ModelUtil`). Use
  `import X from` for default exports, `import * as X from` for named ones.
- Build a model with `TestUtil.createController(model, data)` →
  `[controller, model, data]`. It clones the fixture, injects
  `MockModelService`/`MockCommandService`, calls `setPublic(true)` so nothing
  touches the network, and stubs the canvas/toolbar surface.
- `tests/unit/createIcons.js` and `tests/unit/ResponsiveTestUtil.js` are
  dead. Do not use or revive them.
- Name a new spec after the module or the broken behaviour
  (`LabelSelectable.spec.js`, `CommandUndo.spec.js`), not a ticket number.
  Regression tests open with a JSDoc above the test naming the original
  defect — that comment is the point of the test. Prefer building a small
  inline model literal over adding a fixture JSON.

## Architecture

No Vuex/Pinia. State is plain objects on `Core` subclasses plus dojo-style
mixins; `src/dojo/` is a vendored dojo subset (`dojo/on`, `dojo/topic`,
`dojo/_base/lang`).

- **Aliases, not relative paths.** `vue.config.js:19-41` roots 21 names in
  `src/`. Write `import Core from 'core/Core'`, not `../../core/Core`.
- **Services: always `Services.getXService()`** (`src/services/Services.js`).
  The getter injects the auth token and picks the public/private/keycloak
  variant (`getModelService(route)`, `getUserService()`). Importing the
  singleton directly skips the token and silently sends unauthenticated
  requests — a real bug this pattern exists to prevent.
- **Model** is flat and id-keyed: `screens`, `widgets`, `lines`, `groups`,
  `templates` are sibling maps related by id (`src/core/ModelFactory.js`,
  `docs/file-format.md`).
- **Every mutation must be wrapped**: `startModelChange()` → mutate +
  `onModelChanged(changes)` → `render()` → `commitModelChange()`
  (`src/canvas/controller/BaseController.js:280,287`). Without the commit
  nothing saves, re-renders, or reaches the undo stack.
- **Undo:** the live stack is the delta `commandChangeStack`
  (`src/canvas/controller/Command.js:22`). The legacy server-persisted
  `commandStack` is dead — `addCommand()` returns immediately when
  `_useChangeStack` is set. Don't revive it.
- `Core.createInheritedModel` (`src/core/Core.js:704`) deep-clones master
  screens and mints inherited ids `<parentId>@<screenId>`. It self-guards on
  `model.inherited`; keep both guards.
- **Rendering is live DOM**, not HTML strings. `RenderFactory` dispatches by
  method name: `_create<Type>` creates a type, `_set_<cssProp>` applies one
  style property.
- **Three different mode strings**, easy to confuse: `Canvas.mode`
  (`edit`/`move`/…), the view mode (`design`/`prototype`), and
  `RenderFactory.mode` (`edit`/`simulator`/`view`).
- Widgets are fake-dojo mixins. `mixins: [UIWidget, DojoWidget]` — the order
  is load-bearing — and `postCreate()` must register the `_borderNodes`,
  `_backgroundNodes`, `_shadowNodes`, `_paddingNodes`, `_labelNodes` slots.

## Adding a widget type — six files

Reference implementation: commit `d602cdf0` (Video).

1. `src/core/widgets/X.vue` — `mixins: [UIWidget, DojoWidget]`, `getName()`,
   `postCreate()`, `render(model, style, scaleX, scaleY)`. Add
   `getState()`/`setState()` only if it should appear in replay.
2. `src/core/RenderFactory.js` — import it and add `_createX(parent, model)`.
3. `src/themes/<set>/x.json` — the palette entry. Missing it and the widget
   has no palette item.
4. `src/services/SymbolService.js` — `import()` the JSON in `getCore()`.
5. `src/canvas/toolbar/components/DataSection.vue` — `_showX(model)` for a
   custom settings panel, else fall back to `getDataProperties()`. The
   palette entry's `has.data` gates whether that panel renders at all
   (`src/canvas/toolbar/mixins/_ShowWidget.vue:240`); it only affects newly
   dropped widgets, never existing ones.
6. `src/style/widgets/widgets.scss` — `.MatcWidgetTypeX`,
   `.MatcWidgetTypeXEl`.

Miss #2 and you get `console.warn("No render method for", type)` and an
empty div.

## Conventions

- Indentation is genuinely mixed (tabs in `src/canvas/*`, 4 spaces in
  `src/core/Core.js`). Match the file you are in; `no-mixed-spaces-and-tabs`
  is off.
- Lint is intentionally lenient: `no-console`, `no-debugger`,
  `no-mixed-spaces-and-tabs`, `vue/no-mutating-props` are all disabled. In
  `tests/` unused *parameters* are allowed (the mocks' parameter lists are
  the only record of the contract they stand in for — keep them), but unused
  imports and variables are still errors.
- Commit subjects follow conventional commits. The body is the house style:
  the defect in past tense, the mechanism, the files touched, then the
  verification line (`Tests: 69/69 suites, 256/256 pass`, `Lint: 0`). Read
  `git log -1 --format=%B` before writing one. The `package.json` version is
  deliberately never bumped.

## Where else the rules live

- `.github/instructions/snapping-engine.instructions.md` — applies to
  `src/canvas/SnappingEngine.js`. Read it before editing that file.
- `docs/file-format.md` — the on-disk model schema.
- `todos.md` — the maintainer's scratch list, not a spec.
- `src/unit/*Test.vue` are hand-driven scratch harnesses wired to
  `/test/*.html` routes in `src/router.js`. Not tests.
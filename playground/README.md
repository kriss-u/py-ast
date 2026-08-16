# py-ast Playground

An astexplorer.net-style playground for [py-ast](..): edit Python source on the left, see
its AST as a foldable tree or JSON on the right, with syntax coloring and two-way highlight
sync between the code and the tree/JSON views. Runs entirely client-side.

A third **Flow** tab renders a module-level call-graph heatmap of every function/method in
the source: one box per function, colored by its own McCabe cyclomatic complexity (with the
score as a corner badge), edges for statically-resolved calls between them. Hover a node to
highlight its definition in the editor and see a breakdown of what drove its complexity score
(branches, loops, exception handlers, boolean-operator short-circuits, ternaries, `match`
cases, asserts); click a complexity band ("low"/"moderate"/"high"/"very-high") to filter down
to just that band's functions plus everything transitively connected to them by a call, in
either direction. The diagram supports pan/zoom/fit-to-view, and its layout direction
(top-down/left-right) and density (compact/comfortable/spacious) are both adjustable.

`py-ast` is imported directly from the sibling package's `../src/index.ts` (see
`vite.config.ts`), so there's no separate build step for the library during development.

## Development

From the repo root:

```
npm run playground
```

Or from this directory:

```
npm install
npm run dev
```

## Building

```
npm run build
```

Output is a static site in `dist/` — no server required.

## Deploying to Cloudflare Pages

Create a Cloudflare Pages project pointing at this repository with:

- **Root directory**: `playground`
- **Build command**: `npm install && npm run build`
- **Build output directory**: `dist`

No environment variables or backend services are needed.

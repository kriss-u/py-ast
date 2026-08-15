# py-ast Playground

An astexplorer.net-style playground for [py-ast](..): edit Python source on the left, see
its AST as a foldable tree or JSON on the right, with syntax coloring and two-way highlight
sync between the code and the tree/JSON views. Runs entirely client-side.

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

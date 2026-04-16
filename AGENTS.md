# Mesekai Agent Guide

## Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start dev server with HMR |
| `npm run build` | Run TypeScript compiler then Vite build (`tsc -b && vite build`) |
| `npm run lint` | Run ESLint on all files |
| `npm run preview` | Preview production build |

## Workflow

1. Run `lint` before `build` (build does not fail on lint errors)
2. TypeScript errors block build
3. No tests configured

## Architecture

- Single-entry React app: `src/main.tsx` → `src/App.tsx`
- React 19 with `react-jsx` transform
- Vite 8 config at `vite.config.ts` with `@vitejs/plugin-react`
- TypeScript configs split into `tsconfig.app.json` (src) and `tsconfig.node.json` (vite config)
- `eslint.config.js` uses flat config with `@eslint/js`, `typescript-eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`
- No Prettier, no test framework, no CI configured

## Style

- `tsconfig.app.json` enforces: `noUnusedLocals`, `noUnusedParameters`, `erasableSyntaxOnly`, `noFallthroughCasesInSwitch`
- `tsconfig.node.json` identical linting options for build configs
- ESLint ignores `dist` directory

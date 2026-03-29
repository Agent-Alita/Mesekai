# AGENTS.md

This file provides essential metadata for AI coding agents (e.g., Cursor, GitHub Copilot) working on the Mesekai codebase.

## Project Overview
Mesekai is a Next.js 14 application that uses webcam tracking (MediaPipe), Three.js for 3D avatar rendering, and Ant Design for UI components. Real-time face/body/hand tracking drives a 3D avatar.

## Build & Development Commands
```bash
npm run dev      # Start development server
npm run build    # Build for production
npm start        # Run built application
npm run lint     # Run ESLint (Next.js core-web-vitals)
```
No test framework configured yet. To run tests, add Jest/Vitest configuration.

## Path Aliases
- `@/*` resolves to `./src/*` (configured in `jsconfig.json`)

## Code Style Guide

### Language & Framework
- Use JavaScript (JS), not TypeScript
- React functional components with hooks (`useState`, `useEffect`, `useRef`, `useMemo`)
- Next.js App Router (use `app/` directory, `<Component />` export pattern)

### Naming Conventions
- Variables/functions: `camelCase` (e.g., `trackFace`, `calculateRig`)
- Components: `PascalCase` (e.g., `Avatar`, `Controls`)
- Constants: `UPPER_SNAKE_CASE` (e.g., `DEFAULT_AVATAR_URL`)

### Import Organization
```javascript
import React from 'react';
import { xyz } from 'external-library';
import { helper } from '@src/utils/helper';
import Component from '@src/components/Component';
```

### Component Patterns
- Prefer functional components with destructured props
- Use `useRef` for DOM refs and mutable state persistence
- Memoize expensive computations with `useMemo`
- Handle side effects in `useEffect` with explicit dependency arrays

### State Management
- Local component state: `useState`
- Cache arrays/objects (e.g., `poseLms = []`, `handLms = []`) where appropriate to avoid recreation
- Be cautious with global module-level state—document when used

### Formatting & Linting
- ESLint extends `next/core-web-vitals` (no custom rules added)
- No Prettier config—follow ESLint's formatting recommendations
- Use double quotes for strings
- Import order: React → external → `@src/*`

### Error Handling
- Use try-catch blocks for async operations (e.g., MediaPipe init, fetch)
- Log errors with `console.error` for debugging
- Return early or provide fallbacks for user-facing errors

## Project-Specific Notes
- `src/utils/solver.js`: Three.js rigging logic, handles 3D bone transformations
- `src/utils/tracker.js`: MediaPipe tracking initialization and frame processing
- `src/components/avatar.js`: Three.js scene setup and avatar rendering loop
- `src/app/page.js`: Main UI with tracking controls and video stream

## Contributing
1. Follow existing code style and structure
2. Use meaningful variable names
3. Avoid global side effects in utility modules
4. Document complex algorithms with inline comments when necessary

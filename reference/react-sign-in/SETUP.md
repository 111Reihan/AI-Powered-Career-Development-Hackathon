# React sign-in component (reference only)

Orbit is plain HTML/JS, so this component is **not wired into the app**. Use it if you later move Orbit to React.

The component needs shadcn project structure, Tailwind CSS and TypeScript. This repo has none of them. To start a project that does:

```bash
npm create vite@latest orbit-web -- --template react-ts
cd orbit-web
npm install tailwindcss @tailwindcss/vite lucide-react tw-animate-css
npx shadcn@latest init
```

Components must live in `/components/ui` (shadcn's default) because the shadcn CLI, the `@/components/ui/...` import alias and `components.json` all point there. If your project uses another path, create `components/ui` and update the alias.

Then:
1. Copy `components/ui/sign-in.tsx` there.
2. Add the three keyframes in `animations.css` to your global CSS (Tailwind 4 `index.css`). Also define the `.animate-element`, `.animate-slide-right`, `.animate-testimonial` and `.animate-delay-*` classes the component uses (hidden start state + the keyframe + a delay); they are not in the supplied snippet.
3. Add a `custom-checkbox` style, a `font-geist` font family, and the `foreground`, `border`, `card`, `muted-foreground` colour tokens (shadcn init provides the colour tokens).
4. Pass `heroImageSrc` (any local or Unsplash image URL) and your own `onSignIn` / `onGoogleSignIn` handlers. Only real, attributed testimonials should go in `testimonials`.

Not tested here: this repo has no React toolchain.

// Ambient declarations for side-effect CSS imports (e.g. `import "@/styles/globals.css"`,
// `import "driver.js/dist/driver.css"`). Next.js normally ships these via its own
// node_modules/next/types/global.d.ts (pulled in by the `/// <reference types="next" />`
// in next-env.d.ts), so this file is usually redundant once `npm install` has run — but it
// makes the project typecheck even in editors/CI where node_modules hasn't been installed
// yet or the TS server hasn't picked up next's types, instead of surfacing a false-positive
// "Cannot find module" (TS2882) error.
declare module "*.css" {
  const content: { [className: string]: string };
  export default content;
}

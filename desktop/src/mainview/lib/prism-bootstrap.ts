import Prism from "prismjs";

const prism = ((Prism as any)?.default ?? Prism) as typeof Prism;
const globalObj = globalThis as any;

if (!globalObj.global) {
  globalObj.global = globalObj;
}
if (!globalObj.Prism) {
  globalObj.Prism = prism;
}
if (globalObj.window && !globalObj.window.Prism) {
  globalObj.window.Prism = prism;
}

export default globalObj.Prism as typeof Prism;


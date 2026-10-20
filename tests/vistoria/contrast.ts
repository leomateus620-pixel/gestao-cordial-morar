// Static token measurement; this does not audit every rendered interaction state.
import { readFileSync } from "node:fs";
const css = readFileSync(new URL("../../src/styles.css", import.meta.url), "utf8");
type RGB = [number, number, number];
function color(value: string): RGB {
  if (value.startsWith("#"))
    return [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16) / 255) as RGB;
  const [L, C, H] = value.match(/[\d.]+/g)!.map(Number),
    h = (H * Math.PI) / 180,
    a = C * Math.cos(h),
    b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3,
    m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3,
    s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((x) =>
    Math.max(0, Math.min(1, x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055)),
  ) as RGB;
}
const luminance = (rgb: RGB) =>
  rgb
    .map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4))
    .reduce((total, x, i) => total + x * [0.2126, 0.7152, 0.0722][i], 0);
const ratio = (a: string, b: string) => {
  const x = luminance(color(a)),
    y = luminance(color(b));
  return ((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)).toFixed(2);
};
for (const dark of [false, true]) {
  const source = dark
    ? css.slice(css.indexOf(".dark {"))
    : css.slice(css.indexOf("/* shadcn tokens"));
  const token = (name: string) => source.match(new RegExp(`--${name}:\\s*([^;]+)`))![1];
  const own = css.slice(
    css.indexOf(dark ? ".dark .inspection-workspace {" : ".inspection-workspace {"),
  );
  const muted = own.match(/--field-muted:\s*([^;]+)/)![1],
    error = own.match(/--destructive:\s*([^;]+)/)![1];
  console.log(
    `${dark ? "Escuro" : "Claro"}: texto ${ratio(token("foreground"), token("popover"))}:1; secundário ${ratio(muted, token("popover"))}:1; ação ${ratio(token("primary-foreground"), token("primary"))}:1; erro ${ratio(error, token("popover"))}:1`,
  );
}

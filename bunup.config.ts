import { defineConfig } from "bunup"
import { exports } from "bunup/plugins"

export default defineConfig({
  entry: ["src/index.ts", "src/errors/index.ts"],
  format: ["esm"],
  target: "bun",
  dts: { splitting: true },
  clean: true,
  splitting: true,
  minify: true,
  plugins: [exports()],
})

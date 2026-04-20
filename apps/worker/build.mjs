import { build } from "esbuild";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sharedSrc = resolve(__dirname, "../../packages/shared/src");

await build({
  entryPoints: [resolve(__dirname, "src/index.ts")],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  outfile: resolve(__dirname, "dist/index.js"),
  external: ["node-cron", "@supabase/supabase-js"],
  plugins: [
    {
      name: "resolve-cpt-shared",
      setup(b) {
        // Resolve @cpt/shared to the source directory
        b.onResolve({ filter: /^@cpt\/shared$/ }, () => ({
          path: resolve(sharedSrc, "index.ts"),
        }));
        // Inside shared src, resolve .js imports to .ts files
        b.onResolve({ filter: /\.js$/ }, (args) => {
          if (args.resolveDir.startsWith(sharedSrc)) {
            const tsPath = resolve(args.resolveDir, args.path.replace(/\.js$/, ".ts"));
            return { path: tsPath };
          }
          return null; // let esbuild handle other .js imports
        });
      },
    },
  ],
});

console.log("Built dist/index.js");

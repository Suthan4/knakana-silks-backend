import * as esbuild from "esbuild";

const isWatch = process.argv.includes("--watch");

const config = {
  entryPoints: ["./src/index.ts"],
  bundle: true,
  outdir: "./dist",
  platform: "node",
  target: "esnext",
  format: "esm",
  sourcemap: true,
  minify: !isWatch,
  treeShaking: true,
  metafile: true,
};

async function build() {
  try {
    if (isWatch) {
      const ctx = await esbuild.context(config);
      await ctx.watch();
      console.log("👀 Watching for changes...");
    } else {
      const result = await esbuild.build(config);
      console.log("\n📊 Build Complete!");
      console.log("Files generated:");

      if (result.metafile) {
        Object.entries(result.metafile.outputs).forEach(([file, info]) => {
          console.log(`  ${file}: ${(info.bytes / 1024).toFixed(2)} KB`);
        });
      }

      console.log("\n✅ Build successful!");
    }
  } catch (error) {
    console.error("Build failed:", err);
    process.exit(1);
  }
}

build();

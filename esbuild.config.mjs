import esbuild from "esbuild";
import process from "process";
import builtins from "builtin-modules";
import { spawn } from "child_process";

const banner = `/*
Obsidian Resurface
让你写过的笔记，按科学的节奏重新找到你。
此文件由 esbuild 自动生成。
*/
`;

const prod = process.argv[2] === "production";

const context = await esbuild.context({
  banner: { js: banner },
  entryPoints: ["main.ts"],
  bundle: true,
  external: [
    "obsidian",
    "electron",
    "@codemirror/autocomplete",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view",
    "@lezer/common",
    "@lezer/highlight",
    "@lezer/lr",
    ...builtins,
  ],
  format: "cjs",
  target: "es2020",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
  platform: "browser",
  plugins: [
    {
      name: "auto-deploy",
      setup(build) {
        build.onEnd(async (result) => {
          if (result.errors.length > 0) return;
          // 构建成功后调用部署脚本（如果存在 .env.local 配置 VAULT_PATH）
          try {
            const { default: deploy } = await import("./scripts/deploy.mjs");
            await deploy();
          } catch (err) {
            // 部署脚本不存在或失败不应该阻塞构建
            if (!prod) {
              console.log("[auto-deploy] skipped:", err.message);
            }
          }
        });
      },
    },
  ],
});

if (prod) {
  await context.rebuild();
  process.exit(0);
} else {
  await context.watch();
}

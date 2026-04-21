/**
 * 部署脚本
 *
 * 读取 .env.local 中的 VAULT_PATH，把构建产物（main.js、manifest.json、styles.css）
 * 拷贝到 $VAULT_PATH/.obsidian/plugins/obsidian-resurface/
 *
 * 被 esbuild.config.mjs 的 auto-deploy 插件在每次构建结束时调用。
 */

import { readFile, copyFile, mkdir, access } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");

const PLUGIN_ID = "obsidian-resurface";
const FILES_TO_DEPLOY = ["main.js", "manifest.json", "styles.css"];

async function loadEnv() {
  const envPath = join(PROJECT_ROOT, ".env.local");
  try {
    const content = await readFile(envPath, "utf-8");
    const env = {};
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      // Strip surrounding quotes
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      env[key] = value;
    }
    return env;
  } catch {
    return null;
  }
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function deploy() {
  const env = await loadEnv();
  if (!env || !env.VAULT_PATH) {
    throw new Error("VAULT_PATH 未配置（.env.local 不存在或缺少 VAULT_PATH）");
  }

  const vaultPath = env.VAULT_PATH;
  if (!(await exists(vaultPath))) {
    throw new Error(`Vault 路径不存在: ${vaultPath}`);
  }

  const targetDir = join(vaultPath, ".obsidian", "plugins", PLUGIN_ID);
  await mkdir(targetDir, { recursive: true });

  const deployed = [];
  for (const file of FILES_TO_DEPLOY) {
    const src = join(PROJECT_ROOT, file);
    if (!(await exists(src))) {
      // main.js 在第一次构建完成后才存在，跳过不存在的文件
      continue;
    }
    const dst = join(targetDir, file);
    await copyFile(src, dst);
    deployed.push(file);
  }

  if (deployed.length > 0) {
    console.log(`[deploy] ${deployed.join(", ")} → ${targetDir}`);
  }
}

// 作为 esbuild 插件被 import 调用
export default deploy;

// 允许直接 `node scripts/deploy.mjs` 手动执行
if (import.meta.url === `file://${process.argv[1]}`) {
  deploy().catch((err) => {
    console.error("[deploy] 失败:", err.message);
    process.exit(1);
  });
}

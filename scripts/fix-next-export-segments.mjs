// filepath: scripts/fix-next-export-segments.mjs
/**
 * Next.js 16 `output: "export"` の Windows ビルド時バグ補正スクリプト
 *
 * 【原因】
 * `next/dist/export/index.js` の `collectSegmentPaths` が Windows 環境で `\` 区切りの相対パス
 * （例: `liff\schedule\__PAGE__.segment.rsc`）を返し、`convertSegmentPathToStaticExportFilename` が
 * `/` のみを `.` に置換するため、`out/liff/schedule/__next.liff/schedule/__PAGE__.txt` のように
 * サブディレクトリ構造で出力されてしまう。
 * 一方、ブラウザ側の Next.js クライアントルーター（Segment Cache）は常にドット区切りのフラットURL
 * （例: `/liff/schedule/__next.liff.schedule.__PAGE__.txt`）をリクエストするため、
 * 全 `<Link>` プリフェッチが 404 となり、画面遷移時に毎回フォールバック通信遅延が発生する。
 *
 * 【処理内容】
 * `out/` 配下の `__next.*` ディレクトリを走査し、内部の `.txt` ファイルをクライアントルーターが
 * 期待するドット区切りファイル名（`__next.<segments>.txt`）へフラット展開した上で、不要な階層ディレクトリを除去する。
 */

import fs from "node:fs";
import path from "node:path";

const outDir = path.resolve(process.cwd(), "out");

function collectFilesRecursively(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFilesRecursively(full));
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
  return files;
}

function findNextSegmentDirs(currentDir) {
  if (!fs.existsSync(currentDir)) return [];
  const entries = fs.readdirSync(currentDir, { withFileTypes: true });
  const found = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const full = path.join(currentDir, entry.name);
    if (entry.name.startsWith("__next.")) {
      found.push(full);
    } else {
      found.push(...findNextSegmentDirs(full));
    }
  }
  return found;
}

function main() {
  if (!fs.existsSync(outDir)) {
    console.log("[fix-next-export-segments] out/ directory not found, skipping.");
    return;
  }

  const malformedDirs = findNextSegmentDirs(outDir);
  let flattenedCount = 0;

  for (const segDir of malformedDirs) {
    const routeDir = path.dirname(segDir);
    const innerFiles = collectFilesRecursively(segDir);

    for (const srcFile of innerFiles) {
      const relFromRouteDir = path.relative(routeDir, srcFile);
      const flatName = relFromRouteDir.split(/[\\/]+/).join(".");
      const destFile = path.join(routeDir, flatName);
      fs.copyFileSync(srcFile, destFile);
      flattenedCount += 1;
    }

    fs.rmSync(segDir, { recursive: true, force: true });
  }

  console.log(
    `[fix-next-export-segments] Flattened ${flattenedCount} RSC segment files across ${malformedDirs.length} directories.`
  );
}

main();


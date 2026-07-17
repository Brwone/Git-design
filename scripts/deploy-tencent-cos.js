#!/usr/bin/env node
/**
 * Deploy static site to Tencent Cloud COS (静态网站托管).
 *
 * Required env:
 *   TENCENT_SECRET_ID
 *   TENCENT_SECRET_KEY
 *
 * Optional env:
 *   COS_REGION   default: ap-guangzhou
 *   COS_BUCKET   default: browne-portfolio-<appid>  (auto if unset, needs AppId)
 *   COS_APPID    required when COS_BUCKET is unset
 *
 * Usage:
 *   export TENCENT_SECRET_ID=...
 *   export TENCENT_SECRET_KEY=...
 *   export COS_APPID=1234567890
 *   node scripts/deploy-tencent-cos.js
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const REGION = process.env.COS_REGION || "ap-guangzhou";
const SECRET_ID = process.env.TENCENT_SECRET_ID || "";
const SECRET_KEY = process.env.TENCENT_SECRET_KEY || "";
const APPID = process.env.COS_APPID || "";
const INDEX = "index.html";
const ERROR = "index.html";

const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  ".cursor",
  "agent-tools",
  "agent-transcripts",
]);
const SKIP_FILES = new Set([
  ".DS_Store",
  "Thumbs.db",
  ".vercelignore",
  "vercel.json",
  "Personal-portfolio-website-structure.html",
]);
const SKIP_PREFIXES = ["scripts/_"];

function ensureSdk() {
  try {
    require.resolve("cos-nodejs-sdk-v5");
  } catch (_) {
    console.log("Installing cos-nodejs-sdk-v5...");
    execSync("npm install cos-nodejs-sdk-v5 --no-save --no-package-lock", {
      cwd: ROOT,
      stdio: "inherit",
    });
  }
  return require("cos-nodejs-sdk-v5");
}

function shouldSkip(rel) {
  const parts = rel.split(path.sep);
  if (parts.some((p) => SKIP_DIRS.has(p))) return true;
  if (SKIP_FILES.has(path.basename(rel))) return true;
  if (SKIP_PREFIXES.some((p) => rel.startsWith(p))) return true;
  if (rel.startsWith("scripts/") && rel !== "scripts/deploy-tencent-cos.js") {
    // keep deploy script out of public site
    return true;
  }
  return false;
}

function walk(dir, base = ROOT, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const abs = path.join(dir, name);
    const rel = path.relative(base, abs);
    if (shouldSkip(rel)) continue;
    const st = fs.statSync(abs);
    if (st.isDirectory()) walk(abs, base, out);
    else out.push({ abs, rel: rel.split(path.sep).join("/"), size: st.size });
  }
  return out;
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".otf": "font/otf",
    ".txt": "text/plain; charset=utf-8",
    ".xml": "application/xml",
    ".pdf": "application/pdf",
  };
  return map[ext] || "application/octet-stream";
}

function putAsync(cos, params) {
  return new Promise((resolve, reject) => {
    cos.putObject(params, (err, data) => (err ? reject(err) : resolve(data)));
  });
}

function requestAsync(cos, method, params) {
  return new Promise((resolve, reject) => {
    cos[method](params, (err, data) => (err ? reject(err) : resolve(data)));
  });
}

async function main() {
  if (!SECRET_ID || !SECRET_KEY) {
    console.error(`Missing credentials.

1. Open https://console.cloud.tencent.com/cam/capi
2. Create SecretId / SecretKey
3. Run:

   export TENCENT_SECRET_ID=你的SecretId
   export TENCENT_SECRET_KEY=你的SecretKey
   export COS_APPID=你的APPID
   # optional: export COS_REGION=ap-guangzhou
   # optional: export COS_BUCKET=browne-portfolio-1234567890
   node scripts/deploy-tencent-cos.js
`);
    process.exit(1);
  }

  const COS = ensureSdk();
  const cos = new COS({
    SecretId: SECRET_ID,
    SecretKey: SECRET_KEY,
    Protocol: "https:",
  });

  let bucket = process.env.COS_BUCKET || "";
  if (!bucket) {
    if (!APPID) {
      console.error("Set COS_BUCKET or COS_APPID");
      process.exit(1);
    }
    bucket = `browne-portfolio-${APPID}`;
  }

  console.log(`Region: ${REGION}`);
  console.log(`Bucket: ${bucket}`);

  // Create bucket if missing
  try {
    await requestAsync(cos, "headBucket", { Bucket: bucket, Region: REGION });
    console.log("Bucket exists");
  } catch (_) {
    console.log("Creating bucket...");
    await requestAsync(cos, "putBucket", {
      Bucket: bucket,
      Region: REGION,
    });
  }

  // Public read ACL for static hosting
  console.log("Setting public-read ACL...");
  await requestAsync(cos, "putBucketAcl", {
    Bucket: bucket,
    Region: REGION,
    ACL: "public-read",
  });

  // Enable static website
  console.log("Enabling static website...");
  await requestAsync(cos, "putBucketWebsite", {
    Bucket: bucket,
    Region: REGION,
    WebsiteConfiguration: {
      IndexDocument: { Suffix: INDEX },
      ErrorDocument: { Key: ERROR },
    },
  });

  const files = walk(ROOT);
  const total = files.reduce((s, f) => s + f.size, 0);
  console.log(`Uploading ${files.length} files (${(total / 1024 / 1024).toFixed(1)} MB)...`);

  let done = 0;
  const concurrency = 6;
  let i = 0;

  async function worker() {
    while (i < files.length) {
      const idx = i++;
      const f = files[idx];
      const Key = f.rel;
      await putAsync(cos, {
        Bucket: bucket,
        Region: REGION,
        Key,
        Body: fs.createReadStream(f.abs),
        ContentLength: f.size,
        ContentType: contentType(f.abs),
        ACL: "public-read",
      });
      done += 1;
      if (done % 20 === 0 || done === files.length) {
        console.log(`  ${done}/${files.length}`);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  const website = `https://${bucket}.cos-website.${REGION}.myqcloud.com`;
  const objectUrl = `https://${bucket}.cos.${REGION}.myqcloud.com/${INDEX}`;

  console.log(`
Deploy finished.

Static website URL:
  ${website}

Object URL (fallback):
  ${objectUrl}

Optional CDN (recommended for China):
  1. https://console.cloud.tencent.com/cdn
  2. Add domain pointing to ${bucket}.cos-website.${REGION}.myqcloud.com
`);
}

main().catch((err) => {
  console.error("Deploy failed:", err && err.message ? err.message : err);
  if (err && err.error) console.error(err.error);
  process.exit(1);
});

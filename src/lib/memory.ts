import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const RAW_ROOT = path.resolve(ROOT, process.env.AXIS_MEMORY_RAW ?? "raw");
const WIKI_ROOT = path.resolve(ROOT, process.env.AXIS_MEMORY_WIKI ?? "wiki");

function safeJoin(root: string, relPath: string): string {
  const cleaned = relPath.replace(/^\/+/, "").replace(/\.\.(\/|$)/g, "");
  const full = path.resolve(root, cleaned);
  if (!full.startsWith(root)) {
    throw new Error(`Refusing path outside memory root: ${relPath}`);
  }
  return full;
}

export async function readWiki(relPath: string): Promise<string> {
  const full = safeJoin(WIKI_ROOT, relPath);
  return fs.readFile(full, "utf8");
}

export async function writeWiki(relPath: string, body: string): Promise<string> {
  const full = safeJoin(WIKI_ROOT, relPath);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, body, "utf8");
  return path.relative(ROOT, full);
}

export async function appendWiki(relPath: string, body: string): Promise<string> {
  const full = safeJoin(WIKI_ROOT, relPath);
  await fs.mkdir(path.dirname(full), { recursive: true });
  let existing = "";
  try {
    existing = await fs.readFile(full, "utf8");
  } catch {
    /* new file */
  }
  const sep = existing && !existing.endsWith("\n") ? "\n\n" : existing ? "\n" : "";
  await fs.writeFile(full, existing + sep + body, "utf8");
  return path.relative(ROOT, full);
}

export async function listWiki(relPath = ""): Promise<string[]> {
  const full = safeJoin(WIKI_ROOT, relPath);
  const entries = await fs.readdir(full, { withFileTypes: true });
  return entries
    .filter((e) => !e.name.startsWith(".") && e.name !== ".gitkeep")
    .map((e) => (e.isDirectory() ? `${e.name}/` : e.name));
}

export async function listRaw(relPath = ""): Promise<string[]> {
  const full = safeJoin(RAW_ROOT, relPath);
  const entries = await fs.readdir(full, { withFileTypes: true });
  return entries
    .filter((e) => !e.name.startsWith("."))
    .map((e) => (e.isDirectory() ? `${e.name}/` : e.name));
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export const MEMORY_ROOTS = { RAW_ROOT, WIKI_ROOT };

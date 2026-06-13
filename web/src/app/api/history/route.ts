import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const DATA_PATH = resolve(process.cwd(), "..", "oracle", "data", "prints.json");

interface PrintsFile {
  updatedAt: string;
  symbols: Record<string, { dayKey: number; price: number; timestamp: string }[]>;
}

let cache: { mtime: number; payload: PrintsFile } | null = null;

async function load(): Promise<PrintsFile> {
  const info = await stat(DATA_PATH);
  if (cache && cache.mtime === info.mtimeMs) return cache.payload;
  const raw = await readFile(DATA_PATH, "utf8");
  const parsed = JSON.parse(raw) as PrintsFile;
  cache = { mtime: info.mtimeMs, payload: parsed };
  return parsed;
}

export async function GET(req: NextRequest) {
  try {
    const symbol = req.nextUrl.searchParams.get("symbol");
    const data = await load();
    if (symbol) {
      const list = data.symbols[symbol] ?? [];
      return NextResponse.json({ symbol, prints: list, updatedAt: data.updatedAt });
    }
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ updatedAt: null, symbols: {} });
  }
}

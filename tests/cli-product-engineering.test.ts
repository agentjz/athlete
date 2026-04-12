import assert from "node:assert/strict";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { getErrorMessage } from "../src/agent/errors.js";
import { buildCliProgram } from "../src/cli.js";
import { getAppPaths } from "../src/config/paths.js";
import { loadConfig } from "../src/config/store.js";

test("CLI exposes --version without resolving runtime", async () => {
  let resolveRuntimeCalls = 0;
  const program = buildCliProgram({
    resolveRuntime: async () => {
      resolveRuntimeCalls += 1;
      throw new Error("version must not resolve runtime");
    },
  });
  const expectedVersion = JSON.parse(await fs.readFile("package.json", "utf8")).version as string;

  const output = await captureStdout(async () => {
    await parseCommander(program, ["--version"]);
  });

  assert.equal(resolveRuntimeCalls, 0);
  assert.match(output, new RegExp(expectedVersion.replace(/\./g, "\\.")));
});

test("CLI config path stays available even when runtime resolution would fail", async () => {
  await withTempAppDirs(async () => {
    let resolveRuntimeCalls = 0;
    const program = buildCliProgram({
      resolveRuntime: async () => {
        resolveRuntimeCalls += 1;
        throw new Error("config path must not resolve runtime");
      },
    });
    const configFile = getAppPaths().configFile;

    const output = await captureStdout(async () => {
      await program.parseAsync(["config", "path"], {
        from: "user",
      });
    });

    assert.equal(resolveRuntimeCalls, 0);
    assert.equal(output.trim(), configFile);
  });
});

test("legacy versionless config is rewritten to the current schema version", async () => {
  await withTempAppDirs(async () => {
    const paths = getAppPaths();
    await fs.mkdir(path.dirname(paths.configFile), { recursive: true });
    await fs.writeFile(
      paths.configFile,
      `${JSON.stringify(
        {
          model: "deepseek-reasoner",
          baseUrl: "https://api.deepseek.com",
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    const loaded = await loadConfig();
    const rewritten = JSON.parse(await fs.readFile(paths.configFile, "utf8")) as Record<string, unknown>;

    assert.equal((loaded as any).schemaVersion, 1);
    assert.equal(rewritten.schemaVersion, 1);
  });
});

test("unsupported config schema version fails closed with an actionable message", async () => {
  await withTempAppDirs(async () => {
    const paths = getAppPaths();
    await fs.mkdir(path.dirname(paths.configFile), { recursive: true });
    await fs.writeFile(
      paths.configFile,
      `${JSON.stringify(
        {
          schemaVersion: 999,
          model: "deepseek-reasoner",
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    await assert.rejects(
      () => loadConfig(),
      (error: unknown) => {
        const message = String((error as Error).message ?? error);
        assert.match(message, /schema.?version/i);
        assert.match(message, /config\.json/i);
        assert.match(message, /delete|rebuild|config set/i);
        return true;
      },
    );
  });
});

test("config keeps dotenv loading and runtime env resolution behind one formal entry", async () => {
  const configFiles = await listFiles(path.join(process.cwd(), "src", "config"));
  const allSourceFiles = await listFiles(path.join(process.cwd(), "src"));

  const dotenvImporters = await findFilesContaining(allSourceFiles, /import dotenv from "dotenv"/);
  const dotenvLoaders = await findFilesContaining(allSourceFiles, /from "\.\/env\.js"/);

  assert.deepEqual(dotenvImporters.map((file) => path.relative(process.cwd(), file)), [
    path.join("src", "config", "env.ts"),
  ]);
  assert.deepEqual(dotenvLoaders.map((file) => path.relative(process.cwd(), file)), [
    path.join("src", "config", "runtime.ts"),
  ]);

  const storeSource = await fs.readFile(path.join(process.cwd(), "src", "config", "store.ts"), "utf8");
  assert.match(storeSource, /from "\.\/fileStore\.js"/);
  assert.match(storeSource, /from "\.\/runtime\.js"/);
  assert.equal(configFiles.some((file) => file.endsWith(path.join("src", "config", "store.ts"))), true);
});

test("CLI error rendering classifies network failures instead of only echoing the raw exception", () => {
  const message = getErrorMessage(
    Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:443"), {
      code: "ECONNREFUSED",
    }),
  );

  assert.match(message, /network|reachable|base url|连接/i);
});

async function parseCommander(program: ReturnType<typeof buildCliProgram>, argv: string[]): Promise<void> {
  program.exitOverride();

  try {
    await program.parseAsync(argv, {
      from: "user",
    });
  } catch (error) {
    const code = String((error as { code?: unknown }).code ?? "");
    if (code === "commander.helpDisplayed" || code === "commander.version") {
      return;
    }

    throw error;
  }
}

async function captureStdout(run: () => Promise<void>): Promise<string> {
  const writes: string[] = [];
  const original = fsSync.writeSync;
  (fsSync as typeof fsSync & { writeSync: typeof fsSync.writeSync }).writeSync = ((fd, buffer, ...rest) => {
    if (fd === 1) {
      writes.push(String(buffer));
    }
    return typeof buffer === "string" ? buffer.length : Buffer.byteLength(String(buffer));
  }) as typeof fsSync.writeSync;

  try {
    await run();
    return writes.join("");
  } finally {
    (fsSync as typeof fsSync & { writeSync: typeof fsSync.writeSync }).writeSync = original;
  }
}

async function withTempAppDirs(run: () => Promise<void>): Promise<void> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "athlete-cli-config-"));
  const original = {
    APPDATA: process.env.APPDATA,
    LOCALAPPDATA: process.env.LOCALAPPDATA,
    HOME: process.env.HOME,
    USERPROFILE: process.env.USERPROFILE,
  };

  process.env.APPDATA = path.join(root, "appdata");
  process.env.LOCALAPPDATA = path.join(root, "localappdata");
  process.env.HOME = root;
  process.env.USERPROFILE = root;

  try {
    await run();
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (typeof value === "string") {
        process.env[key] = value;
      } else {
        delete process.env[key];
      }
    }

    await fs.rm(root, { recursive: true, force: true });
  }
}

async function listFiles(root: string): Promise<string[]> {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      return listFiles(fullPath);
    }
    return [fullPath];
  }));
  return files.flat();
}

async function findFilesContaining(files: string[], pattern: RegExp): Promise<string[]> {
  const matches: string[] = [];
  for (const filePath of files) {
    if (!filePath.endsWith(".ts")) {
      continue;
    }
    const source = await fs.readFile(filePath, "utf8");
    if (pattern.test(source)) {
      matches.push(filePath);
    }
  }
  return matches.sort();
}

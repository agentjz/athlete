import type { execa as execaFunction } from "execa";

export type Execa = typeof execaFunction;

export async function loadExeca(): Promise<Execa> {
  const module = await import("execa");
  return module.execa;
}

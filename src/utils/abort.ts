export function createAbortError(message = "Operation aborted"): Error {
  const error = new Error(message);
  error.name = "AbortError";
  (error as { code?: string }).code = "ABORT_ERR";
  return error;
}

export function isAbortError(error: unknown): boolean {
  if (!error) {
    return false;
  }

  if (error instanceof Error) {
    if (error.name === "AbortError") {
      return true;
    }

    const code = String((error as { code?: unknown }).code ?? "");
    if (code === "ABORT_ERR" || code === "ERR_ABORTED" || code === "ABORTED") {
      return true;
    }

    const message = error.message.toLowerCase();
    if (message.includes("abort") || message.includes("aborted") || message.includes("cancelled") || message.includes("canceled")) {
      return true;
    }
  }

  if (typeof error === "object" && error && "cause" in error) {
    return isAbortError((error as { cause?: unknown }).cause);
  }

  return false;
}

export function throwIfAborted(signal: AbortSignal | undefined, message?: string): void {
  if (signal?.aborted) {
    throw createAbortError(message ?? "Operation aborted");
  }
}

export function sleepWithSignal(ms: number, signal?: AbortSignal): Promise<void> {
  if (!signal) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  if (signal.aborted) {
    return Promise.reject(createAbortError("Sleep aborted"));
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      reject(createAbortError("Sleep aborted"));
    };

    signal.addEventListener("abort", onAbort);
  });
}

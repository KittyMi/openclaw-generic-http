export function mapThreadId(threadId?: string | null): string | null {
  if (typeof threadId !== "string") {
    return null;
  }

  const normalized = threadId.trim();
  return normalized === "" ? null : normalized;
}

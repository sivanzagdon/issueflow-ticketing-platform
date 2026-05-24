const MENTION_PATTERN = /@([a-zA-Z0-9_-]+)/g;

/**
 * Extract unique @username tokens in first-appearance order.
 * Usernames are matched case-insensitively when resolving users.
 */
export function parseMentionUsernames(content: string): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();

  for (const match of content.matchAll(MENTION_PATTERN)) {
    const token = match[1];
    const key = token.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      ordered.push(token);
    }
  }

  return ordered;
}

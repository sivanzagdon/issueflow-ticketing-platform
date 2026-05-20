import { Injectable } from '@nestjs/common';

/**
 * In-memory list of invalidated JWT access tokens (logout).
 * Not suitable for multi-instance production without a shared store.
 */
@Injectable()
export class TokenDenylistService {
  private readonly invalidated = new Set<string>();

  invalidate(token: string): void {
    if (token) {
      this.invalidated.add(token);
    }
  }

  isInvalidated(token: string | null): boolean {
    return token != null && this.invalidated.has(token);
  }
}

import type { Request } from "express";

/** The authenticated player. Everything user-owned is scoped to this puuid. */
export interface PlayerIdentity {
  puuid: string;
}

export interface AuthenticatedRequest extends Request {
  identity: PlayerIdentity;
}

/**
 * Resolves the caller to a player identity. The dev implementation reads
 * DEV_PUUID; RSO swaps in a session-backed resolver without touching services.
 */
export abstract class IdentityResolver {
  abstract resolve(request: Request): Promise<PlayerIdentity>;
}

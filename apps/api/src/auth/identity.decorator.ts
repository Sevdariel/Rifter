import { createParamDecorator, ExecutionContext } from "@nestjs/common";

import type { AuthenticatedRequest, PlayerIdentity } from "./identity";

/** Injects the resolved player identity into a route handler parameter. */
export const Identity = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): PlayerIdentity =>
    ctx.switchToHttp().getRequest<AuthenticatedRequest>().identity,
);

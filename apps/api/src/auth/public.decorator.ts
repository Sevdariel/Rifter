import { SetMetadata } from "@nestjs/common";

export const IS_PUBLIC_KEY = "isPublic";

/** Marks a route (or controller) as reachable without X-Rifter-Token. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

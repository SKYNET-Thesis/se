import { SetMetadata } from "@nestjs/common";

export const ALLOW_PASSWORD_CHANGE_ONLY_KEY = "vista:allow-password-change-only";

/** Allows this endpoint through the forced-change gate while keeping all other authenticated routes blocked. */
export const AllowPasswordChangeOnly = () => SetMetadata(ALLOW_PASSWORD_CHANGE_ONLY_KEY, true);

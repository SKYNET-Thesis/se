/**
 * Staff (School Administrator / Instructor) direct-account switch.
 *
 * Disabled by default. While disabled no code path reads or writes public.users.password_change_required / password_changed_at /
 * temporary_password_expires_at, so this API runs unchanged against a database that has not received staged migration
 * 20261128_u_staff_password_change_required. Enabling the flag REQUIRES that migration. Do not disable it again while staff are
 * still pending their first password change: the forced-change gate lives behind the flag.
 */
export const staffTempPasswordEnabled = (): boolean => process.env.STAFF_TEMP_PASSWORD_ENABLED?.trim().toLowerCase() === "true";

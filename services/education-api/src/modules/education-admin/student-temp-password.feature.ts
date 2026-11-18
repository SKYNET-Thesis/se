/**
 * Student temporary-password rollout switch.
 *
 * While disabled (the default) no code path reads or writes the password_change_required / password_changed_at /
 * temporary_password_expires_at / provisioning_* columns, so this API version runs unchanged against a database that
 * has not received migration 20261118_student_password_change_required (deploy-before-migrate is safe), and existing
 * students are never restricted.
 *
 * Enabling the flag REQUIRES the migration. Do not disable it again while students are still pending their first
 * password change: the forced-change gate lives behind the flag and would stop being enforced.
 */
export const studentTempPasswordEnabled = (): boolean => process.env.STUDENT_TEMP_PASSWORD_ENABLED?.trim().toLowerCase() === "true";

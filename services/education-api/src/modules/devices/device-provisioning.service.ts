import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../../common/database/prisma.service";
import { AuthenticatedUser } from "../identity/auth/authenticated-user.interface";
import { authMessage, enrollMessage, newSecret, parseEd25519PublicKey, sha256Hex, signDeviceToken, verifyDeviceToken, verifyEd25519, type DeviceTokenClaims } from "./device-crypto";
import type { AuthChallengeDto, AuthTokenDto, EnrollCompleteDto, RegisterDeviceDto } from "./dto/device.dto";

export const DEVICES_MANAGE_PERMISSION = "education.devices.manage";
const ENROLL_NONCE_SECONDS = 300;
const AUTH_NONCE_SECONDS = 60;

interface DeviceRow {
  id: string; organization_id: string; name: string; device_kind: string; robot_id: string | null; status: string; key_fingerprint: string | null; credential_version: number;
  created_at: Date; enrolled_at: Date | null; last_seen_at: Date | null; suspended_at: Date | null; revoked_at: Date | null; revoke_reason: string | null;
}
export interface AuthenticatedDevice { id: string; organizationId: string; name: string; deviceKind: string; robotId: string | null }

const view = (row: DeviceRow) => ({
  id: row.id, organizationId: row.organization_id, name: row.name, deviceKind: row.device_kind, robotId: row.robot_id, status: row.status, keyFingerprint: row.key_fingerprint,
  credentialVersion: row.credential_version, createdAt: row.created_at, enrolledAt: row.enrolled_at, lastSeenAt: row.last_seen_at, suspendedAt: row.suspended_at, revokedAt: row.revoked_at, revokeReason: row.revoke_reason,
});
const isUniqueViolation = (error: unknown) => JSON.stringify(error ?? "").includes("23505") || String((error as { message?: unknown })?.message ?? "").includes("duplicate key");
const COLUMNS = `d.id, d.organization_id, d.name, d.device_kind, d.robot_id, d.status, d.key_fingerprint, d.credential_version, d.created_at, d.enrolled_at, d.last_seen_at, d.suspended_at, d.revoked_at, d.revoke_reason`;

/**
 * Per-device identity for Desktop / Edge devices. A device proves possession of its own Ed25519 private key (enrollment challenge, then a
 * signed nonce for every session). The server stores the PUBLIC key and a hash of the one-time enrollment code only; it issues short-lived
 * API tokens and never any shared or long-lived cloud credential. Every failure on the public endpoints is the same generic answer.
 */
@Injectable()
export class DeviceProvisioningService {
  constructor(private readonly prisma: PrismaService) {}

  private get enabled() { return process.env.DEVICE_PROVISIONING_ENABLED?.trim().toLowerCase() === "true"; }
  private assertEnabled() { if (!this.enabled) throw new NotFoundException("Not found."); }
  private secret(): string {
    const value = process.env.DEVICE_TOKEN_SECRET?.trim();
    if (!value || value.length < 32) throw new ServiceUnavailableException("Device authentication is not configured.");
    return value;
  }
  private ttlHours() { const v = Number(process.env.DEVICE_ENROLLMENT_TTL_HOURS); return Number.isFinite(v) && v >= 1 && v <= 168 ? v : 24; }
  private tokenSeconds() { const v = Number(process.env.DEVICE_TOKEN_TTL_SECONDS); return Number.isInteger(v) && v >= 60 && v <= 3600 ? v : 900; }

  private authorize(user: AuthenticatedUser, organizationId: string) {
    if (user.systemPermissions.includes("org.manage")) return;
    const membership = user.memberships.find((item) => item.organizationId === organizationId && item.status === "active");
    if (!membership?.permissions.includes(DEVICES_MANAGE_PERMISSION)) throw new NotFoundException("Device was not found.");
  }

  private async activeOrganization(organizationId: string) {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`SELECT id FROM public.organizations WHERE id=${organizationId}::uuid AND type='institution' AND status='active' LIMIT 1`;
    if (!rows[0]) throw new NotFoundException("Organization was not found.");
  }

  private async loadDevice(organizationId: string, deviceId: string): Promise<DeviceRow> {
    const found = await this.prisma.$queryRawUnsafe<DeviceRow[]>(`SELECT ${COLUMNS} FROM public.robot_devices d WHERE d.id=$1::uuid AND d.organization_id=$2::uuid LIMIT 1`, deviceId, organizationId);
    if (!found[0]) throw new NotFoundException("Device was not found.");
    return found[0];
  }

  private async audit(actorUserId: string | null, organizationId: string, action: string, deviceId: string, details: Record<string, unknown> = {}) {
    await this.prisma.$executeRaw`INSERT INTO public.audit_logs(actor_user_id, organization_id, action, target_type, target_id, details) VALUES(${actorUserId}::uuid, ${organizationId}::uuid, ${action}, 'robot_device', ${deviceId}::uuid, ${JSON.stringify(details)}::jsonb)`;
  }

  private async issueChallenge(deviceId: string, actorUserId: string) {
    await this.prisma.$executeRaw`UPDATE public.device_enrollment_challenges SET consumed_at=now() WHERE device_id=${deviceId}::uuid AND consumed_at IS NULL`;
    const code = `vd_${newSecret(24)}`;
    const expiresAt = new Date(Date.now() + this.ttlHours() * 3600_000);
    await this.prisma.$executeRaw`INSERT INTO public.device_enrollment_challenges(device_id, code_hash, expires_at, created_by_user_id) VALUES(${deviceId}::uuid, ${sha256Hex(code)}, ${expiresAt}, ${actorUserId}::uuid)`;
    return { enrollmentCode: code, enrollmentExpiresAt: expiresAt };
  }

  // ---------------------------------------------------------------- management (School Admin of the organization, or System Administrator)

  async register(user: AuthenticatedUser, organizationId: string, dto: RegisterDeviceDto) {
    this.assertEnabled(); this.authorize(user, organizationId); await this.activeOrganization(organizationId);
    if (dto.robotId) {
      const entitled = await this.prisma.$queryRaw<Array<{ id: string }>>`
        SELECT r.id FROM public.robots r JOIN public.org_entitlements e ON e.robot_id=r.id
        WHERE r.id=${dto.robotId}::uuid AND e.organization_id=${organizationId}::uuid AND e.resource_type='robot' AND e.valid_from<=now() AND (e.valid_to IS NULL OR e.valid_to>now()) LIMIT 1`;
      if (!entitled[0]) throw new NotFoundException("Robot was not found for this organization.");
    }
    const id = randomUUID();
    try {
      await this.prisma.$executeRaw`INSERT INTO public.robot_devices(id, organization_id, name, device_kind, robot_id, created_by_user_id) VALUES(${id}::uuid, ${organizationId}::uuid, ${dto.name.trim()}, ${dto.deviceKind}, ${dto.robotId ?? null}::uuid, ${user.vistaUserId}::uuid)`;
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException("A device with this name already exists in the organization.");
      throw error;
    }
    const challenge = await this.issueChallenge(id, user.vistaUserId);
    await this.audit(user.vistaUserId, organizationId, "device.registered", id, { name: dto.name.trim(), deviceKind: dto.deviceKind });
    return { device: view(await this.loadDevice(organizationId, id)), ...challenge };
  }

  async list(user: AuthenticatedUser, organizationId: string) {
    this.assertEnabled(); this.authorize(user, organizationId);
    const rows = await this.prisma.$queryRawUnsafe<DeviceRow[]>(`SELECT ${COLUMNS} FROM public.robot_devices d WHERE d.organization_id=$1::uuid ORDER BY d.created_at DESC LIMIT 200`, organizationId);
    return rows.map(view);
  }

  async get(user: AuthenticatedUser, organizationId: string, deviceId: string) {
    this.assertEnabled(); this.authorize(user, organizationId);
    return view(await this.loadDevice(organizationId, deviceId));
  }

  /** active -> suspended. Reversible; tokens stop working immediately because every request re-checks the device. */
  async suspend(user: AuthenticatedUser, organizationId: string, deviceId: string, reason?: string) {
    this.assertEnabled(); this.authorize(user, organizationId);
    const device = await this.loadDevice(organizationId, deviceId);
    if (device.status === "suspended") return view(device);
    if (device.status !== "active") throw new ConflictException("Only an active device can be suspended.");
    await this.prisma.$executeRaw`UPDATE public.robot_devices SET status='suspended', suspended_at=now(), auth_nonce_hash=NULL, updated_at=now() WHERE id=${deviceId}::uuid AND status='active'`;
    await this.audit(user.vistaUserId, organizationId, "device.suspended", deviceId, { reason: reason?.trim() ?? null });
    return view(await this.loadDevice(organizationId, deviceId));
  }

  async resume(user: AuthenticatedUser, organizationId: string, deviceId: string) {
    this.assertEnabled(); this.authorize(user, organizationId); await this.activeOrganization(organizationId);
    const device = await this.loadDevice(organizationId, deviceId);
    if (device.status === "active") return view(device);
    if (device.status !== "suspended") throw new ConflictException("Only a suspended device can be resumed.");
    await this.prisma.$executeRaw`UPDATE public.robot_devices SET status='active', suspended_at=NULL, updated_at=now() WHERE id=${deviceId}::uuid AND status='suspended'`;
    await this.audit(user.vistaUserId, organizationId, "device.resumed", deviceId);
    return view(await this.loadDevice(organizationId, deviceId));
  }

  /** Permanent. Idempotent. The credential version moves on, pending enrollment codes die, and the record stays for audit. */
  async revoke(user: AuthenticatedUser, organizationId: string, deviceId: string, reason?: string) {
    this.assertEnabled(); this.authorize(user, organizationId);
    const device = await this.loadDevice(organizationId, deviceId);
    if (device.status === "revoked") return view(device);
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`UPDATE public.robot_devices SET status='revoked', revoked_at=now(), revoked_by_user_id=${user.vistaUserId}::uuid, revoke_reason=${reason?.trim() || null}, credential_version=credential_version+1, auth_nonce_hash=NULL, auth_nonce_expires_at=NULL, updated_at=now() WHERE id=${deviceId}::uuid AND status<>'revoked'`;
      await tx.$executeRaw`UPDATE public.device_enrollment_challenges SET consumed_at=now() WHERE device_id=${deviceId}::uuid AND consumed_at IS NULL`;
    });
    await this.audit(user.vistaUserId, organizationId, "device.revoked", deviceId, { reason: reason?.trim() ?? null });
    return view(await this.loadDevice(organizationId, deviceId));
  }

  /** Credential rotation: drops the current key (the device becomes pending again), invalidates its tokens and issues a new one-time code. */
  async rotate(user: AuthenticatedUser, organizationId: string, deviceId: string) {
    this.assertEnabled(); this.authorize(user, organizationId); await this.activeOrganization(organizationId);
    const device = await this.loadDevice(organizationId, deviceId);
    if (device.status === "revoked") throw new ConflictException("A revoked device cannot be re-enrolled. Register a new device.");
    await this.prisma.$executeRaw`UPDATE public.robot_devices SET status='pending', public_key=NULL, key_fingerprint=NULL, suspended_at=NULL, auth_nonce_hash=NULL, auth_nonce_expires_at=NULL, credential_version=credential_version+1, updated_at=now() WHERE id=${deviceId}::uuid AND status<>'revoked'`;
    const challenge = await this.issueChallenge(deviceId, user.vistaUserId);
    await this.audit(user.vistaUserId, organizationId, "device.credential_rotation_requested", deviceId);
    return { device: view(await this.loadDevice(organizationId, deviceId)), ...challenge };
  }

  // ---------------------------------------------------------------- device-facing (public, rate limited)

  /** Step 1 of enrollment: the one-time code is exchanged for a nonce the device must sign with the NEW private key. */
  async enrollStart(enrollmentCode: string) {
    this.assertEnabled();
    const rows = await this.prisma.$queryRaw<Array<{ id: string; device_id: string }>>`
      SELECT c.id, c.device_id FROM public.device_enrollment_challenges c JOIN public.robot_devices d ON d.id=c.device_id JOIN public.organizations o ON o.id=d.organization_id
      WHERE c.code_hash=${sha256Hex(enrollmentCode)} AND c.consumed_at IS NULL AND c.expires_at>now() AND d.status='pending' AND o.status='active' LIMIT 1`;
    if (!rows[0]) throw new NotFoundException("Enrollment code was not found or has expired.");
    const nonce = newSecret(24);
    const expiresAt = new Date(Date.now() + ENROLL_NONCE_SECONDS * 1000);
    await this.prisma.$executeRaw`UPDATE public.device_enrollment_challenges SET nonce_hash=${sha256Hex(nonce)}, nonce_expires_at=${expiresAt} WHERE id=${rows[0].id}::uuid AND consumed_at IS NULL`;
    return { deviceId: rows[0].device_id, nonce, nonceExpiresAt: expiresAt, signedMessageFormat: "vista-device-enroll:v1:<deviceId>:<nonce>", algorithm: "Ed25519" };
  }

  /** Step 2: proof of possession. The device sends its public key and a signature over the enrollment message. */
  async enrollComplete(dto: EnrollCompleteDto) {
    this.assertEnabled();
    const key = parseEd25519PublicKey(dto.publicKey);
    if (!key) throw new BadRequestException({ code: "INVALID_PUBLIC_KEY", message: "The public key must be an Ed25519 SPKI key, base64url encoded." });
    const rows = await this.prisma.$queryRaw<Array<{ id: string; organization_id: string }>>`
      SELECT c.id, d.organization_id FROM public.device_enrollment_challenges c JOIN public.robot_devices d ON d.id=c.device_id JOIN public.organizations o ON o.id=d.organization_id
      WHERE c.device_id=${dto.deviceId}::uuid AND c.nonce_hash=${sha256Hex(dto.nonce)} AND c.consumed_at IS NULL AND c.expires_at>now() AND c.nonce_expires_at>now() AND d.status='pending' AND o.status='active' LIMIT 1`;
    const challenge = rows[0];
    if (!challenge || !verifyEd25519(dto.publicKey, enrollMessage(dto.deviceId, dto.nonce), dto.signature)) throw new UnauthorizedException("Enrollment could not be verified.");
    try {
      await this.prisma.$transaction(async (tx) => {
        const consumed = await tx.$executeRaw`UPDATE public.device_enrollment_challenges SET consumed_at=now() WHERE id=${challenge.id}::uuid AND consumed_at IS NULL`;
        if (consumed !== 1) throw new ConflictException("This enrollment was already completed.");
        const activated = await tx.$executeRaw`UPDATE public.robot_devices SET status='active', public_key=${dto.publicKey}, key_fingerprint=${key.fingerprint}, enrolled_at=now(), updated_at=now() WHERE id=${dto.deviceId}::uuid AND status='pending'`;
        if (activated !== 1) throw new ConflictException("This device can no longer be enrolled.");
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException("This key is already registered to another device.");
      throw error;
    }
    await this.audit(null, challenge.organization_id, "device.enrolled", dto.deviceId, { keyFingerprint: key.fingerprint });
    const device = await this.prisma.$queryRawUnsafe<DeviceRow[]>(`SELECT ${COLUMNS} FROM public.robot_devices d WHERE d.id=$1::uuid`, dto.deviceId);
    return { deviceId: dto.deviceId, status: "active" as const, keyFingerprint: key.fingerprint, credentialVersion: device[0]?.credential_version ?? 1 };
  }

  /** Session step 1: a single-use nonce for an ACTIVE device. Every other case answers the same generic 401. */
  async authChallenge(dto: AuthChallengeDto) {
    this.assertEnabled();
    const nonce = newSecret(24);
    const expiresAt = new Date(Date.now() + AUTH_NONCE_SECONDS * 1000);
    const updated = await this.prisma.$executeRaw`
      UPDATE public.robot_devices d SET auth_nonce_hash=${sha256Hex(nonce)}, auth_nonce_expires_at=${expiresAt}
      WHERE d.id=${dto.deviceId}::uuid AND d.status='active' AND EXISTS (SELECT 1 FROM public.organizations o WHERE o.id=d.organization_id AND o.status='active')`;
    if (updated !== 1) throw new UnauthorizedException("Device authentication failed.");
    return { nonce, expiresAt, signedMessageFormat: "vista-device-auth:v1:<deviceId>:<nonce>", algorithm: "Ed25519" };
  }

  /** Session step 2: the nonce is consumed atomically (one attempt per nonce), then the signature is verified against the enrolled key. */
  async authToken(dto: AuthTokenDto) {
    this.assertEnabled();
    const secret = this.secret();
    const rows = await this.prisma.$queryRaw<Array<{ organization_id: string; public_key: string; credential_version: number }>>`
      UPDATE public.robot_devices d SET auth_nonce_hash=NULL, auth_nonce_expires_at=NULL, last_seen_at=now()
      WHERE d.id=${dto.deviceId}::uuid AND d.status='active' AND d.auth_nonce_hash=${sha256Hex(dto.nonce)} AND d.auth_nonce_expires_at>now()
        AND EXISTS (SELECT 1 FROM public.organizations o WHERE o.id=d.organization_id AND o.status='active')
      RETURNING d.organization_id, d.public_key, d.credential_version`;
    const device = rows[0];
    if (!device || !verifyEd25519(device.public_key, authMessage(dto.deviceId, dto.nonce), dto.signature)) throw new UnauthorizedException("Device authentication failed.");
    const now = Math.floor(Date.now() / 1000);
    const expiresIn = this.tokenSeconds();
    const accessToken = signDeviceToken(secret, { kind: "device", sub: dto.deviceId, org: device.organization_id, cv: device.credential_version, iat: now, exp: now + expiresIn, jti: randomUUID() });
    return { accessToken, tokenType: "device" as const, expiresIn };
  }

  /** Used by DeviceAuthGuard on every device request: token signature, then the LIVE device state (so suspension/revocation/rotation bite at once). */
  async authenticate(token: string): Promise<AuthenticatedDevice> {
    if (!this.enabled) throw new UnauthorizedException("Device authentication failed.");
    const claims: DeviceTokenClaims | null = verifyDeviceToken(this.secret(), token);
    if (!claims) throw new UnauthorizedException("Device authentication failed.");
    const rows = await this.prisma.$queryRaw<Array<{ id: string; organization_id: string; name: string; device_kind: string; robot_id: string | null }>>`
      SELECT d.id, d.organization_id, d.name, d.device_kind, d.robot_id FROM public.robot_devices d JOIN public.organizations o ON o.id=d.organization_id
      WHERE d.id=${claims.sub}::uuid AND d.organization_id=${claims.org}::uuid AND d.status='active' AND d.credential_version=${claims.cv} AND o.status='active' LIMIT 1`;
    if (!rows[0]) throw new UnauthorizedException("Device authentication failed.");
    return { id: rows[0].id, organizationId: rows[0].organization_id, name: rows[0].name, deviceKind: rows[0].device_kind, robotId: rows[0].robot_id };
  }

  async heartbeat(device: AuthenticatedDevice) {
    await this.prisma.$executeRaw`UPDATE public.robot_devices SET last_seen_at=now() WHERE id=${device.id}::uuid AND status='active'`;
    return { status: "active" as const, serverTime: new Date().toISOString() };
  }
}

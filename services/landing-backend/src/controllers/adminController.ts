import { Request, Response } from 'express';
import prisma from '../prismaClient';
import bcrypt from 'bcrypt';

// POST /api/admin/organizations
export const createOrganization = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, type, segment, converted_from_lead_id } = req.body;
    
    // Nếu có lead_id, kiểm tra xem Lead có tồn tại không
    if (converted_from_lead_id) {
      const lead = await prisma.lead.findUnique({ where: { id: converted_from_lead_id } });
      if (!lead) {
        res.status(404).json({ success: false, message: 'Lead not found' });
        return;
      }
    }

    const org = await prisma.organization.create({
      data: {
        name,
        type,
        segment,
        converted_from_lead_id,
        status: 'active'
      }
    });

    if (converted_from_lead_id) {
      await prisma.lead.update({
        where: { id: converted_from_lead_id },
        data: { status: 'converted' }
      });
    }

    res.status(201).json({ success: true, data: org });
  } catch (error) {
    console.error('Create organization error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// POST /api/admin/entitlements
export const createEntitlement = async (req: Request, res: Response): Promise<void> => {
  try {
    const { organization_id, resource_type, resource_id, seats, valid_from, valid_to } = req.body;

    const entitlement = await prisma.orgEntitlement.create({
      data: {
        organization_id,
        resource_type,
        resource_id,
        seats,
        valid_from: valid_from ? new Date(valid_from) : null,
        valid_to: valid_to ? new Date(valid_to) : null,
      }
    });

    res.status(201).json({ success: true, data: entitlement });
  } catch (error) {
    console.error('Create entitlement error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// POST /api/admin/users
export const createUserForOrg = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, full_name, organization_id, role_name } = req.body;

    // Tìm Role
    let role = await prisma.role.findFirst({ where: { name: role_name } });
    if (!role) {
      role = await prisma.role.create({
        data: { name: role_name, scope: 'organization' }
      });
    }

    const password_hash = await bcrypt.hash(password, 10);

    const result = await prisma.$transaction(async (tx) => {
      // 1. Tạo hoặc lấy User
      let user = await tx.user.findUnique({ where: { email } });
      if (!user) {
        user = await tx.user.create({
          data: {
            email,
            password_hash,
            full_name,
            signup_method: 'admin_created',
          }
        });
      }

      // 2. Tạo Membership
      const membership = await tx.membership.create({
        data: {
          user_id: user.id,
          organization_id,
          role_id: role!.id
        }
      });

      return { user, membership };
    });

    res.status(201).json({ success: true, data: result });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

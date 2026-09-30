import { Request, Response } from 'express';
import prisma from '../prismaClient';

// POST /api/org/assignments
export const assignResourceToUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { membership_id, entitlement_id } = req.body;

    // Kiểm tra xem entitlement có thuộc về organization của membership không
    const membership = await prisma.membership.findUnique({ where: { id: membership_id } });
    const entitlement = await prisma.orgEntitlement.findUnique({ where: { id: entitlement_id } });

    if (!membership || !entitlement) {
      res.status(404).json({ success: false, message: 'Membership or Entitlement not found' });
      return;
    }

    if (membership.organization_id !== entitlement.organization_id) {
      res.status(403).json({ success: false, message: 'Entitlement does not belong to this organization' });
      return;
    }

    // Kiểm tra số lượng seats (cơ bản)
    const currentAssignments = await prisma.userAssignment.count({
      where: { entitlement_id }
    });

    if (currentAssignments >= entitlement.seats) {
      res.status(400).json({ success: false, message: 'No more seats available for this entitlement' });
      return;
    }

    const assignment = await prisma.userAssignment.create({
      data: {
        membership_id,
        entitlement_id
      }
    });

    res.status(201).json({ success: true, data: assignment });
  } catch (error) {
    console.error('Assign resource error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

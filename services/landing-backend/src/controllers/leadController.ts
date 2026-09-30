import { Request, Response } from 'express';
import prisma from '../prismaClient';

export const createLead = async (req: Request, res: Response): Promise<void> => {
  try {
    const { 
      full_name, email, phone, organization_name, lead_type, 
      segment_interest, use_case, message, source, scheduled_at, format 
    } = req.body;

    const lead = await prisma.lead.create({
      data: {
        full_name,
        email,
        phone,
        organization_name,
        lead_type,
        segment_interest,
        use_case,
        message,
        source,
        demo_bookings: {
          create: {
            scheduled_at: scheduled_at ? new Date(scheduled_at) : null,
            format,
            status: 'pending'
          }
        }
      },
      include: {
        demo_bookings: true
      }
    });

    res.status(201).json({ success: true, data: lead });
  } catch (error) {
    console.error('Create lead error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

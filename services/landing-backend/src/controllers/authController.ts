import { Request, Response } from 'express';
import prisma from '../prismaClient';
import bcrypt from 'bcrypt';

export const registerPersonal = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, full_name } = req.body;

    if (!email || !password || !full_name) {
      res.status(400).json({ success: false, message: 'Missing required fields' });
      return;
    }

    // Kiểm tra User đã tồn tại
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      res.status(400).json({ success: false, message: 'Email already exists' });
      return;
    }

    // Tìm Role "Personal User" (nếu chưa có thì tạo tạm để tránh lỗi)
    let role = await prisma.role.findFirst({ where: { name: 'Personal User' } });
    if (!role) {
      role = await prisma.role.create({
        data: {
          name: 'Personal User',
          scope: 'organization'
        }
      });
    }

    const password_hash = await bcrypt.hash(password, 10);

    // Dùng Prisma Transaction để đảm bảo tính toàn vẹn dữ liệu
    const result = await prisma.$transaction(async (tx) => {
      // 1. Tạo Organization (type="personal")
      const org = await tx.organization.create({
        data: {
          name: `Personal - ${full_name}`,
          type: 'personal',
          status: 'active'
        }
      });

      // 2. Tạo User
      const user = await tx.user.create({
        data: {
          email,
          password_hash,
          full_name,
          signup_method: 'self_registered',
          status: 'active'
        }
      });

      // 3. Tạo Membership gán Role "Personal User" cho User trong Organization
      const membership = await tx.membership.create({
        data: {
          user_id: user.id,
          organization_id: org.id,
          role_id: role!.id,
          status: 'active'
        }
      });

      return { org, user, membership };
    });

    res.status(201).json({ 
      success: true, 
      message: 'Registration successful',
      data: {
        userId: result.user.id,
        organizationId: result.org.id,
        membershipId: result.membership.id
      }
    });
  } catch (error) {
    console.error('Register personal error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

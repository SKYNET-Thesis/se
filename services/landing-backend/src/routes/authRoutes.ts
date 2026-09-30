import { Router } from 'express';
import { registerPersonal } from '../controllers/authController';

const router = Router();

// Endpoint khách cá nhân tự đăng ký
router.post('/register-personal', registerPersonal);

export default router;

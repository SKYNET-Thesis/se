import { Router } from 'express';
import { createLead } from '../controllers/leadController';

const router = Router();

// Endpoint xử lý khách gửi form demo (Tạo Lead + DemoBooking)
router.post('/', createLead);

export default router;

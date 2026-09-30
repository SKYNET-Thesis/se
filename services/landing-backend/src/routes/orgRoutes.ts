import { Router } from 'express';
import { assignResourceToUser } from '../controllers/orgController';

const router = Router();

router.post('/assignments', assignResourceToUser);

export default router;

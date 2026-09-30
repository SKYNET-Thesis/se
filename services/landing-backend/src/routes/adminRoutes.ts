import { Router } from 'express';
import { createOrganization, createEntitlement, createUserForOrg } from '../controllers/adminController';

const router = Router();

router.post('/organizations', createOrganization);
router.post('/entitlements', createEntitlement);
router.post('/users', createUserForOrg);

export default router;

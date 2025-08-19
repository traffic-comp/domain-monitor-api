import express from 'express';
import {} from '../controllers/domainController.js';
import {
  deleteProxy,
  setProxy,
  updateProxy,
} from '../controllers/proxyController.js';

const router = express.Router();

router.post('/set-proxy', setProxy);
router.patch('/update-proxy', updateProxy);
router.delete('/delete-proxy', deleteProxy);

export default router;

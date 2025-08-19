import express from 'express';
import {} from '../controllers/checkController.js';
import {
  deleteProxy,
  getProxy,
  setProxy,
  updateProxy,
} from '../controllers/proxyController.js';

const router = express.Router();

router.get('/get', getProxy);
router.post('/set', setProxy);
router.patch('/update', updateProxy);
router.delete('/delete', deleteProxy);

export default router;

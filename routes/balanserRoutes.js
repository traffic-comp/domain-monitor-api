import express from 'express';
import {
  add,
  checkDomainBalanser,
  connectDomain,
  deleteBalanser,
  get,
} from '../controllers/balanserController.js';

const router = express.Router();

router.get('/get', get);
router.post('/add', add);
router.delete('/delete', deleteBalanser);
router.post('/connect-domain', connectDomain);
router.post('/check-domain-balanser', checkDomainBalanser);

export default router;

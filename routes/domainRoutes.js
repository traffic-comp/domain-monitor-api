import express from 'express';
import {
  deactivate,
  deleteDomain,
  getDomain,
  getKtDomains,
  setActive,
  setDomain,
} from '../controllers/domainController.js';

const router = express.Router();

router.get('/get', getDomain);
router.post('/set', setDomain);
router.post('/set-active', setActive);
router.post('/deactivate', deactivate);
router.delete('/delete', deleteDomain);
router.get('/kt-domains',getKtDomains)
export default router;

import express from 'express';
import {
  deleteDomain,
  getDomain,
  getKtDomains,
  setDomain,
} from '../controllers/domainController.js';

const router = express.Router();

router.get('/get', getDomain);
router.post('/set', setDomain);
router.delete('/delete', deleteDomain);
router.get('/kt-domains',getKtDomains)
export default router;

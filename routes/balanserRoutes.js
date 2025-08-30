import express from 'express';
import { add, checkDomainBalanser, connectDomain, deactivate, deleteBalanser, get, setActive } from '../controllers/balanserController.js';

const router = express.Router();

router.get('/get', get);
router.post('/add', add);
router.post('/set-active', setActive);
router.post('/deactivate', deactivate);
router.delete('/delete', deleteBalanser);
router.post("/connect-domain", connectDomain);
router.post("/check-domain-balanser", checkDomainBalanser);



export default router;

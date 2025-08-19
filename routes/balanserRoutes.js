import express from 'express';
import { add, connectDomain, deactivate, deleteBalanser, get, setActive } from '../controllers/balanserController.js';

const router = express.Router();

router.get('/get', get);
router.post('/add', add);
router.post('/set-active', setActive);
router.post('/deactivate', deactivate);
router.delete('/delete', deleteBalanser);
router.post("/setDomain", connectDomain);

export default router;

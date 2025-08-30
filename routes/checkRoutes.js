import express from "express";
import {
  checkBalansers,
  checkDomainViaProxy,
  checkReestrDomains,
  checkReestrIps,
  runChecks,
  scrapSites,
} from "../controllers/checkController.js";

const router = express.Router();

router.post("/domain", runChecks);
router.post("/links", checkDomainViaProxy);
router.post("/balancers", checkBalansers);
router.post("/sites", scrapSites);
router.post("/reestr-domains", checkReestrDomains);
router.post("/reestr-ips", checkReestrIps);

export default router;

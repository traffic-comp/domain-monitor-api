import express from "express";
import {
  checkBalansers,
  checkDomainViaProxy,
  checkReestrDomains,
  checkReestrIps,
  runChecks,
  scrapSites,
} from "../controllers/domainController.js";

const router = express.Router();

router.post("/check-domain", runChecks);
router.post("/check-links", checkDomainViaProxy);
router.post("/check-balancers", checkBalansers);
router.post("/scrap-sites", scrapSites);
router.post("/reestr-domains", checkReestrDomains);
router.post("/reestr-ips", checkReestrIps);

export default router;

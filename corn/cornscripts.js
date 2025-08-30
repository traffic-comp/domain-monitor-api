import cron from "node-cron";
import domainModel from "../models/domainModel.js";
import proxyModel from "../models/proxyModel.js";
import { checkProxyCurl } from "../utils/domainUtils.js";
import { setStability } from "../controllers/checkController.js";
import balanserModel from "../models/balanserModel.js";
const MODEL_ID = "68a45c20bb03db36d2c64a7a";
const BALANCER_ID = "68a473c6235bcc27f3a494ba";

export const startCron = () => {
  console.log("Крон запущен 🚀");

  cron.schedule("*/15 * * * *", () => {
    console.log("Бегу каждуе 15 минут 🚀");
    chekLinks();
  });

  cron.schedule("0 */3 * * *", () => {
    console.log("Бегу каждуе 3 часа 🚀");
    checkReestr();
  });
};

const sendLogToChat = async (token, chat_id, data) => {
  await fetch(
    `https://api.telegram.org/bot${token}/sendMessage?chat_id=${chat_id}&text=${data}
    `,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
    }
  );
};

const chekLinks = async () => {
  const { activeDomains } = await domainModel.findOne({ _id: MODEL_ID });

  if (!activeDomains.length) return;
  checkDomainViaProxy(activeDomains);
};

async function checkDomainViaProxy(siteUrls) {
  if (!siteUrls || !Array.isArray(siteUrls) || siteUrls.length === 0) {
    console.log("Нужно передать siteUrls — массив ссылок");
    return;
  }

  const proxies = await proxyModel.find({ type: "http" });
  const results = {};

  for (const siteUrl of siteUrls) {
    results[siteUrl] = [];

    for (let i = 0; i < proxies.length; i++) {
      const proxyObj = proxies[i];
      console.log(
        `🔍 Проверка ${siteUrl.domain} через ${proxyObj.proxyType} (${i + 1}/${
          proxies.length
        })`
      );

      const proxyResult = await checkProxyCurl(siteUrl.domain, proxyObj);

      await setStability(
        proxyResult.error ? "decrease" : "increase",
        siteUrl.domain,
        proxyObj.proxyType
      );
    }
  }
  console.log("checkDomainViaProxy --- finish");
}
const checkReestr = async () => {
  const domains = await domainModel.findOne({ _id: MODEL_ID });

  const activeDomains = domains.activeDomains;

  const resopone = await fetch(
    "https://reestr.rublacklist.net/api/v3/domains/"
  );

  if (!resopone.ok) {
    result.error = `Ошибка при обращении к реестру: ${res.status} ${res.statusText}`;
    return res.status(500).json(result);
  }
  const data = await resopone.json();

  if (data) {
    for (const domain of activeDomains) {
      const reestrDomains = data.find(
        (reestrDomain) => reestrDomain === domain.domain
      );

      if (reestrDomains) {
        console.log(reestrDomains);
        sendLogToChat(
          process.env.TG_TOKEN,
          "-1002801931976",
          `Забанен ${reestrDomains}`
        );
      }
    }
  }

  const ips = await balanserModel.findOne({ _id: BALANCER_ID });

  const balansers = ips.balansers;
  const resoponeip = await fetch("https://reestr.rublacklist.net/api/v3/ips/");

  if (!resoponeip.ok) {
    result.error = `Ошибка при обращении к реестру: ${res.status} ${res.statusText}`;
    return res.status(500).json(result);
  }

  const dataip = await resoponeip.json();

  if (dataip) {
    for (const ip of balansers) {
      const reestrIps = dataip.find((reestrIp) => reestrIp === ip.ip);
      if (reestrIps) {
        sendLogToChat(
          process.env.TG_TOKEN,
          "-1002801931976",
          `Забанен ${reestrIps}`
        );
      }
    }
  }
};

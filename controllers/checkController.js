import puppeteer from "puppeteer";
import ping from "ping";
import dns from "dns/promises";

import sharp from "sharp";
import proxyModel from "../models/proxyModel.js";
import {
  checkBalancer,
  checkDomainInfo,
  checkPort,
  checkProxyCurl,
  checkSSL,
  delay,
} from "../utils/domainUtils.js";

// --- Роут 1: проверка доменов по массиву доменов domain ---
export async function runChecks(req, res) {
  const { domains } = req.body;
  if (!domains || !Array.isArray(domains) || domains.length === 0) {
    return res
      .status(400)
      .json({ error: "Нужно передать domains — массив доменов или URL" });
  }

  const results = [];

  for (const domainInput of domains) {
    const domainOnly = domainInput.replace(/^https?:\/\//, "").split("/")[0];

    // определяем IP балансера (A-запись)
    let balancerIP = null;
    try {
      const lookup = await dns.lookup(domainOnly);
      balancerIP = lookup.address;
    } catch {}

    // пинг балансера
    let balancerPing = null;
    if (balancerIP) {
      try {
        const pingRes = await ping.promise.probe(balancerIP, { timeout: 3 });
        let dnsHost = null;
        try {
          dnsHost = (await dns.lookup(balancerIP)).address;
        } catch {}
        balancerPing = {
          ip: balancerIP,
          dnsHost,
          pingAlive: pingRes.alive,
          pingTime: pingRes.time,
        };
      } catch {}
    }

    // IP домена
    const ip = await checkDomainInfo(domainOnly);

    // SSL
    let sslInfo;
    try {
      sslInfo = await checkSSL(domainOnly);
    } catch (e) {
      sslInfo = { error: e };
    }

    // NS-записи
    let nsList = [];
    try {
      nsList = await dns.resolveNs(domainOnly);
    } catch {}

    // Проверки портов и HTTP/HTTPS
    let port80Open = false;
    let port443Open = false;
    let httpAlive = false;
    let httpsAlive = false;
    let httpStatus = null;
    let httpsStatus = null;

    if (balancerIP) {
      [port80Open, port443Open] = await Promise.all([
        checkPort(balancerIP, 80),
        checkPort(balancerIP, 443),
      ]);

      // HTTP по IP
      if (port80Open) {
        try {
          const res = await fetch(`http://${balancerIP}`, { timeout: 3000 });
          httpAlive = res.status === 200 || res.status === 404;
          httpStatus = res.status;
        } catch {}
      }

      // HTTPS по доменному имени
      if (port443Open) {
        try {
          const res = await fetch(`https://${domainOnly}`, { timeout: 3000 });
          httpsAlive = res.status === 200 || res.status === 404;
          httpsStatus = res.status;
        } catch {}
      }
    }

    results.push({
      fullUrl: domainInput,
      domain: domainOnly,
      ip: ip || "Не найден",
      sslInfo,
      ns: nsList,
      balancerPing,
      port80Open,
      port443Open,
      httpAlive,
      httpStatus,
      httpsAlive,
      httpsStatus,
    });
  }

  res.json(results);
}

const stability = {};
// --- Роут 2: проверка через прокси по массиву ссылок domain/id?show=1 ---
export async function checkDomainViaProxy(req, res) {
  const { siteUrls } = req.body;
  if (!siteUrls || !Array.isArray(siteUrls) || siteUrls.length === 0) {
    return res
      .status(400)
      .json({ error: "Нужно передать siteUrls — массив ссылок" });
  }

  const proxies = await proxyModel.find({ type: "http" });
  const results = {};

  for (const siteUrl of siteUrls) {
    results[siteUrl] = [];
    if (!stability[siteUrl]) stability[siteUrl] = {};

    for (let i = 0; i < proxies.length; i++) {
      const proxyObj = proxies[i];
      console.log(
        `🔍 Проверка ${siteUrl} через ${proxyObj.proxyType} (${i + 1}/${
          proxies.length
        })`
      );

      const proxyResult = await checkProxyCurl(siteUrl, proxyObj);

      if (!stability[siteUrl][proxyObj.proxyType]) {
        stability[siteUrl][proxyObj.proxyType] = {
          attempts: 0,
          success: 0,
          failed: 0,
          stats: "(попытки / на успешные)*100",
        };
      }

      stability[siteUrl][proxyObj.proxyType].attempts =
        stability[siteUrl][proxyObj.proxyType].attempts + 1;
      if (!proxyResult.error) {
        stability[siteUrl][proxyObj.proxyType].success =
          stability[siteUrl][proxyObj.proxyType].success + 1;
      } else {
        stability[siteUrl][proxyObj.proxyType].failed =
          stability[siteUrl][proxyObj.proxyType].failed + 1;
      }

      results[siteUrl].push({
        proxyType: proxyResult.proxyType,
        httpStatus: proxyResult.httpStatus,
        markerFound: proxyResult.markerFound,
        error: proxyResult.error,
        redirect: proxyResult.redirect,
        responseTimeMs: proxyResult.responseTimeMs,
      });

      if (i < proxies.length - 1) {
        console.log(`⏳ Задержка 2000 мс перед следующей проверкой...`);
        await delay(2000);
      }
    }
  }
  res.json(results);
}

// --- Роут 3: скрапинг сайтов с маркером через прокси ---
export const scrapSites = async (req, res) => {
  try {
    const { siteUrls } = req.body;

    if (!siteUrls || !Array.isArray(siteUrls) || siteUrls.length === 0) {
      return res
        .status(400)
        .json({ error: "Нужно передать siteUrls — массив ссылок" });
    }

    const proxies = await proxyModel.find({ type: "socks5" });
    const results = [];

    for (const url of siteUrls) {
      for (const proxy of proxies) {
        const { proxyType, host, port, user, pass, type } = proxy;
        if (type == "socks5") {
          console.log(`\n🌐 Проверяем ${url} через прокси: ${proxyType}`);

          const browser = await puppeteer.launch({
            headless: true,
            args: [`--proxy-server=socks5://${host}:${port}`],
          });

          const page = await browser.newPage();
          await page.setUserAgent(
            "Mozilla/5.0 (Linux; Android 15; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.5845.187 Mobile Safari/537.36"
          );
          await page.setViewport({ width: 390, height: 844, isMobile: true });

          if (user && pass) {
            await page.authenticate({ username: user, password: pass });
          }

          const siteResult = {
            url,
            proxyType,
            markerFound: false,
            error: null,
            screenshot: null,
          };

          try {
            await page.goto(`https://${url}`, {
              waitUntil: "load",
              timeout: 30000,
            });
            siteResult.markerFound = (await page.$("#marker")) !== null;

            // Сжатый JPEG
            const screenshotBuffer = await page.screenshot({
              fullPage: false,
              type: "jpeg",
              quality: 30,
            });
            const compressedBuffer = await sharp(screenshotBuffer)
              .resize({ width: 200 }) // уменьшение размера
              .jpeg({ quality: 40 }) // дополнительное сжатие
              .toBuffer();

            siteResult.screenshot = compressedBuffer.toString("base64");

            console.log(
              siteResult.markerFound
                ? `✅ Marker найден через прокси: ${proxyType}`
                : `❌ Marker не найден через прокси: ${proxyType}`
            );
          } catch (err) {
            siteResult.error = err.message;
            console.error(
              `Ошибка при загрузке через ${proxyType}:`,
              err.message
            );
          } finally {
            await browser.close();
            console.log("Браузер закрыт\n");
          }

          results.push(siteResult);
        }
      }
    }

    return res.json(results);
  } catch (err) {
    console.error("[scrapSites] Ошибка:", err);
    return res.status(500).json({ error: "Ошибка при скрапинге сайтов" });
  }
};

// --- Роут 4: проверка домена в реестре ---
export const checkReestrDomains = async (req, res) => {
  try {
    const { domains } = req.body;

    if (!domains || !Array.isArray(domains) || domains.length === 0) {
      return res
        .status(400)
        .json({ error: "Нужно передать domains — массив доменов" });
    }

    const result = {
      domains: [],
      error: null,
    };

    const resopone = await fetch(
      "https://reestr.rublacklist.net/api/v3/domains/"
    );

    if (!resopone.ok) {
      result.error = `Ошибка при обращении к реестру: ${res.status} ${res.statusText}`;
      return res.status(500).json(result);
    }
    const data = await resopone.json();

    if (data) {
      for (const domain of domains) {
        const reestrDomains = data.find(
          (reestrDomain) => reestrDomain === domain
        );
        if (reestrDomains) {
          result.domains.push(reestrDomains);
        }
      }
    }

    res.status(200).json(result);
  } catch (err) {
    console.error("[checkReestr] Ошибка:", err);
    return res
      .status(500)
      .json({ error: "Ошибка при проверке реестра domain" });
  }
};

// --- Роут 5: проверка ип в реестре ---
export const checkReestrIps = async (req, res) => {
  try {
    const { ips } = req.body;

    if (!ips || !Array.isArray(ips) || ips.length === 0) {
      return res
        .status(400)
        .json({ error: "Нужно передать ips — массив IP-адресов" });
    }

    const result = {
      ips: [],
      error: null,
    };

    const resopone = await fetch("https://reestr.rublacklist.net/api/v3/ips/");

    if (!resopone.ok) {
      result.error = `Ошибка при обращении к реестру: ${res.status} ${res.statusText}`;
      return res.status(500).json(result);
    }

    const data = await resopone.json();

    if (data) {
      for (const ip of ips) {
        const reestrIps = data.find((reestrIp) => reestrIp === ip);
        if (reestrIps) {
          result.ips.push(reestrIps);
        }
      }
    }

    res.status(200).json(result);
  } catch (err) {
    console.error("[checkReestr] Ошибка:", err);
    return res.status(500).json({ error: "Ошибка при проверке реестра ip" });
  }
};

// --- Роут 6: проверка балансер ---
export const checkBalansers = async (req, res) => {
  try {
    const { ips } = req.body;

    if (!ips || !Array.isArray(ips) || ips.length === 0) {
      return res
        .status(400)
        .json({ error: "Нужно передать ips — массив IP-адресов" });
    }

    const results = await Promise.all(
      ips.map((ip) =>
        checkBalancer(ip).catch((err) => ({ error: err.message }))
      )
    );

    return res.json(results);
  } catch (err) {
    if (err instanceof TypeError) {
      return res.status(400).json({
        error:
          "Неверный формат данных. Убедитесь, что передали массив IP-адресов.",
      });
    }
  }
};

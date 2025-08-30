import puppeteer from 'puppeteer';
import ping from 'ping';
import dns from 'dns/promises';

import sharp from 'sharp';
import proxyModel from '../models/proxyModel.js';
import {
  checkBalancer,
  checkDomainInfo,
  checkPort,
  checkProxyCurl,
  checkSSL,
} from '../utils/domainUtils.js';
import domainModel from '../models/domainModel.js';

const MODEL_ID = '68a45c20bb03db36d2c64a7a';

// --- Роут 1: проверка доменов по массиву доменов domain ---
export async function runChecks(req, res) {
  const { domains } = req.body;
  if (!domains || !Array.isArray(domains) || domains.length === 0) {
    return res
      .status(400)
      .json({ error: 'Нужно передать domains — массив доменов или URL' });
  }

  const results = [];

  for (const domainInput of domains) {
    const domainOnly = domainInput.replace(/^https?:\/\//, '').split('/')[0];

    // определяем IP балансера (A-запись)
    let balancerIP = null;
    try {
      const lookup = await dns.lookup(domainOnly);
      balancerIP = lookup.address;
    } catch {}

    // Проверка доступности через HTTP вместо ping/TCP к IP
    let balancerPing = null;
    try {
      const start = Date.now();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);

      const response = await fetch(`http://${domainOnly}`, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeout);
      balancerPing = {
        ip: balancerIP,
        pingAlive: response.ok || response.status === 404, // true если сервер отвечает
        pingTime: Date.now() - start,
      };
    } catch (e) {
      balancerPing = {
        ip: balancerIP,
        pingAlive: false,
        pingTime: null,
      };
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

    // Проверки портов и HTTP/HTTPS через IP
    let port80Open = false;
    let port443Open = false;
    let httpAlive = false;
    let httpStatus = null;

    if (balancerIP) {
      [port80Open, port443Open] = await Promise.all([
        checkPort(balancerIP, 80),
        checkPort(balancerIP, 443),
      ]);

      if (port80Open) {
        try {
          const res = await fetch(`http://${balancerIP}`, { timeout: 3000 });
          httpAlive = res.status === 200 || res.status === 404;
          httpStatus = res.status;
        } catch {}
      }
    }

    results.push({
      fullUrl: domainInput,
      domain: domainOnly,
      ip: ip || 'Не найден',
      sslInfo,
      ns: nsList,
      balancerPing,
      port80Open,
      port443Open,
      httpAlive,
      httpStatus,
    });
  }

  console.log(results);
  res.json(results);
}
export const setStability = async (type, domainName, proxyName) => {
  try {
    const doc = await domainModel.findOne({
      'activeDomains.domain': domainName,
    });
    if (!doc) return { error: 'Домен не найден' };

    const domainItem = doc.activeDomains.find((d) => d.domain === domainName);

    if (!domainItem.stability) domainItem.stability = [];

    let proxyStat = domainItem.stability.find((s) => s.proxyName === proxyName);
    if (!proxyStat) {
      proxyStat = { proxyName, attempts: 0, success: 0, failed: 0, stats: 0 };
      domainItem.stability.push(proxyStat);
    }

    proxyStat.attempts++;
    if (type === 'increase') proxyStat.success++;
    if (type === 'decrease') proxyStat.failed++;

    proxyStat.stats =
      proxyStat.attempts > 0
        ? (proxyStat.success / proxyStat.attempts) * 100
        : 0;

    doc.markModified('activeDomains');

    await doc.save();
    return proxyStat;
  } catch (err) {
    console.error(err);
    return { error: err.message };
  }
};

// --- Роут 2: проверка через прокси по массиву ссылок domain/id?show=1 ---
export async function checkDomainViaProxy(req, res) {
  let siteUrls = req.body.siteUrls;

  // Если siteUrls не передан или пустой
  if (!siteUrls || !Array.isArray(siteUrls) || siteUrls.length === 0) {
    const domainsList = await domainModel.findOne({ _id: MODEL_ID });

    if (
      !domainsList ||
      !domainsList.activeDomains ||
      domainsList.activeDomains.length === 0
    ) {
      // Если активных доменов тоже нет — кидаем ошибку
      return res.status(400).json({ error: 'Нет доменов для проверки' });
    }

    // Используем активные домены
    siteUrls = domainsList.activeDomains.map((d) => d.domain);
  }

  const proxies = await proxyModel.find({ type: 'http' });
  const results = {};

  for (const siteUrl of siteUrls) {
    results[siteUrl] = [];

    for (let i = 0; i < proxies.length; i++) {
      const proxyObj = proxies[i];
      console.log(
        `🔍 Проверка ${siteUrl} через ${proxyObj.proxyType} (${i + 1}/${
          proxies.length
        })`
      );

      const proxyResult = await checkProxyCurl(siteUrl, proxyObj);

      await setStability(
        proxyResult.error ? 'decrease' : 'increase',
        siteUrl,
        proxyObj.proxyType
      );

      results[siteUrl].push({
        proxyType: proxyResult.proxyType,
        httpStatus: proxyResult.httpStatus,
        markerFound: proxyResult.markerFound,
        error: proxyResult.error,
        redirect: proxyResult.redirect,
        responseTimeMs: proxyResult.responseTimeMs,
      });
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
        .json({ error: 'Нужно передать siteUrls — массив ссылок' });
    }

    const proxies = await proxyModel.find({ type: 'socks5' });
    const results = [];

    for (const url of siteUrls) {
      for (const proxy of proxies) {
        const { proxyType, host, port, user, pass, type } = proxy;
        if (type == 'socks5') {
          console.log(`\n🌐 Проверяем ${url} через прокси: ${proxyType}`);

          const browser = await puppeteer.launch({
            headless: true,
            args: [`--proxy-server=socks5://${host}:${port}`],
          });

          const page = await browser.newPage();
          await page.setUserAgent(
            'Mozilla/5.0 (Linux; Android 15; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.5845.187 Mobile Safari/537.36'
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
              waitUntil: 'load',
              timeout: 30000,
            });
            siteResult.markerFound = (await page.$('#marker')) !== null;

            // Сжатый JPEG
            const screenshotBuffer = await page.screenshot({
              fullPage: false,
              type: 'jpeg',
              quality: 30,
            });
            const compressedBuffer = await sharp(screenshotBuffer)
              .resize({ width: 200 }) // уменьшение размера
              .jpeg({ quality: 40 }) // дополнительное сжатие
              .toBuffer();

            siteResult.screenshot = compressedBuffer.toString('base64');

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
            console.log('Браузер закрыт\n');
          }

          results.push(siteResult);
        }
      }
    }

    return res.json(results);
  } catch (err) {
    console.error('[scrapSites] Ошибка:', err);
    return res.status(500).json({ error: 'Ошибка при скрапинге сайтов' });
  }
};

// --- Роут 4: проверка домена в реестре ---
export const checkReestrDomains = async (req, res) => {
  try {
    const { domains } = req.body;

    if (!domains || !Array.isArray(domains) || domains.length === 0) {
      return res
        .status(400)
        .json({ error: 'Нужно передать domains — массив доменов' });
    }

    const result = {
      domains: [],
      error: null,
    };

    const resopone = await fetch(
      'https://reestr.rublacklist.net/api/v3/domains/'
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
    console.error('[checkReestr] Ошибка:', err);
    return res
      .status(500)
      .json({ error: 'Ошибка при проверке реестра domain' });
  }
};

// --- Роут 5: проверка ип в реестре ---
export const checkReestrIps = async (req, res) => {
  try {
    const { ips } = req.body;

    if (!ips || !Array.isArray(ips) || ips.length === 0) {
      return res
        .status(400)
        .json({ error: 'Нужно передать ips — массив IP-адресов' });
    }

    const result = {
      ips: [],
      error: null,
    };

    const resopone = await fetch('https://reestr.rublacklist.net/api/v3/ips/');

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
    console.error('[checkReestr] Ошибка:', err);
    return res.status(500).json({ error: 'Ошибка при проверке реестра ip' });
  }
};

// --- Роут 6: проверка балансер ---
export const checkBalansers = async (req, res) => {
  try {
    const { ips } = req.body;

    if (!ips || !Array.isArray(ips) || ips.length === 0) {
      return res
        .status(400)
        .json({ error: 'Нужно передать ips — массив IP-адресов' });
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
          'Неверный формат данных. Убедитесь, что передали массив IP-адресов.',
      });
    }
  }
};

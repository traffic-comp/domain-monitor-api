import { HttpsProxyAgent } from "https-proxy-agent";
import puppeteer from "puppeteer";
import ping from "ping";
import dns from "dns/promises";
import net from "net";
import tls from "tls";
import * as cheerio from "cheerio";
import { proxies } from "../models/proxies.js";
import sharp from "sharp";
import { exec } from "child_process";

// utils
async function checkMarkerInHtml(html) {
  try {
    const $ = cheerio.load(html);
    return $("#marker").length > 0;
  } catch (err) {
    console.error("[checkMarkerInHtml] Ошибка парсинга HTML:", err);
    return false;
  }
}

// utils
async function checkSSL(domain) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect(443, domain, { servername: domain }, () => {
      const cert = socket.getPeerCertificate();
      if (!cert || !cert.valid_to) {
        reject("No SSL certificate");
      } else {
        resolve({
          issuer: cert.issuer?.O || "Unknown",
          validTo: cert.valid_to,
        });
      }
      socket.end();
    });

    socket.on("error", (err) => reject(err.message));
  });
}

// utils
async function checkDomainInfo(domain) {
  try {
    const ip = await dns.lookup(domain);
    return ip.address;
  } catch {
    return null;
  }
}

// utils
function checkPort(host, port, timeout = 3000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeout);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
    socket.once("timeout", () => resolve(false));
    socket.connect(port, host);
  });
}

export async function checkBalancer(balancerIP) {
  if (!balancerIP) return null;

  const result = {
    ip: balancerIP,
    dnsHost: null,
    pingAlive: false,
    pingTime: null,
    port80Open: false,
    port443Open: false,
    httpAlive: false,
    httpStatus: null,
    httpsAlive: false,
    httpsStatus: null,
    error: null,
  };

  try {
    // ping
    const pingRes = await ping.promise.probe(balancerIP, { timeout: 3 });
    result.pingAlive = pingRes.alive;
    result.pingTime = pingRes.time;

    // DNS
    try {
      result.dnsHost = (await dns.lookup(balancerIP)).address;
    } catch {}

    // TCP ports
    [result.port80Open, result.port443Open] = await Promise.all([
      checkPort(balancerIP, 80),
      checkPort(balancerIP, 443),
    ]);

    // HTTP fetch
    if (result.port80Open) {
      try {
        const res = await fetch(`http://${balancerIP}`, { timeout: 3000 });
        result.httpAlive = res.ok;
        result.httpStatus = res.status;
      } catch {}
    }

    // HTTPS fetch + SSL
    if (result.port443Open) {
      try {
        const res = await fetch(`https://${balancerIP}`, { timeout: 3000 });
        result.httpsAlive = res.ok;
        result.httpsStatus = res.status;
      } catch {}
    }
  } catch (err) {
    result.error = err.message;
  }

  return result;
}

export function checkProxyCurl(fullUrl, proxyObj) {
  return new Promise((resolve) => {
    const { proxyType, type, host, port, user, pass } = proxyObj;
    const result = {
      proxyType,
      httpStatus: null,
      error: null,
      server: null,
      markerFound: null,
      redirect: null,
      responseTimeMs: null,
    };

    if (type !== "http") {
      result.error = `Proxy type "${type}" not allowed. Only "http" proxies are supported.`;
      return resolve(result);
    }

    const proxyAuth = `${user}:${pass}`;
    const proxy = `http://${proxyAuth}@${host}:${port}`;
    const curlCommand = [
      "curl",
      `--proxy ${proxy}`,
      "--connect-timeout 15",
      "--max-time 15",
      "-i", // включаем заголовки
      "-s", // без прогресс-бара
      `https://${fullUrl}`,
    ].join(" ");

    const startTime = Date.now();

    exec(curlCommand, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      const endTime = Date.now();
      result.responseTimeMs = endTime - startTime;

      if (err) {
        result.error = stderr || err.message;
        return resolve(result);
      }

      // Парсим заголовки
      const headersEnd = stdout.indexOf("\r\n\r\n");
      const headersText = stdout.slice(0, headersEnd);
      const body = stdout.slice(headersEnd + 4);

      const statusMatch = headersText.match(/^HTTP\/\d\.\d\s+(\d+)/m);
      result.httpStatus = statusMatch ? parseInt(statusMatch[1], 10) : null;

      const serverMatch = headersText.match(/^Server:\s*(.+)$/im);
      result.server = serverMatch ? serverMatch[1].trim() : null;

      const locationMatch = headersText.match(/^Location:\s*(.+)$/im);
      result.redirect = locationMatch ? locationMatch[1].trim() : null;
      result.markerFound = checkMarkerInHtml(body);

      resolve(result);
    });
  });
}

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

// --- Роут 2: проверка через прокси по массиву ссылок domain/id?show=1 ---
export async function checkDomainViaProxy(req, res) {
  const { siteUrls } = req.body;
  if (!siteUrls || !Array.isArray(siteUrls) || siteUrls.length === 0) {
    return res
      .status(400)
      .json({ error: "Нужно передать siteUrls — массив ссылок" });
  }

  const results = {};
  const allowedProxy = proxies.filter((p) => p.type === "http");

  for (const siteUrl of siteUrls) {
    const proxyResults = await Promise.all(
      allowedProxy.map((proxyObj) => checkProxyCurl(siteUrl, proxyObj))
    );

    results[siteUrl] = proxyResults.map(
      ({
        proxyType,
        httpStatus,
        error,
        markerFound,
        redirect,
        responseTimeMs,
      }) => ({
        proxyType,
        httpStatus,
        markerFound,
        error,
        redirect,
        responseTimeMs,
      })
    );
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

    const socks5Proxies = proxies.filter((p) => p.type === "socks5");
    const results = [];

    for (const url of siteUrls) {
      for (const proxy of socks5Proxies) {
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

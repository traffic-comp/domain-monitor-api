import { exec } from 'child_process';
import net from 'net';
import tls from 'tls';
import ping from 'ping';
import dns from 'dns/promises';
import * as cheerio from 'cheerio';

export async function checkMarkerInHtml(html) {
  try {
    const $ = cheerio.load(html);
    return $('#marker').length > 0;
  } catch (err) {
    console.error('[checkMarkerInHtml] Ошибка парсинга HTML:', err);
    return false;
  }
}

export async function checkSSL(domain) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect(443, domain, { servername: domain }, () => {
      const cert = socket.getPeerCertificate();
      if (!cert || !cert.valid_to) {
        reject('No SSL certificate');
      } else {
        resolve({
          issuer: cert.issuer?.O || 'Unknown',
          validTo: cert.valid_to,
        });
      }
      socket.end();
    });

    socket.on('error', (err) => reject(err.message));
  });
}

export async function checkDomainInfo(domain) {
  try {
    const ip = await dns.lookup(domain);
    return ip.address;
  } catch {
    return null;
  }
}

export function checkPort(host, port, timeout = 3000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeout);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
    socket.once('timeout', () => resolve(false));
    socket.connect(port, host);
  });
}

export async function checkBalancer(balancerIP) {
  if (!balancerIP) return null;

  const result = {
    ip: balancerIP,
    pingAlive: false,
    pingTime: null,
    port80Open: false,
    port443Open: false,
    httpAlive: false,
    httpStatus: null,
    error: null,
  };

  try {
    // ping
    const pingRes = await ping.promise.probe(balancerIP, { timeout: 3 });
    result.pingAlive = pingRes.alive;
    result.pingTime = pingRes.time;

    // TCP ports
    [result.port80Open, result.port443Open] = await Promise.all([
      checkPort(balancerIP, 80),
      checkPort(balancerIP, 443),
    ]);

    // HTTP fetch
    if (result.port80Open) {
      try {
        const res = await fetch(`http://${balancerIP}`, { timeout: 3000 });
        result.httpAlive = res.status === 200 || res.status === 404;
        result.httpStatus = res.status;
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

    if (type !== 'http') {
      result.error = `Proxy type "${type}" not allowed. Only "http" proxies are supported.`;
      return resolve(result);
    }

    const proxyAuth = `${user}:${pass}`;
    const proxy = `http://${proxyAuth}@${host}:${port}`;
    const curlCommand = [
      'curl',
      `--proxy ${proxy}`,
      '--connect-timeout 15',
      '--max-time 15',
      '-i', // включаем заголовки
      '-s', // без прогресс-бара
      `https://${fullUrl}`,
    ].join(' ');

    const startTime = Date.now();

    exec(
      curlCommand,
      { maxBuffer: 10 * 1024 * 1024 },
      (err, stdout, stderr) => {
        const endTime = Date.now();
        result.responseTimeMs = endTime - startTime;

        if (err) {
          result.error = stderr || err.message;
          return resolve(result);
        }

        // Парсим заголовки
        const headersEnd = stdout.indexOf('\r\n\r\n');
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
      }
    );
  });
}

export function delay(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

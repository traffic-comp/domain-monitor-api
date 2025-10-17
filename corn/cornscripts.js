import cron from 'node-cron';
import domainModel from '../models/domainModel.js';
import proxyModel from '../models/proxyModel.js';
import { checkProxyCurl } from '../utils/domainUtils.js';
import { setStability } from '../controllers/checkController.js';
import balanserModel from '../models/balanserModel.js';
import { exec } from 'child_process';
const MODEL_ID = '68a45c20bb03db36d2c64a7a';
const BALANCER_ID = '68a473c6235bcc27f3a494ba';

export const startCron = () => {
  console.log('Крон запущен 🚀');

  cron.schedule('*/15 * * * *', () => {
    console.log('Проверка доменов каждые 15 минут 🚀');
    // chekLinks();
  });
  cron.schedule('*/15 * * * *', () => {
    console.log('Проверка прокси каждые 15 минут 🚀');
    // checkAllProxies();
  });

  cron.schedule('0 */3 * * *', () => {
    console.log('Проверка реестров каждые 3 часа 🚀');
    // checkReestr();
  });
};

const sendLogToChat = async (token, chat_id, data) => {
  await fetch(
    `https://api.telegram.org/bot${token}/sendMessage?chat_id=${chat_id}&text=${data}
    `,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
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
    console.log('Нужно передать siteUrls — массив ссылок');
    return;
  }

  const proxies = await proxyModel.find({ type: 'http' });
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
        proxyResult.error ? 'decrease' : 'increase',
        siteUrl.domain,
        proxyObj.proxyType
      );
    }
  }
  console.log('checkDomainViaProxy --- finish');
}
export const checkReestr = async () => {
  try {
    console.log('🔍 Начинаем проверку реестра...');

    // --- Получаем все домены и балансеры ---
    const domainDocs = await domainModel.find();
    const balansers = await balanserModel.find();
    console.log(balansers);
    // --- Проверка доменов ---
    const domainResponse = await fetch(
      'https://reestr.rublacklist.net/api/v3/domains/'
    );
    if (!domainResponse.ok) {
      console.error(
        `❌ Ошибка при обращении к реестру доменов: ${domainResponse.status} ${domainResponse.statusText}`
      );
      return;
    }
    const reestrDomains = await domainResponse.json();

    for (const doc of domainDocs) {
      const domains = doc.activeDomains || [];
      for (const { domain } of domains) {
        if (reestrDomains.includes(domain)) {
          console.log(`🚫 Забанен домен: ${domain}`);
          await sendLogToChat(
            process.env.TG_TOKEN,
            TELEGRAM_CHAT_ID,
            `🚫 Забанен домен: ${domain}`
          );
        }
      }
    }

    // --- Проверка IP ---
    const ipResponse = await fetch(
      'https://reestr.rublacklist.net/api/v3/ips/'
    );
    if (!ipResponse.ok) {
      console.error(
        `❌ Ошибка при обращении к реестру IP: ${ipResponse.status} ${ipResponse.statusText}`
      );
      return;
    }
    const reestrIps = await ipResponse.json();

    for (const { ip } of balansers) {
      if (reestrIps.includes(ip)) {
        console.log(`🚫 Забанен IP: ${ip}`);
        await sendLogToChat(
          process.env.TG_TOKEN,
          TELEGRAM_CHAT_ID,
          `🚫 Забанен IP: ${ip}`
        );
      }
    }

    console.log('✅ Проверка реестра завершена успешно');
  } catch (error) {
    console.error('🔥 Ошибка при проверке реестра:', error);
  }
};

const checkSingleProxy = (proxyObj) => {
  return new Promise((resolve) => {
    const { type, host, port, user, pass, proxyType } = proxyObj;

    const result = {
      type,
      host,
      port,
      proxyType,
      success: false,
      error: null,
      responseTimeMs: null,
      externalIp: null,
    };

    if (type !== 'http') {
      result.error = 'Only HTTP proxies supported for now';
      return resolve(result);
    }

    const proxy = `http://${user}:${pass}@${host}:${port}`;
    const testUrl = 'https://api.ipify.org'; // отдаёт только IP

    const curlCommand = [
      'curl',
      `--proxy ${proxy}`,
      '--connect-timeout 15',
      '--max-time 15',
      '-s',
      testUrl,
    ].join(' ');

    const startTime = Date.now();

    try {
      exec(
        curlCommand,
        { maxBuffer: 10 * 1024 * 1024 },
        (err, stdout, stderr) => {
          result.responseTimeMs = Date.now() - startTime;

          if (err || !stdout) {
            result.error = stderr || err?.message || 'No response';

            // ⚠️ Отправляем лог только при ошибке проверки
            sendLogToChat(
              process.env.TG_TOKEN,
              '-1002867546772',
              `❌ Ошибка проверки прокси ${host}:${port}\n${result.error}`
            );

            return resolve(result);
          }

          result.success = true;
          result.externalIp = stdout.trim();
          resolve(result);
        }
      );
    } catch (e) {
      result.responseTimeMs = Date.now() - startTime;
      result.error = e.message || 'Unknown exec error';

      // ⚠️ Логируем критическую ошибку
      sendLogToChat(
        process.env.TG_TOKEN,
        '-1002867546772',
        `❌ Критическая ошибка exec при проверке ${host}:${port}\n${result.error}`
      );

      return resolve(result);
    }
  });
};

const checkAllProxies = async () => {
  const proxies = await proxyModel.find();

  const results = await Promise.all(proxies.map((p) => checkSingleProxy(p)));

  const working = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);

  console.log(`✅ Рабочие: ${working.length}, ❌ Не рабочие: ${failed.length}`);
  return results;
};

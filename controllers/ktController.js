import { config } from 'dotenv';
config();

function getDomainRegExp(url) {
  if (!url || typeof url !== 'string') return null;
  const match = url.match(/^https?:\/\/([^/]+)/i);
  return match ? match[1].replace(/^www\./, '') : null;
}

export const report = async (req, res) => {
  try {
    const { body } = req.body;

    const result = {};

    const reportResponse = await fetch(`${process.env.KT_URI}/report/build`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Api-Key': process.env.KT_TOKEN,
      },
      body: JSON.stringify(body),
    });

    if (!reportResponse.ok) {
      return res
        .status(reportResponse.status)
        .json({ error: 'Ошибка при получении данных с КТ' });
    }

    const data = await reportResponse.json();
    const rows = data.rows;

    if (!rows || !rows.length) {
      return res
        .status(404)
        .json({ error: 'Данных по указанным параметрам нет' });
    }

    for (const row of rows) {
      if (!result[row.campaign]) {
        result[row.campaign] = {};
      }

      result[row.campaign].campaign_id = row.campaign_id;
      result[row.campaign].clicks = row.clicks;
      result[row.campaign].campaign_unique_clicks = row.campaign_unique_clicks;
      result[row.campaign].conversions = row.conversions;
      result[row.campaign].cr = (
        (row.conversions / row.campaign_unique_clicks) *
        100
      ).toFixed(2);

      try {
        const campaign = await getCampaing(row.campaign_id);
        result[row.campaign].domain = getDomainRegExp(campaign.domain);
      } catch (err) {
        console.error(
          `[report] Ошибка при получении кампании ${row.campaign_id}:`,
          err
        );
        result[row.campaign].domain = '';
      }
    }

    return res.status(200).json(result);
  } catch (err) {
    console.error('[report] Ошибка:', err);
    return res
      .status(500)
      .json({ error: 'Ошибка при получении статистики с КТ' });
  }
};

export const reportFromStart = async (req, res) => {
  try {
    const { ids } = req.body; // на вход только массив ID кампаний

    if (!ids || !ids.length) {
      return res.status(400).json({ error: 'Не переданы ID кампаний' });
    }

    // Получаем все кампании одновременно
    const campaigns = await Promise.all(ids.map((id) => getCampaing(id)));
    const validCampaigns = campaigns.filter((c) => c !== null);

    if (!validCampaigns.length) {
      return res.status(404).json({ error: 'Нет доступных кампаний' });
    }

    const result = {};

    for (let info of validCampaigns) {
      const from = new Date(info.created_at);
      from.setHours(0, 0, 0, 0); // начало дня создания кампании
      const to = new Date();
      to.setHours(23, 59, 59, 999); // конец текущего дня

      // Формируем тело запроса для КТ
      const body = {
        range: {
          from: from.toISOString(), // "2025-08-16T00:00:00.000Z"
          to: to.toISOString(),
          timezone: 'Europe/Kyiv',
        },
        dimensions: ['campaign_id', 'campaign', 'day'], // по дням
        measures: ['clicks', 'campaign_unique_clicks', 'conversions', 'cr'],
        filters: [
          {
            name: 'campaign_id',
            operator: 'EQUALS',
            expression: info.id,
          },
        ],
        sort: [
          {
            name: 'day',
            order: 'ASC',
          },
        ],
      };

      const reportResponse = await fetch(`${process.env.KT_URI}/report/build`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Api-Key': process.env.KT_TOKEN,
        },
        body: JSON.stringify(body),
      });

      const data = await reportResponse.json();
      const rows = data.rows || [];

      result[info.name] = rows.map((row) => ({
        date: row.day, // дата по дням
        campaign_id: row.campaign_id,
        clicks: row.clicks,
        campaign_unique_clicks: row.campaign_unique_clicks,
        conversions: row.conversions,
        cr: row.cr || '0.00',
        domain: getDomainRegExp(info.domain),
        created_at: info.created_at,
      }));
    }

    res.status(200).json(result);
  } catch (err) {
    console.error('[report] Ошибка:', err);
    return res
      .status(500)
      .json({ error: 'Ошибка при получении статистики с КТ' });
  }
};

export const reportByHours = async (req, res) => {
  try {
    const { ids } = req.body;

    if (!ids || !ids.length) {
      return res.status(400).json({ error: 'No campaign IDs provided' });
    }

    const now = new Date();
    const fromDate = new Date(now);
    fromDate.setHours(0, 0, 0, 0); // сегодня с 00:00
    const toDate = new Date(now);
    toDate.setHours(23, 59, 59, 999); // до 23:59:59

    const body = {
      range: {
        from: fromDate.toISOString(),
        to: toDate.toISOString(),
        timezone: 'Europe/Kyiv',
      },
      dimensions: ['campaign_id', 'campaign', 'day_hour'], // для часовых данных
      measures: ['campaign_unique_clicks', 'conversions', 'cr'],
      filters: [
        {
          name: 'campaign_id',
          operator: 'IN_LIST',
          expression: ids, // или можно обойти массив ids, если нужно несколько кампаний
        },
      ],
    };

    const reportResponse = await fetch(`${process.env.KT_URI}/report/build`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Api-Key': process.env.KT_TOKEN,
      },
      body: JSON.stringify(body),
    });

    const data = await reportResponse.json();

    const result = {};

    if (data.rows) {
      data.rows.forEach((row) => {
        const name = row.campaign || 'unknown';
        if (!result[name]) result[name] = [];
        result[name].push({
          date: row.day_hour, // используем day_hour вместо date
          campaign_id: row.campaign_id,
          campaign_unique_clicks: row.campaign_unique_clicks || 0,
          conversions: row.conversions || 0,
          cr: row.cr || '0.00',
        });
      });
    }

    res.status(200).json(result);
  } catch (err) {
    console.error('[report] Ошибка:', err);
    res.status(500).json({ error: 'Ошибка при получении статистики с КТ' });
  }
};

const getCampaing = async (id) => {
  try {
    const response = await fetch(`${process.env.KT_URI}/campaigns/${id}`, {
      method: 'GET',
      headers: {
        'Api-Key': process.env.KT_TOKEN,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error(`[getCampaing] Ошибка: статус ${response.status}`);
      return null; // Возвращаем null при ошибке
    }

    const data = await response.json();
    return data;
  } catch (err) {
    console.error('[getCampaing] Ошибка:', err);
    return null; // Возвращаем null при исключении
  }
};

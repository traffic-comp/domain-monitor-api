import balanserModel from '../models/balanserModel.js';

// Получить все балансеры
export const get = async (req, res) => {
  try {
    const balansers = await balanserModel.find();

    if (!balansers.length) {
      return res.status(404).json({ error: 'Балансеры не найдены' });
    }

    return res.status(200).json(balansers);
  } catch (err) {
    console.error('[get] Ошибка:', err);
    return res.status(500).json({ error: 'Ошибка при получении балансеров' });
  }
};

// Добавить новый балансер
export const add = async (req, res) => {
  try {
    const { ip } = req.body;

    if (!ip) {
      return res.status(400).json({ error: 'Укажите ip балансера' });
    }

    const exists = await balanserModel.findOne({ ip });
    if (exists) {
      return res.status(409).json({ error: 'Такой балансер уже существует' });
    }

    const newBalanser = await balanserModel.create({ ip });
    return res.status(201).json(newBalanser);
  } catch (err) {
    console.error('[add] Ошибка:', err);
    return res.status(500).json({ error: 'Ошибка при добавлении балансера' });
  }
};

// Удалить балансер
export const deleteBalanser = async (req, res) => {
  try {
    const { ip } = req.body;

    if (!ip) {
      return res.status(400).json({ error: 'Укажите ip балансера' });
    }

    const deleted = await balanserModel.findOneAndDelete({ ip });

    if (!deleted) {
      return res.status(404).json({ error: 'Балансер с таким IP не найден' });
    }

    return res.status(200).json({ message: 'Балансер удалён', deleted });
  } catch (err) {
    console.error('[deleteBalanser] Ошибка:', err);
    return res.status(500).json({ error: 'Ошибка при удалении балансера' });
  }
};

// Привязать домен к балансеру
export async function connectDomain(req, res) {
  try {
    const { domain, ip } = req.body;

    if (!domain || !ip) {
      return res.status(400).json({ error: 'Укажи domain и balanser' });
    }

    const response = await fetch(`http://${ip}:8080/domains`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain }),
    });

    const text = await response.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return res.status(response.status).json({
        error: 'Сервер вернул не-JSON',
        status: response.status,
        body: text.slice(0, 200),
      });
    }

    return res.json(data);
  } catch (error) {
    console.error('[connectDomain] Ошибка:', error);
    return res.status(500).json({ error: error.message });
  }
}

// Проверить список доменов на балансере
export async function checkDomainBalanser(req, res) {
  try {
    const { ip } = req.body;

    if (!ip) {
      return res.status(400).json({ error: 'Укажи ip балансера' });
    }

    const response = await fetch(`http://${ip}:8080/domains`);
    const text = await response.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return res.status(response.status).json({
        error: 'Сервер вернул не-JSON',
        status: response.status,
        body: text.slice(0, 200),
      });
    }

    return res.json(data);
  } catch (error) {
    console.error('[checkDomainBalanser] Ошибка:', error);
    return res.status(500).json({ error: error.message });
  }
}

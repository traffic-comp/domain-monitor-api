import domainModel from '../models/domainModel.js';
import { config } from 'dotenv';
config();

/**
 * 🔹 Получить все домены
 */
export const getDomain = async (req, res) => {
  try {
    const domains = await domainModel.find();

    if (!domains.length) {
      return res.status(404).json({ error: 'Домены не найдены' });
    }

    return res.status(200).json(domains);
  } catch (err) {
    console.error('[getDomain] Ошибка:', err);
    return res.status(500).json({ error: 'Ошибка при получении доменов' });
  }
};

/**
 * 🔹 Добавить домен
 */
export const setDomain = async (req, res) => {
  try {
    const { domain } = req.body;

    if (!domain) {
      return res.status(400).json({ error: 'Укажите доменное имя' });
    }

    const existsDomain = await domainModel.findOne({ domain });
    if (existsDomain) {
      return res.status(400).json({ error: 'Домен уже был добавлен' });
    }

    const newDomain = await domainModel.create({
      domain,
      stability: [],
    });

    res.status(201).json(newDomain);
  } catch (err) {
    console.error('[setDomain] Ошибка:', err);
    return res.status(500).json({ error: 'Ошибка при добавлении домена' });
  }
};

/**
 * 🔹 Удалить домен
 */
export const deleteDomain = async (req, res) => {
  try {
    const { domain } = req.body;

    if (!domain) {
      return res.status(400).json({ error: 'Укажите доменное имя' });
    }

    const deletedDomain = await domainModel.findOneAndDelete({ domain });

    if (!deletedDomain) {
      return res.status(404).json({ error: 'Домен не найден' });
    }

    res.status(200).json({ success: true, deletedDomain });
  } catch (err) {
    console.error('[deleteDomain] Ошибка:', err);
    return res.status(500).json({ error: 'Ошибка при удалении домена' });
  }
};

/**
 * 🔹 Получить домены из KT
 */
export const getKtDomains = async (req, res) => {
  try {
    const response = await fetch(`${process.env.KT_URI}/domains`, {
      method: 'GET',
      headers: {
        'Api-Key': process.env.KT_TOKEN,
        'content-type': 'application/json',
      },
    });

    const data = await response.json();
    res.status(200).json(data);
  } catch (err) {
    console.error('[getKtDomains] Ошибка:', err);
    return res.status(500).json({ error: 'Ошибка при получении доменов с КТ' });
  }
};

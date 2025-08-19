import balanserModel from '../models/balanserModel.js';
const BALANSER_MODEL = '68a473c6235bcc27f3a494ba';

export const get = async (req, res) => {
  try {
    const balansers = await balanserModel.find();

    if (!balansers.length) {
      return res.status(404).json({ error: 'Балансеры не найдены' });
    }

    return res.status(200).json(balansers);
  } catch (err) {
    console.error('[get] Ошибка:', err);
    return res.status(500).json({ error: 'Ошибка при получения балансеров' });
  }
};

export const add = async (req, res) => {
  try {
    const { ip } = req.body;

    if (!ip) {
      return res.status(400).json({ error: 'Укажите ip балансера' });
    }

    // Проверяем, есть ли уже такой ip
    const exists = await balanserModel.findOne({
      _id: BALANSER_MODEL,
      'balansers.ip': ip,
    });

    if (exists) {
      return res.status(409).json({ error: 'Такой балансер уже существует' });
    }

    const newBalanser = await balanserModel.findOneAndUpdate(
      { _id: BALANSER_MODEL },
      {
        $push: {
          balansers: {
            ip,
            isUsage: false,
          },
        },
      },
      { new: true } // возвращаем обновленный документ
    );

    return res.status(201).json(newBalanser);
  } catch (err) {
    console.error('[add] Ошибка:', err);
    return res.status(500).json({ error: 'Ошибка при добавлении балансера' });
  }
};

export const setActive = async (req, res) => {
  try {
    const { ip } = req.body;

    const newBalanser = await balanserModel.findOneAndUpdate(
      { _id: BALANSER_MODEL },
      {
        $pull: {
          balansers: {
            ip,
            isUsage: false,
          },
        },
        $push: {
          activeBalansers: {
            ip,
            isUsage: true,
          },
        },
      },
      { new: true } // возвращаем обновленный документ
    );

    return res.status(201).json(newBalanser);
  } catch (err) {
    console.error('[add] Ошибка:', err);
    return res.status(500).json({ error: 'Ошибка при добавлении балансера' });
  }
};

export const deactivate = async (req, res) => {
  try {
    const { ip } = req.body;

    const newBalanser = await balanserModel.findOneAndUpdate(
      { _id: BALANSER_MODEL },
      {
        $push: {
          balansers: {
            ip,
            isUsage: false,
            isUsed: true,
          },
        },
        $pull: {
          activeBalansers: {
            ip,
            isUsage: true,
          },
        },
      },
      { new: true } // возвращаем обновленный документ
    );

    return res.status(201).json(newBalanser);
  } catch (err) {
    console.error('[add] Ошибка:', err);
    return res.status(500).json({ error: 'Ошибка при добавлении балансера' });
  }
};

export const deleteBalanser = async (req, res) => {
  try {
    const { ip } = req.body;

    if (!ip) {
      return res.status(400).json({ error: "Укажите ip балансера" });
    }

    const updatedDoc = await balanserModel.findOneAndUpdate(
      { _id: BALANSER_MODEL },
      {
        $pull: {
          balansers: { ip },        // удалить балансер из balansers
          activeBalansers: { ip },  // и из activeBalansers, если есть
        },
      },
      { new: true }
    );

    // Если не нашли ip — можно вернуть 404
    const wasDeleted =
      updatedDoc &&
      (!updatedDoc.balansers.some(b => b.ip === ip) &&
       !updatedDoc.activeBalansers?.some(b => b.ip === ip));

    if (wasDeleted) {
      return res.status(200).json(updatedDoc);
    } else {
      return res.status(404).json({ error: "Балансер с таким IP не найден" });
    }

  } catch (err) {
    console.error("[deleteBalanser] Ошибка:", err);
    return res.status(500).json({ error: "Ошибка при удалении балансера" });
  }
};


export async function connectDomain(req, res) {
  try {
    const { domain, ip } = req.body;

    if (!domain || !ip) {
      return res.status(400).json({ error: 'Укажи domain и balanser' });
    }

    try {
      const response = await fetch(`http://${ip}:8080/balansers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          domain,
        }),
      });

      const data = await response.json();
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  } catch (error) {
    console.error('Error while setting the domain:', error);
    res.status(500).json({ error: 'Error while setting the domain' });
  }
}

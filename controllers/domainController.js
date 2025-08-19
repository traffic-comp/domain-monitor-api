import domainModel from '../models/domainModel.js';

const MODEL_ID = '68a45c20bb03db36d2c64a7a';

export const getDomain = async (req, res) => {
  try {
    const domains = await domainModel.find();

    if (!domains.length) {
      return res.status(404).json({ error: 'Домены не найдены' });
    }

    return res.status(200).json(domains);
  } catch (err) {
    console.error('[getDomain] Ошибка:', err);
    return res.status(500).json({ error: 'Ошибка при получения доменов' });
  }
};

export const setDomain = async (req, res) => {
  try {
    const { domain } = req.body;

    if (!domain) {
      return res.status(400).json({ error: 'Укажите доменное имя' });
    }

    const newDomain = await domainModel.findOneAndUpdate(
      { _id: MODEL_ID },
      { $addToSet: { domains: domain } },
      { new: true }
    );
    res.status(201).json(newDomain);
  } catch (err) {
    console.error('[setDomain] Ошибка:', err);
    return res.status(500).json({ error: 'Ошибка при добавлении домена' });
  }
};

export const setActive = async (req, res) => {
  try {
    const { domain } = req.body;

    if (!domain) {
      return res.status(400).json({ error: 'Укажите доменное имя' });
    }

    const updatedDoc = await domainModel.findOneAndUpdate(
      { _id: MODEL_ID },
      { $pull: { domains: domain }, $addToSet: { activeDomains: domain } },
      { new: true }
    );

    res.status(200).json(updatedDoc);
  } catch (err) {
    console.error('[setActive] Ошибка:', err);
    return res
      .status(500)
      .json({ error: 'Ошибка при добавлении активного домена' });
  }
};

export const deactivate = async (req, res) => {
  try {
    const { domain } = req.body;

    if (!domain) {
      return res.status(400).json({ error: 'Укажите доменное имя' });
    }

    const updatedDoc = await domainModel.findOneAndUpdate(
      { _id: MODEL_ID },
      { $addToSet: { domains: domain }, $pull: { activeDomains: domain } },
      { new: true }
    );

    res.status(200).json(updatedDoc);
  } catch (err) {
    console.error('[setActive] Ошибка:', err);
    return res
      .status(500)
      .json({ error: 'Ошибка при добавлении активного домена' });
  }
};

export const deleteDomain = async (req, res) => {
  try {
    const { domain } = req.body;

    if (!domain) {
      return res.status(400).json({ error: 'Укажите доменное имя' });
    }

    const updatedDoc = await domainModel.findOneAndUpdate(
      { _id: MODEL_ID },
      { $pull: { domains: domain, activeDomains: domain } },
      { new: true }
    );

    res.status(200).json(updatedDoc);
  } catch (err) {
    console.error('[setActive] Ошибка:', err);
    return res
      .status(500)
      .json({ error: 'Ошибка при добавлении активного домена' });
  }
};

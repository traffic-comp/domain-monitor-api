import proxyModel from "../models/proxyModel.js";

export const getProxy = async (req, res) => {
  try {
    const proxies = await proxyModel.find();

    if (!proxies.length) {
      return res.status(404).json({
        error: "Прокси не найдены!",
      });
    }

    res.status(200).json(proxies);
  } catch (err) {
    console.error("[setProxy] Ошибка:", err);
    return res.status(500).json({ error: "Ошибка при добавлении прокси" });
  }
};

export const updateProxy = async (req, res) => {
  try {
    /**
     * fields: [
     *  {
     *    name:string,
     *    value: string | number
     *  }
     * ]
     */
    const { fields, proxyType } = req.body;
    const updateObj = {};

    for (let { name, value } of fields) {
      updateObj[name] = value;
    }

    let proxy = await proxyModel.findOneAndUpdate(
      { proxyType },
      {
        $set: updateObj,
      },
      { new: true }
    );

    res.status(201).json(proxy);
  } catch (err) {
    console.error("[updateProxy] Ошибка:", err);
    return res.status(500).json({ error: "Ошибка при обновлении" });
  }
};

export const setProxy = async (req, res) => {
  try {
    const { proxyType } = req.body;

    let body = Object.keys(req.body)
      .map((key) => req["body"][key])
      .filter((i) => i !== "");

    if (body.length < 6) {
      return res.status(400).json({ error: "Нужно заполнить все поля" });
    }

    const existProxy = await proxyModel.findOne({ proxyType });

    if (existProxy) {
      return res.status(400).json({
        error: "Прокси с таким названием уже есть",
      });
    }

    const proxies = await new proxyModel({ ...req.body });
    await proxies.save();
    res.send(201);
  } catch (err) {
    console.error("[setProxy] Ошибка:", err);
    return res.status(500).json({ error: "Ошибка при добавлении прокси" });
  }
};

export const deleteProxy = async (req, res) => {
  try {
    const { proxyType } = req.body;

    const existProxy = await proxyModel.findOne({ proxyType });

    if (!existProxy) {
      return res.status(400).json({
        error: "Прокси с таким названием не существует",
      });
    }

    await existProxy.deleteOne();

    res.send(200);
  } catch (err) {
    console.error("[deleteProxy] Ошибка:", err);
    return res.status(500).json({ error: "Ошибка при удалении прокси" });
  }
};

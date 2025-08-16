export async function setDomain(req, res) {
  try {
    const { domain, balanser } = req.body;

    if (!domain || !balanser) {
      return res.status(400).json({ error: "Укажи domain и balanser" });
    }

    try {
      const response = await fetch(`http://${balanser}:8080/domains`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
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
    console.error("Error while setting the domain:", error);
    res.status(500).json({ error: "Error while setting the domain" });
  }
}

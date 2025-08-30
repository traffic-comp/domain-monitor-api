import { config } from "dotenv";
config();
const CLOUDFLARE_API_TOKEN = process.env.CLOUD_FLARE_TOKEN;

async function getZoneId(domain) {
  const url = `https://api.cloudflare.com/client/v4/zones?name=${domain}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
      "Content-Type": "application/json",
    },
  });

  const json = await res.json();

  if (!json.success || json.result.length === 0) {
    throw new Error(`Zone for domain ${domain} not found`);
  }

  return json.result[0].id; // zoneId
}

async function getDnsRecords(zoneId) {
  const url = `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
      "Content-Type": "application/json",
    },
  });

  const json = await res.json();

  if (!json.success) {
    throw new Error(`Failed to fetch DNS records for zone ${zoneId}`);
  }

  return json.result; // массив записей
}

export async function updateDNSRecord(req, res) {
  const { domain, newIp } = req.body;

  const zoneId = await getZoneId(domain);
  const records = await getDnsRecords(zoneId);

  const record = records.find(
    (record) => record.name === domain && record.type === "A"
  );

  const { id, name } = record;

  const url = `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${id}`;

  const data = {
    type: "A",
    name,
    content: newIp,
    ttl: 120,
    proxied: false,
  };

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  const json = await response.json();
  if (!json.success) {
    throw new Error(json.errors?.[0]?.message || "Failed to update DNS record");
  }
  return res.status(200).json({
    message: `DNS record for ${domain} updated to ${newIp}`,
  });
}

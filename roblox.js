const API_BASE = "https://apis.roblox.com";
const USER_AGENT = "RobloxAssetDiscordBot/1.0";

function assertAssetId(assetId) {
  const value = String(assetId ?? "").trim();

  if (!/^\d{1,20}$/.test(value)) {
    throw new Error("Asset ID harus berupa angka Roblox yang valid.");
  }

  return value;
}

async function robloxFetch(url, options = {}) {
  const apiKey = process.env.ROBLOX_API_KEY;

  if (!apiKey) {
    throw new Error("ROBLOX_API_KEY belum diatur di .env");
  }

  const response = await fetch(url, {
    ...options,
    headers: {
      "x-api-key": apiKey,
      "User-Agent": USER_AGENT,
      ...(options.headers || {})
    }
  });

  return response;
}

export async function getAssetInfo(assetId) {
  const id = assertAssetId(assetId);

  const response = await robloxFetch(
    `${API_BASE}/assets/v1/assets/${encodeURIComponent(id)}`
  );

  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `Roblox metadata API ${response.status}: ${text.slice(0, 500)}`
    );
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Roblox mengembalikan metadata yang bukan JSON.");
  }

  return data;
}

export async function downloadAsset(assetId) {
  const id = assertAssetId(assetId);

  const response = await robloxFetch(
    `${API_BASE}/asset-delivery-api/v1/assetId/${encodeURIComponent(id)}`
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Roblox asset delivery API ${response.status}: ${text.slice(0, 500)}`
    );
  }

  const contentLength = Number(response.headers.get("content-length") || 0);
  const maxBytes = Number(process.env.MAX_FILE_MB || 8) * 1024 * 1024;

  if (contentLength && contentLength > maxBytes) {
    throw new Error(
      `File terlalu besar (${(contentLength / 1024 / 1024).toFixed(2)} MB).`
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  if (buffer.length > maxBytes) {
    throw new Error(
      `File terlalu besar (${(buffer.length / 1024 / 1024).toFixed(2)} MB).`
    );
  }

  return {
    id,
    buffer,
    contentType: response.headers.get("content-type") || "application/octet-stream",
    contentDisposition: response.headers.get("content-disposition") || ""
  };
}

export function safeFileName(name, fallback = "roblox-asset") {
  const clean = String(name || fallback)
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .trim()
    .slice(0, 80);

  return clean || fallback;
}

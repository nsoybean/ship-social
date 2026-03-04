function escapeXml(input) {
  return String(input || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function makeCard({ title, subtitle, version, primaryColor, logoUrl }) {
  const bg = primaryColor || "#1c8dff";
  const safeTitle = escapeXml(title || "New Release");
  const safeSubtitle = escapeXml(subtitle || "Ship -> approve -> publish");
  const safeVersion = escapeXml(version || "v1.0.0");
  const safeLogo = escapeXml(logoUrl || "");

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1200" height="630" viewBox="0 0 1200 630" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="mesh" x1="20" y1="20" x2="1180" y2="610" gradientUnits="userSpaceOnUse">
      <stop stop-color="${bg}"/>
      <stop offset="1" stop-color="#0e1422"/>
    </linearGradient>
    <filter id="blur" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="32"/>
    </filter>
  </defs>
  <rect width="1200" height="630" fill="url(#mesh)" />
  <circle cx="920" cy="70" r="190" fill="rgba(255,255,255,0.16)" filter="url(#blur)" />
  <circle cx="250" cy="540" r="200" fill="rgba(255,255,255,0.12)" filter="url(#blur)" />
  <rect x="64" y="64" width="1072" height="502" rx="28" fill="rgba(10,12,20,0.4)" stroke="rgba(255,255,255,0.35)"/>
  <text x="112" y="190" fill="#D7E7FF" font-family="'Space Grotesk', sans-serif" font-size="30" letter-spacing="3">SHIP -> SOCIAL</text>
  <text x="112" y="280" fill="#FFFFFF" font-family="'Space Grotesk', sans-serif" font-size="72" font-weight="700">${safeTitle}</text>
  <text x="112" y="340" fill="#D6DCE8" font-family="'IBM Plex Sans', sans-serif" font-size="34">${safeSubtitle}</text>
  <rect x="112" y="430" width="180" height="56" rx="28" fill="#0B1020" stroke="rgba(255,255,255,0.4)"/>
  <text x="144" y="466" fill="#F2F5FA" font-family="'IBM Plex Mono', monospace" font-size="24">${safeVersion}</text>
  <text x="942" y="540" fill="#F2F5FA" font-family="'IBM Plex Sans', sans-serif" font-size="24">${safeLogo ? `Logo: ${safeLogo}` : "Built in Public"}</text>
</svg>`;

  return {
    svg,
    dataUrl: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`
  };
}

module.exports = {
  makeCard
};

function formatPublishPreview(text) {
  return {
    copied: true,
    message: "X API credentials are not configured. Copied fallback payload is ready.",
    preview: text
  };
}

async function publishToX({ text, accessToken }) {
  if (!accessToken) {
    return {
      ok: false,
      mode: "copy_fallback",
      response: formatPublishPreview(text)
    };
  }

  const response = await fetch("https://api.twitter.com/2/tweets", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify({ text })
  });

  if (!response.ok) {
    const textBody = await response.text();
    return {
      ok: false,
      mode: "copy_fallback",
      response: {
        ...formatPublishPreview(text),
        warning: `X publish failed (${response.status}).`,
        details: textBody.slice(0, 200)
      }
    };
  }

  return {
    ok: true,
    mode: "x_api",
    response: await response.json()
  };
}

module.exports = {
  publishToX
};

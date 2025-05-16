import fetch from 'node-fetch';
const code = '';

async function refreshToken() {
  const newToken = await fetch(
    `https://accounts.zoho.com/oauth/v2/token?refresh_token=${process.env.REFRESH_TOKEN}&client_id=${process.env.ZOHO_CLIENT_ID}&client_secret=${process.env.ZOHO_CLIENT_SECRET}&grant_type=refresh_token`,
    {
      method: 'POST',
      hostname: 'www.zohoapis.com',
      port: null,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(),
    },
  );

  if (!newToken.ok)
    throw new Error(
      `Failed to fetch code from refresh Token Zoho: ${newToken.statusText}`,
    );
  return await newToken.json();
}
export default refreshToken;

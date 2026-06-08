import { PayOS } from '@payos/node';

export default async function handler(req: any, res: any) {
  // CORS configuration
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Initialize PayOS inside handler to avoid crash on missing env vars at startup
  const missingVars = [
    !process.env.PAYOS_CLIENT_ID && 'PAYOS_CLIENT_ID',
    !process.env.PAYOS_API_KEY && 'PAYOS_API_KEY',
    !process.env.PAYOS_CHECKSUM_KEY && 'PAYOS_CHECKSUM_KEY',
  ].filter(Boolean);

  if (missingVars.length > 0) {
    console.error('[PayOS Create] Missing environment variables:', missingVars);
    return res.status(500).json({ error: `Missing required environment variables: ${missingVars.join(', ')}` });
  }

  const payOS = new PayOS({
    clientId: process.env.PAYOS_CLIENT_ID!,
    apiKey: process.env.PAYOS_API_KEY!,
    checksumKey: process.env.PAYOS_CHECKSUM_KEY!,
  });

  try {
    const { orderCodeText, totalPrice } = req.body;

    if (!orderCodeText || !totalPrice) {
      return res.status(400).json({ error: 'Missing required parameters: orderCodeText and totalPrice' });
    }

    // Extract numerical digits from orderCodeText (e.g. DH000005 -> 5)
    const numericMatch = orderCodeText.match(/\d+/);
    if (!numericMatch) {
      return res.status(400).json({ error: 'Invalid orderCodeText format' });
    }
    const orderCode = parseInt(numericMatch[0], 10);

    const baseUrl = req.headers.origin || 'http://localhost:3000';
    const expiredAt = Math.floor(Date.now() / 1000) + 10 * 60; // Link expires in 10 minutes

    const paymentData = {
      orderCode,
      amount: Math.round(totalPrice),
      description: orderCodeText, // Exactly 8 characters (e.g. DH000012), compliant with the 9-char limit
      items: [
        {
          name: `UniDrink ${orderCodeText}`,
          quantity: 1,
          price: Math.round(totalPrice),
        }
      ],
      returnUrl: `${baseUrl}/track`,
      cancelUrl: `${baseUrl}/track`,
      expiredAt,
    };

    const paymentLink = await payOS.paymentRequests.create(paymentData);

    return res.status(200).json(paymentLink);
  } catch (error: any) {
    console.error('[PayOS Create] error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

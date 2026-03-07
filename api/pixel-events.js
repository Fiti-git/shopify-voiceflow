// ─────────────────────────────────────────
// CORS helper — must run on EVERY response
// ─────────────────────────────────────────
function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400'); // cache preflight 24h
}

// ─────────────────────────────────────────
// Build friendly sales pitch — text only
// ─────────────────────────────────────────
function buildSalesPitch(productTitle) {
  const pitches = [
    `Loving the look of "${productTitle}"? 😊 It's one of our most popular picks — customers who grab it always come back for more!`,
    `Hey! "${productTitle}" is a great choice 👌 Loads of our customers absolutely love it. Need any help deciding?`,
    `Still checking out "${productTitle}"? 😊 Honestly, it's one of those products that just sells itself — people can't get enough of it!`,
    `"${productTitle}" has been flying off the shelves lately 🔥 You've got great taste — want me to tell you more about it?`,
    `Good eye! "${productTitle}" is a customer favourite 💛 If you're on the fence, most people say they wish they'd bought it sooner!`
  ];

  return pitches[Math.floor(Math.random() * pitches.length)];
}

// ─────────────────────────────────────────
// Main Vercel handler
// ─────────────────────────────────────────
export default async function handler(req, res) {

  // ✅ CORS headers on every single response — including errors
  setCors(res);

  // ✅ Handle preflight OPTIONS request first — before anything else
  if (req.method === 'OPTIONS') {
    console.log('✅ Preflight OPTIONS request handled');
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  console.log('📥 Incoming request body:', JSON.stringify(req.body, null, 2));

  const { type, productTitle } = req.body || {};

  // Only handle idle trigger
  if (type !== 'idle_on_product') {
    console.log('⏭️  Skipped — event type was:', type);
    return res.status(200).json({ trigger: false });
  }

  // No product title? skip
  if (!productTitle) {
    console.log('⚠️  Skipped — no productTitle in request');
    return res.status(200).json({ trigger: false });
  }

  const message = buildSalesPitch(productTitle);

  console.log('✅ Product:', productTitle);
  console.log('💬 Message:', message);

  return res.status(200).json({
    trigger: true,
    message
  });
}
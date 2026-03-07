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

export default function handler(req, res) {
  // ✅ CORS — set on every single response, no exceptions
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // ✅ Preflight — browser sends this first, must return 200 immediately
  if (req.method === 'OPTIONS') {
    console.log('✅ OPTIONS preflight handled');
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  console.log('📥 Body:', JSON.stringify(req.body));

  const { type, productTitle } = req.body || {};

  if (type !== 'idle_on_product' || !productTitle) {
    console.log('⏭️ Skipped — type:', type, '| title:', productTitle);
    return res.status(200).json({ trigger: false });
  }

  const message = buildSalesPitch(productTitle);

  console.log('✅ Product:', productTitle);
  console.log('💬 Message:', message);

  return res.status(200).json({ trigger: true, message });
}
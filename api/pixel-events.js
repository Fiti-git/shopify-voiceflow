import fetch from 'node-fetch';

// ─────────────────────────────────────────
// Shopify: fetch product details (stock + tags)
// ─────────────────────────────────────────
async function getProductDetails(productId) {
  try {
    // Strip Shopify GID prefix if needed: "gid://shopify/Product/12345" → "12345"
    const numericId = String(productId).split('/').pop();

    const res = await fetch(
      `https://${process.env.SHOPIFY_STORE}/admin/api/2026-01/products/${numericId}.json`,
      { headers: { 'X-Shopify-Access-Token': process.env.SHOPIFY_TOKEN } }
    );
    const data = await res.json();
    const product = data.product;
    if (!product) return { stock: 99, tags: [] };

    const stock = product.variants.reduce(
      (sum, v) => sum + (v.inventory_quantity || 0), 0
    );
    const tags = product.tags
      ? product.tags.split(',').map(t => t.trim().toLowerCase())
      : [];

    return { stock, tags };
  } catch (e) {
    return { stock: 99, tags: [] };
  }
}

// ─────────────────────────────────────────
// Shopify: fetch recommended products by category
// ─────────────────────────────────────────
async function getRecommendations(category) {
  try {
    const res = await fetch(
      `https://${process.env.SHOPIFY_STORE}/admin/api/2026-01/products.json?product_type=${encodeURIComponent(category)}&limit=3&status=active`,
      { headers: { 'X-Shopify-Access-Token': process.env.SHOPIFY_TOKEN } }
    );
    const data = await res.json();

    if (data.products && data.products.length > 0) {
      return data.products.map(p => ({
        title: p.title,
        url: `https://${process.env.SHOPIFY_STORE}/products/${p.handle}`,
        price: p.variants[0] ? `$${p.variants[0].price}` : 'N/A',
        image: p.images[0] ? p.images[0].src : null
      }));
    }
  } catch (e) {}

  // Fallback: any 3 active products
  try {
    const res = await fetch(
      `https://${process.env.SHOPIFY_STORE}/admin/api/2026-01/products.json?limit=3&status=active`,
      { headers: { 'X-Shopify-Access-Token': process.env.SHOPIFY_TOKEN } }
    );
    const data = await res.json();
    return (data.products || []).map(p => ({
      title: p.title,
      url: `https://${process.env.SHOPIFY_STORE}/products/${p.handle}`,
      price: p.variants[0] ? `$${p.variants[0].price}` : 'N/A',
      image: p.images[0] ? p.images[0].src : null
    }));
  } catch (e) {
    return [];
  }
}

// ─────────────────────────────────────────
// Build friendly + casual sales message
// ─────────────────────────────────────────
function buildMessage(type, productTitle, stock, tags) {
  // Urgency line based on stock
  let urgency = '';
  if (stock <= 3)       urgency = `⚠️ Only ${stock} left — grab it before it's gone!`;
  else if (stock <= 10) urgency = `🔥 Almost sold out, just so you know!`;

  // Social proof based on tags
  let proof = '';
  if (tags.includes('best-seller'))  proof = "This one's a customer favourite 💛";
  else if (tags.includes('staff-pick'))   proof = "Our team absolutely loves this one 👌";
  else if (tags.includes('trending'))     proof = "This is trending right now 🚀";
  else if (tags.includes('new-arrival'))  proof = "Just dropped and people are already obsessed 🎉";

  // Message per trigger type
  if (type === 'idle_on_product') {
    const base = proof
      ? `Hey! ${proof} ${urgency}`
      : `Hey, still checking out "${productTitle}"? 😊 ${urgency}`;
    return `${base} Here are some things others loved with it 👇`.trim();
  }

  if (type === 'cart_abandoned') {
    const base = proof
      ? `Psst — "${productTitle}" is still in your cart! ${proof} ${urgency}`
      : `Hey, don't forget about "${productTitle}" in your cart! 😊 ${urgency}`;
    return `${base} You might also like these 👇`.trim();
  }

  return `Here are some picks we think you'll love 😊`;
}

// ─────────────────────────────────────────
// Main Vercel handler
// ─────────────────────────────────────────
export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');

  const { type, productId, productTitle, category } = req.body;

  // Only handle our two triggers
  if (!['idle_on_product', 'cart_abandoned'].includes(type)) {
    return res.status(200).json({ trigger: false });
  }

  // Fetch product details + recommendations in parallel
  const [{ stock, tags }, recommendations] = await Promise.all([
    getProductDetails(productId),
    getRecommendations(category)
  ]);

  const message = buildMessage(type, productTitle, stock, tags);

  return res.status(200).json({
    trigger: true,
    message,
    recommendations: recommendations.slice(0, 3)
  });
}
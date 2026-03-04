import fetch from 'node-fetch';

async function getRecommendations(productId, category) {
  // Try same category first
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
        price: p.variants[0] ? p.variants[0].price : '0.00',
        image: p.images[0] ? p.images[0].src : null
      }));
    }
  } catch (e) {}

  // Fallback: any 3 products
  try {
    const res = await fetch(
      `https://${process.env.SHOPIFY_STORE}/admin/api/2026-01/products.json?limit=3&status=active`,
      { headers: { 'X-Shopify-Access-Token': process.env.SHOPIFY_TOKEN } }
    );
    const data = await res.json();
    return (data.products || []).map(p => ({
      title: p.title,
      url: `https://${process.env.SHOPIFY_STORE}/products/${p.handle}`,
      price: p.variants[0] ? p.variants[0].price : '0.00',
      image: p.images[0] ? p.images[0].src : null
    }));
  } catch (e) {
    return [];
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');

  const { type, clientId, productId, productTitle, category, productIds, categories } = req.body;
  let message = '';
  let recs = [];

  switch (type) {
    case 'product_viewed_repeat':
      recs = await getRecommendations(productId, category);
      message = 'Still loving "' + productTitle + '"? Customers who viewed this also liked these!';
      break;
    case 'browsed_multiple_products':
      recs = await getRecommendations(productIds[0], categories[0]);
      message = 'Based on your browsing, we think you will love these picks!';
      break;
    case 'category_interest':
      recs = await getRecommendations(productId, category);
      message = 'You seem to love ' + category + '! Here are our top picks';
      break;
    case 'idle_on_product':
      recs = await getRecommendations(productId, category);
      message = 'Need help deciding? Here is what others paired with "' + productTitle + '"';
      break;
    case 'cart_abandoned':
      recs = await getRecommendations(productId, category);
      message = 'Still thinking about "' + productTitle + '"? People also grabbed these!';
      break;
    default:
      return res.status(200).send('OK');
  }

  const r = recs || [];

  // Return payload for the widget to use directly
  res.status(200).json({
  trigger: true,
  message,
  recommendations: r.slice(0, 3)
});
}

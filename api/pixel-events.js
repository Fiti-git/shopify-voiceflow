const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));

async function getRecommendations(productId, category) {
  try {
    const res = await fetch(
      `https://${process.env.SHOPIFY_STORE}/recommendations/products.json?product_id=${productId}&limit=3`
    );
    const data = await res.json();
    if (data.products && data.products.length) {
      return data.products.map(p => ({
        title: p.title,
        url: `https://${process.env.SHOPIFY_STORE}/products/${p.handle}`,
        price: p.variants[0] ? p.variants[0].price : '0.00'
      }));
    }
  } catch (e) {}

  try {
    const res = await fetch(
      `https://${process.env.SHOPIFY_STORE}/admin/api/2026-01/products.json?product_type=${encodeURIComponent(category)}&limit=3`,
      { headers: { 'X-Shopify-Access-Token': process.env.SHOPIFY_TOKEN } }
    );
    const data = await res.json();
    return (data.products || []).map(p => ({
      title: p.title,
      url: `https://${process.env.SHOPIFY_STORE}/products/${p.handle}`,
      price: p.variants[0] ? p.variants[0].price : '0.00'
    }));
  } catch (e) {
    return [];
  }
}

async function triggerVoiceflow(userId, message, recs) {
  const r = recs || [];
  await fetch(
    `https://general-runtime.voiceflow.com/state/user/${encodeURIComponent(userId)}/interact`,
    {
      method: 'POST',
      headers: {
        'Authorization': process.env.VOICEFLOW_API_KEY,
        'Content-Type': 'application/json',
        'versionID': 'production'
      },
      body: JSON.stringify({
        action: {
          type: 'launch',
          payload: {
            variables: {
              message: message,
              rec1_title: r[0] ? r[0].title : '',
              rec1_price: r[0] ? r[0].price : '',
              rec1_url:   r[0] ? r[0].url : '',
              rec2_title: r[1] ? r[1].title : '',
              rec2_price: r[1] ? r[1].price : '',
              rec2_url:   r[1] ? r[1].url : '',
              rec3_title: r[2] ? r[2].title : '',
              rec3_price: r[2] ? r[2].price : '',
              rec3_url:   r[2] ? r[2].url : ''
            }
          }
        }
      })
    }
  );
}

export default async function handler(req, res) {
  // Allow CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

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
  }

  if (message) await triggerVoiceflow(clientId || 'anonymous', message, recs);
  res.status(200).send('OK');
}

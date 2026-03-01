import fetch from 'node-fetch';

async function getRecommendations(productId, category) {
  let debugInfo = { productId, category, step1: null, step2: null };

  // Step 1 — Shopify recommendations
  try {
    const url = `https://${process.env.SHOPIFY_STORE}/recommendations/products.json?product_id=${productId}&limit=3`;
    const res = await fetch(url);
    const data = await res.json();
    debugInfo.step1 = { status: res.status, productCount: data.products?.length, url };
    if (data.products && data.products.length) {
      return { products: data.products.map(p => ({
        title: p.title,
        url: `https://${process.env.SHOPIFY_STORE}/products/${p.handle}`,
        price: p.variants[0] ? p.variants[0].price : '0.00'
      })), debug: debugInfo };
    }
  } catch (e) {
    debugInfo.step1 = { error: e.message };
  }

  // Step 2 — Admin API fallback by category
  try {
    const url = `https://${process.env.SHOPIFY_STORE}/admin/api/2026-01/products.json?product_type=${encodeURIComponent(category)}&limit=3&status=active`;
    const res = await fetch(url, {
      headers: { 'X-Shopify-Access-Token': process.env.SHOPIFY_TOKEN }
    });
    const data = await res.json();
    debugInfo.step2 = { status: res.status, productCount: data.products?.length, category, url };

    if (data.products && data.products.length) {
      return { products: data.products.map(p => ({
        title: p.title,
        url: `https://${process.env.SHOPIFY_STORE}/products/${p.handle}`,
        price: p.variants[0] ? p.variants[0].price : '0.00'
      })), debug: debugInfo };
    }
  } catch (e) {
    debugInfo.step2 = { error: e.message };
  }

  // Step 3 — Last resort: just get any 3 products
  try {
    const url = `https://${process.env.SHOPIFY_STORE}/admin/api/2026-01/products.json?limit=3&status=active`;
    const res = await fetch(url, {
      headers: { 'X-Shopify-Access-Token': process.env.SHOPIFY_TOKEN }
    });
    const data = await res.json();
    debugInfo.step3 = { status: res.status, productCount: data.products?.length };

    if (data.products && data.products.length) {
      return { products: data.products.map(p => ({
        title: p.title,
        url: `https://${process.env.SHOPIFY_STORE}/products/${p.handle}`,
        price: p.variants[0] ? p.variants[0].price : '0.00'
      })), debug: debugInfo };
    }
  } catch (e) {
    debugInfo.step3 = { error: e.message };
  }

  return { products: [], debug: debugInfo };
}

async function triggerVoiceflow(userId, message, recs) {
  const r = recs || [];
  const variables = {
    message: message,
    rec1_title: r[0] ? r[0].title : 'No recommendation',
    rec1_price: r[0] ? r[0].price : '0.00',
    rec1_url:   r[0] ? r[0].url : '#',
    rec2_title: r[1] ? r[1].title : 'No recommendation',
    rec2_price: r[1] ? r[1].price : '0.00',
    rec2_url:   r[1] ? r[1].url : '#',
    rec3_title: r[2] ? r[2].title : 'No recommendation',
    rec3_price: r[2] ? r[2].price : '0.00',
    rec3_url:   r[2] ? r[2].url : '#'
  };

  const varRes = await fetch(
    `https://general-runtime.voiceflow.com/state/user/${encodeURIComponent(userId)}/variables`,
    {
      method: 'PATCH',
      headers: {
        'Authorization': process.env.VOICEFLOW_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(variables)
    }
  );

  const launchRes = await fetch(
    `https://general-runtime.voiceflow.com/state/user/${encodeURIComponent(userId)}/interact`,
    {
      method: 'POST',
      headers: {
        'Authorization': process.env.VOICEFLOW_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ action: { type: 'launch' } })
    }
  );

  return {
    variables,
    varStatus: varRes.status,
    launchStatus: launchRes.status
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');

  const { type, clientId, productId, productTitle, category, productIds, categories } = req.body;
  let message = '';
  let recResult = { products: [], debug: {} };

  switch (type) {
    case 'product_viewed_repeat':
      recResult = await getRecommendations(productId, category);
      message = 'Still loving "' + productTitle + '"? Customers who viewed this also liked these!';
      break;
    case 'browsed_multiple_products':
      recResult = await getRecommendations(productIds[0], categories[0]);
      message = 'Based on your browsing, we think you will love these picks!';
      break;
    case 'category_interest':
      recResult = await getRecommendations(productId, category);
      message = 'You seem to love ' + category + '! Here are our top picks';
      break;
    case 'idle_on_product':
      recResult = await getRecommendations(productId, category);
      message = 'Need help deciding? Here is what others paired with "' + productTitle + '"';
      break;
    case 'cart_abandoned':
      recResult = await getRecommendations(productId, category);
      message = 'Still thinking about "' + productTitle + '"? People also grabbed these!';
      break;
    default:
      return res.status(200).json({ error: 'Unknown event: ' + type });
  }

  let vfResult = null;
  if (message) vfResult = await triggerVoiceflow(clientId || 'anonymous', message, recResult.products);

  res.status(200).json({
    success: true,
    message,
    recommendations: recResult.products,
    shopifyDebug: recResult.debug,
    voiceflow: vfResult
  });
}

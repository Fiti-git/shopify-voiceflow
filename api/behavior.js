/**
 * ============================================================
 *  API HANDLER — /api/behavior
 *  Deploy on Vercel (Next.js) — handles ALL behavior types
 *  and maps each to a Voiceflow-ready response
 * ============================================================
 */

// ─────────────────────────────────────────────
//  MESSAGE BANKS — randomised per behavior
// ─────────────────────────────────────────────

const MESSAGES = {

  idle_on_product: (p) => [
    `Loving the look of "${p.productTitle}"? 😊 It's one of our most popular picks — customers always come back for more!`,
    `Still checking out "${p.productTitle}"? 🔥 Honestly, it just sells itself — want me to tell you more?`,
    `Good eye! "${p.productTitle}" is a customer favourite 💛 Most people say they wish they'd bought it sooner!`,
    `"${p.productTitle}" has been flying off the shelves lately 👀 You've got great taste!`,
  ],

  exit_intent: (p) => {
    if (p.cartValue > 0) return [
      `Wait! You've got $${p.cartValue} worth of great stuff in your cart 🛒 Want 10% off to seal the deal?`,
      `Don't go yet! Your cart is waiting 😊 I can help you grab a discount before you leave!`,
    ];
    return [
      `Heading off already? 👋 I can help you find exactly what you're looking for — just ask!`,
      `Before you go — anything I can help you find today? 😊`,
    ];
  },

  cart_abandonment: (p) => [
    `Hey! You left ${p.itemCount} item(s) worth $${p.cartValue} behind 😢 Still interested?`,
    `Your cart is getting lonely 🛒 ${p.itemCount} item(s) are waiting for you — want me to help you check out?`,
    `Just a nudge — you've got $${p.cartValue} in your cart! Ready to complete your order? 😊`,
  ],

  repeated_product_visit: (p) => [
    `You keep coming back to "${p.productTitle}" 👀 Maybe it's meant to be?`,
    `Still thinking about "${p.productTitle}"? 😊 You've checked it out ${p.visitCount} times — that's a sign!`,
    `"${p.productTitle}" must really be calling your name 💛 Want me to tell you more about it?`,
  ],

  review_scroll: (p) => [
    `Checking the reviews on "${p.productTitle}"? ⭐⭐⭐⭐⭐ Customers absolutely love it — hard to argue!`,
    `Reading the reviews? 😊 Our customers rave about "${p.productTitle}" — any questions I can answer?`,
  ],

  variant_switching: (p) => [
    `Can't decide on the right option for "${p.productTitle}"? 🤔 I can help you pick the best one!`,
    `Torn between variants? 😊 Tell me what you're looking for and I'll point you in the right direction!`,
  ],

  full_gallery_viewed: (p) => [
    `Looks like you've checked out all the photos of "${p.productTitle}" 📸 Want to know more about it?`,
    `You've seen every angle of "${p.productTitle}" — love the thoroughness! 😊 Any questions?`,
  ],

  session_duration: (p) => {
    if (p.seconds >= 300) return [
      `You've been browsing for a while 😊 Can't find what you're looking for? I'm here to help!`,
      `Still exploring? 🛍️ Let me know if you'd like some personalised recommendations!`,
    ];
    if (p.seconds >= 180) return [
      `Finding everything okay? 😊 I'm here if you need any help!`,
    ];
    return []; // Don't trigger at 1 min
  },

  first_visit: (p) => [
    `Welcome! 👋 First time here? I'm here to help you find exactly what you need!`,
    `Hey there! 😊 Welcome to our store — let me know if you need any help finding something!`,
  ],

  returning_visitor: (p) => [
    `Welcome back! 😊 Great to see you again — anything I can help you find today?`,
    `Hey, you're back! 👋 Anything catch your eye last time that you'd like to come back to?`,
  ],

};

function pick(arr) {
  if (!arr || arr.length === 0) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

// ─────────────────────────────────────────────
//  VOICEFLOW ACTION MAPPING
//  Each behavior maps to a Voiceflow intent/action
// ─────────────────────────────────────────────

const VF_ACTIONS = {
  idle_on_product:       { intent: 'product_enquiry',     label: 'Tell me more' },
  exit_intent:           { intent: 'offer_discount',       label: 'Get 10% off' },
  cart_abandonment:      { intent: 'cart_recovery',        label: 'Complete order' },
  repeated_product_visit:{ intent: 'product_enquiry',     label: 'Help me decide' },
  review_scroll:         { intent: 'show_reviews',         label: 'See top reviews' },
  variant_switching:     { intent: 'variant_help',         label: 'Help me choose' },
  full_gallery_viewed:   { intent: 'product_enquiry',     label: 'Learn more' },
  session_duration:      { intent: 'browsing_help',        label: 'Get recommendations' },
  first_visit:           { intent: 'welcome_flow',         label: 'Show me around' },
  returning_visitor:     { intent: 'returning_user_flow',  label: 'See what\'s new' },
};

// ─────────────────────────────────────────────
//  HANDLER MAP
// ─────────────────────────────────────────────

function handleEvent(type, payload) {
  const messageFn = MESSAGES[type];
  if (!messageFn) return { trigger: false, reason: 'unknown_type' };

  const messages = messageFn(payload);
  const message = pick(messages);

  if (!message) return { trigger: false, reason: 'no_message_for_payload' };

  const action = VF_ACTIONS[type] || null;

  return {
    trigger: true,
    message,
    action,
    voiceflow: {
      // These fields tell your Voiceflow widget exactly what to do
      intent: action?.intent,
      variables: {
        behavior_type: type,
        product_title: payload.productTitle || null,
        cart_value: payload.cartValue || null,
        item_count: payload.itemCount || null,
        visit_count: payload.visitCount || null,
        session_seconds: payload.seconds || null,
      },
    },
  };
}

// ─────────────────────────────────────────────
//  NEXT.JS EXPORT
// ─────────────────────────────────────────────

module.exports = function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { type, sessionId, ...payload } = req.body || {};

  console.log(`📥 [${type}] session=${sessionId}`, JSON.stringify(payload));

  if (!type) {
    return res.status(400).json({ error: 'Missing type' });
  }

  const result = handleEvent(type, payload);
  console.log(`📤 trigger=${result.trigger} | message=${result.message || '—'}`);

  return res.status(200).json(result);
}

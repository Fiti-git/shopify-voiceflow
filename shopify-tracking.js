/**
 * ============================================================
 *  SHOPIFY CUSTOM BEHAVIOR TRACKER → VOICEFLOW INTEGRATION
 *  Drop this into Shopify Admin > Themes > Edit Code > theme.liquid
 *  Place just before </body>
 * ============================================================
 */

(function () {
  // ─────────────────────────────────────────────
  //  CONFIG — update these values
  // ─────────────────────────────────────────────
  const CONFIG = {
    apiEndpoint: 'https://YOUR_VERCEL_API/api/behavior',   // your Next.js handler
    voiceflowProjectID: 'YOUR_VF_PROJECT_ID',              // from Voiceflow dashboard
    voiceflowApiKey: 'YOUR_VF_API_KEY',                    // from Voiceflow dashboard
    idleThreshold: 8000,          // ms before "idle on product" fires
    cartAbandonThreshold: 120000, // ms — 2 mins idle with items in cart
    sessionKey: 'vf_session_id',
    debug: false,
  };

  // ─────────────────────────────────────────────
  //  SESSION — persistent across page loads
  // ─────────────────────────────────────────────
  function getSessionId() {
    let id = sessionStorage.getItem(CONFIG.sessionKey);
    if (!id) {
      id = 'vf_' + Math.random().toString(36).slice(2) + Date.now();
      sessionStorage.setItem(CONFIG.sessionKey, id);
    }
    return id;
  }

  function getVisitCount(productHandle) {
    const key = 'vc_' + productHandle;
    const count = parseInt(sessionStorage.getItem(key) || '0') + 1;
    sessionStorage.setItem(key, count);
    return count;
  }

  // ─────────────────────────────────────────────
  //  CORE — send event to your API → Voiceflow
  // ─────────────────────────────────────────────
  async function sendBehaviorEvent(type, payload = {}) {
    if (CONFIG.debug) console.log('[VF Tracker]', type, payload);

    try {
      const res = await fetch(CONFIG.apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, sessionId: getSessionId(), ...payload }),
      });

      const data = await res.json();

      if (data.trigger && data.message) {
        triggerVoiceflow(data.message, data.action);
      }
    } catch (err) {
      if (CONFIG.debug) console.error('[VF Tracker] Error:', err);
    }
  }

  // ─────────────────────────────────────────────
  //  VOICEFLOW — open chat & send a message
  // ─────────────────────────────────────────────
  function triggerVoiceflow(message, action) {
    if (typeof window.voiceflow === 'undefined') return;

    // Open the chat widget
    window.voiceflow.chat.open();

    // Send the proactive message
    window.voiceflow.chat.interact({
      type: 'launch',
      payload: {
        message,
        action: action || null,
      },
    });
  }

  // ─────────────────────────────────────────────
  //  TRACKER 1 — IDLE ON PRODUCT PAGE
  // ─────────────────────────────────────────────
  function trackIdleOnProduct() {
    if (!window.ShopifyAnalytics?.meta?.product) return;

    const product = window.ShopifyAnalytics.meta.product;
    let idleTimer;

    const resetTimer = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        sendBehaviorEvent('idle_on_product', {
          productTitle: product.title,
          productHandle: product.handle,
          productPrice: product.price,
        });
      }, CONFIG.idleThreshold);
    };

    ['mousemove', 'keydown', 'scroll', 'touchstart'].forEach(e =>
      document.addEventListener(e, resetTimer, { passive: true })
    );

    resetTimer(); // start immediately
  }

  // ─────────────────────────────────────────────
  //  TRACKER 2 — EXIT INTENT
  // ─────────────────────────────────────────────
  function trackExitIntent() {
    let fired = false;

    document.addEventListener('mouseleave', (e) => {
      if (e.clientY <= 0 && !fired) {
        fired = true;
        const cartValue = getCartValue();
        const page = getPageType();

        sendBehaviorEvent('exit_intent', {
          cartValue,
          page,
          productTitle: getCurrentProductTitle(),
        });
      }
    });
  }

  // ─────────────────────────────────────────────
  //  TRACKER 3 — CART ABANDONMENT
  // ─────────────────────────────────────────────
  function trackCartAbandonment() {
    let timer;

    function checkCart() {
      fetch('/cart.js')
        .then(r => r.json())
        .then(cart => {
          clearTimeout(timer);
          if (cart.item_count > 0) {
            timer = setTimeout(() => {
              sendBehaviorEvent('cart_abandonment', {
                cartValue: (cart.total_price / 100).toFixed(2),
                itemCount: cart.item_count,
                items: cart.items.map(i => i.title),
              });
            }, CONFIG.cartAbandonThreshold);
          }
        });
    }

    // Check on load + listen for cart updates
    checkCart();
    document.addEventListener('cart:updated', checkCart);

    // Also intercept add-to-cart forms
    document.querySelectorAll('form[action="/cart/add"]').forEach(form => {
      form.addEventListener('submit', () => setTimeout(checkCart, 1000));
    });
  }

  // ─────────────────────────────────────────────
  //  TRACKER 4 — REPEATED PRODUCT VISITS
  // ─────────────────────────────────────────────
  function trackRepeatedVisits() {
    const product = window.ShopifyAnalytics?.meta?.product;
    if (!product) return;

    const count = getVisitCount(product.handle);

    if (count >= 2) {
      sendBehaviorEvent('repeated_product_visit', {
        productTitle: product.title,
        productHandle: product.handle,
        visitCount: count,
      });
    }
  }

  // ─────────────────────────────────────────────
  //  TRACKER 5 — REVIEW SECTION SCROLL
  // ─────────────────────────────────────────────
  function trackReviewScroll() {
    const reviewSelectors = [
      '#reviews', '#shopify-product-reviews',
      '.reviews', '.product-reviews',
      '[data-reviews]', '.judge-me-widget',
      '.stamped-reviews', '.yotpo',
    ];

    const reviewSection = reviewSelectors
      .map(s => document.querySelector(s))
      .find(Boolean);

    if (!reviewSection) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          observer.disconnect();
          sendBehaviorEvent('review_scroll', {
            productTitle: getCurrentProductTitle(),
          });
        }
      });
    }, { threshold: 0.3 });

    observer.observe(reviewSection);
  }

  // ─────────────────────────────────────────────
  //  TRACKER 6 — VARIANT SWITCHING
  // ─────────────────────────────────────────────
  function trackVariantSwitching() {
    const product = window.ShopifyAnalytics?.meta?.product;
    if (!product) return;

    let switchCount = 0;

    document.querySelectorAll('select[name="id"], input[name="id"]').forEach(el => {
      el.addEventListener('change', () => {
        switchCount++;
        if (switchCount >= 3) {
          sendBehaviorEvent('variant_switching', {
            productTitle: product.title,
            switchCount,
          });
          switchCount = 0; // reset to avoid spam
        }
      });
    });
  }

  // ─────────────────────────────────────────────
  //  TRACKER 7 — IMAGE GALLERY SWIPE
  // ─────────────────────────────────────────────
  function trackImageGallery() {
    const product = window.ShopifyAnalytics?.meta?.product;
    if (!product) return;

    let viewedImages = new Set();
    const totalImages = product.images?.length || 0;

    const imgObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          viewedImages.add(entry.target.src);
          if (totalImages > 1 && viewedImages.size >= totalImages) {
            sendBehaviorEvent('full_gallery_viewed', {
              productTitle: product.title,
              imageCount: totalImages,
            });
            imgObserver.disconnect();
          }
        }
      });
    });

    document.querySelectorAll('.product__media img, .product-gallery img').forEach(img => {
      imgObserver.observe(img);
    });
  }

  // ─────────────────────────────────────────────
  //  TRACKER 8 — SESSION DURATION MILESTONE
  // ─────────────────────────────────────────────
  function trackSessionDuration() {
    const milestones = [60000, 180000, 300000]; // 1m, 3m, 5m
    let fired = new Set();

    milestones.forEach(ms => {
      setTimeout(() => {
        if (!fired.has(ms)) {
          fired.add(ms);
          sendBehaviorEvent('session_duration', {
            seconds: ms / 1000,
            page: getPageType(),
            cartValue: getCartValue(),
          });
        }
      }, ms);
    });
  }

  // ─────────────────────────────────────────────
  //  TRACKER 9 — FIRST VISIT
  // ─────────────────────────────────────────────
  function trackFirstVisit() {
    const key = 'vf_visited';
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, Date.now());
      sendBehaviorEvent('first_visit', {
        referrer: document.referrer,
        landingPage: window.location.pathname,
      });
    }
  }

  // ─────────────────────────────────────────────
  //  TRACKER 10 — RETURNING VISITOR
  // ─────────────────────────────────────────────
  function trackReturningVisitor() {
    const key = 'vf_last_visit';
    const lastVisit = localStorage.getItem(key);
    const now = Date.now();

    if (lastVisit) {
      const hoursSince = (now - parseInt(lastVisit)) / 3600000;
      if (hoursSince < 48) {
        sendBehaviorEvent('returning_visitor', {
          hoursSince: Math.round(hoursSince),
          page: getPageType(),
        });
      }
    }

    localStorage.setItem(key, now);
  }

  // ─────────────────────────────────────────────
  //  HELPERS
  // ─────────────────────────────────────────────
  function getPageType() {
    const path = window.location.pathname;
    if (path.includes('/products/')) return 'product';
    if (path.includes('/collections/')) return 'collection';
    if (path.includes('/cart')) return 'cart';
    if (path.includes('/checkout')) return 'checkout';
    if (path === '/') return 'home';
    return 'other';
  }

  function getCurrentProductTitle() {
    return window.ShopifyAnalytics?.meta?.product?.title || null;
  }

  function getCartValue() {
    // Read from Shopify's global cart if available
    return window.ShopifyAnalytics?.meta?.page?.cartSubtotal || 0;
  }

  // ─────────────────────────────────────────────
  //  INIT — wire up all trackers based on page
  // ─────────────────────────────────────────────
  function init() {
    const page = getPageType();

    // Global trackers (all pages)
    trackFirstVisit();
    trackReturningVisitor();
    trackExitIntent();
    trackSessionDuration();

    // Product page only
    if (page === 'product') {
      trackIdleOnProduct();
      trackRepeatedVisits();
      trackReviewScroll();
      trackVariantSwitching();
      trackImageGallery();
    }

    // Cart abandonment — all pages except checkout
    if (page !== 'checkout') {
      trackCartAbandonment();
    }
  }

  // Wait for DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();

/*
  KNR — cart rewards (free samples + free product) for the gamified cart drawer.

  - Rules come from Theme settings → "KNR · Récompenses panier", printed as JSON by
    snippets/knr-cart-rewards-config.liquid. Nothing is hardcoded here.
  - The drawer UI (progress bar, messages, slots, picker) is rendered in Liquid, so this
    file never computes display state: it only (1) enforces the rules on the real cart and
    (2) drives the sample picker, then asks Shopify to re-render the drawer.
  - Every cart mutation goes through one promise queue: rapid clicks can't interleave.
  - Loaded with `defer`; listens to Dawn's PUB_SUB_EVENTS.cartUpdate.
*/
(() => {
  const configEl = document.getElementById('KnrCartRewardsConfig');
  if (!configEl) return;

  let config;
  try {
    config = JSON.parse(configEl.textContent);
  } catch (error) {
    console.error('[knr-rewards] invalid config', error);
    return;
  }
  if (!config.enabled) return;

  const SOURCE = 'knr-rewards';
  const DECLINED = '_knr_gift_declined';
  const sampleIds = new Set((config.sampleVariantIds || []).map(String));

  const isSample = (item) => item.properties?._knr_reward === 'sample' || sampleIds.has(String(item.variant_id));
  const isGift = (item) => Boolean(config.giftProductId) && item.product_id === config.giftProductId;
  const rewardsSubtotal = (cart) =>
    cart.items.filter((item) => !isSample(item) && !isGift(item)).reduce((sum, item) => sum + item.final_line_price, 0);

  /* ---------- Cart API ---------- */

  const post = (url, body) =>
    fetch(url, { ...fetchConfig('json'), body: JSON.stringify(body) }).then((response) => {
      if (!response.ok) throw new Error(`${url} ${response.status}`);
      return response.json();
    });
  const getCart = () => fetch(`${routes.cart_url}.js`, { headers: { Accept: 'application/json' } }).then((r) => r.json());
  const updateCart = (body) => post(`${routes.cart_update_url}.js`, body);
  const addToCart = (items) => post(`${routes.cart_add_url}.js`, { items });

  let queue = Promise.resolve();
  const enqueue = (task) => {
    queue = queue
      .then(() => setBusy(true))
      .then(task)
      .catch((error) => console.error('[knr-rewards]', error))
      .finally(() => setBusy(false));
    return queue;
  };

  const drawer = () => document.querySelector('cart-drawer');
  const setBusy = (busy) => drawer()?.classList.toggle('knr-is-busy', busy);

  /* ---------- Rules ---------- */

  // Returns the minimal set of changes needed to make the cart respect the rules.
  function plan(cart) {
    const { samples: samplesThreshold, gift: giftThreshold } = config.thresholds;
    const subtotal = rewardsSubtotal(cart);
    const updates = {};
    const attributes = {};
    const add = [];

    // Samples: 0 below the threshold, up to `samplesMax` above it, quantity 1 each.
    const allowed = subtotal >= samplesThreshold ? config.samplesMax : 0;
    let kept = 0;
    cart.items.filter(isSample).forEach((item) => {
      const quantity = Math.max(0, Math.min(1, allowed - kept));
      kept += quantity;
      if (quantity !== item.quantity) updates[item.key] = quantity;
    });

    // Free product: added automatically above the threshold (unless the customer removed it),
    // removed below it. Quantity is always 1.
    const giftLines = cart.items.filter(isGift);
    const declined = cart.attributes?.[DECLINED] === '1';
    const eligible = subtotal >= giftThreshold && Boolean(config.giftVariantId);

    if (eligible) {
      giftLines.forEach((item, index) => {
        const quantity = index === 0 ? 1 : 0;
        if (item.quantity !== quantity) updates[item.key] = quantity;
      });
      if (!giftLines.length && !declined) {
        add.push({ id: config.giftVariantId, quantity: 1, properties: { _knr_reward: 'gift' } });
      }
    } else {
      giftLines.forEach((item) => (updates[item.key] = 0));
      if (declined) attributes[DECLINED] = ''; // reset once the customer drops below the threshold
    }

    return { updates, attributes, add };
  }

  async function apply({ updates, attributes, add }) {
    let changed = false;
    if (Object.keys(updates).length || Object.keys(attributes).length) {
      await updateCart({ updates, attributes });
      changed = true;
    }
    if (add.length) {
      try {
        await addToCart(add);
        changed = true;
      } catch (error) {
        console.warn('[knr-rewards] gift could not be added (out of stock?)', error);
      }
    }
    return changed;
  }

  /* ---------- Rendering ---------- */

  // Incremented on every cart update made by Dawn (add to cart, quantity, remove).
  let cartEvents = 0;

  // Re-render the drawer + header cart icon from Shopify (Section Rendering API).
  async function refresh() {
    const startedAt = cartEvents;
    const sections = await fetch(`${routes.cart_url}?sections=cart-drawer,cart-icon-bubble`).then((r) => r.json());
    // A newer cart update happened while we were fetching: its render is fresher than ours.
    if (startedAt !== cartEvents) return;
    const doc = (html) => new DOMParser().parseFromString(html, 'text/html');

    const drawerEl = drawer();
    if (drawerEl && sections['cart-drawer']) {
      const source = doc(sections['cart-drawer']);
      const target = drawerEl.querySelector('.drawer__inner');
      const next = source.querySelector('.drawer__inner');
      if (target && next) target.innerHTML = next.innerHTML;
      drawerEl.classList.toggle('is-empty', Boolean(source.querySelector('cart-drawer.is-empty')));
    }

    const bubble = document.getElementById('cart-icon-bubble');
    if (bubble && sections['cart-icon-bubble']) {
      bubble.innerHTML = doc(sections['cart-icon-bubble']).querySelector('.shopify-section')?.innerHTML ?? bubble.innerHTML;
    }

    // Cart page (if the customer is on /cart): let Dawn's <cart-items> re-render itself.
    if (document.getElementById('main-cart-items') && typeof publish === 'function') {
      publish(PUB_SUB_EVENTS.cartUpdate, { source: SOURCE });
    }
  }

  // Sources after which Dawn has already re-rendered the whole drawer.
  const DAWN_RENDERED = new Set(['cart-items', 'product-form']);

  async function sync(source) {
    const changed = await apply(plan(await getCart()));
    if (changed || (source && !DAWN_RENDERED.has(source))) await refresh();
  }

  /* ---------- Sample picker ---------- */

  const picker = {
    selected: new Set(),
    opener: null,

    get el() {
      return drawer()?.querySelector('#KnrSamplePicker');
    },

    open(opener) {
      const el = this.el;
      if (!el) return;
      this.opener = opener;
      this.selected = new Set((el.dataset.selected || '').split(',').filter(Boolean));
      this.render();
      el.hidden = false;
      requestAnimationFrame(() => el.classList.add('is-open'));
      if (typeof trapFocus === 'function') trapFocus(el, el.querySelector('.knr-picker__back'));
    },

    close() {
      const el = this.el;
      if (!el) return;
      el.classList.remove('is-open');
      el.hidden = true;
      const inner = drawer()?.querySelector('.drawer__inner');
      const focusTarget = drawer()?.querySelector('.knr-samples__choose') || inner;
      if (inner && typeof trapFocus === 'function') trapFocus(inner, focusTarget);
    },

    toggle(button) {
      const id = button.dataset.knrSample;
      const max = Number(this.el.dataset.max);
      if (this.selected.has(id)) this.selected.delete(id);
      else if (this.selected.size < max) this.selected.add(id);
      this.render();
    },

    render() {
      const el = this.el;
      const max = Number(el.dataset.max);
      const full = this.selected.size >= max;
      el.classList.toggle('is-full', full);
      el.querySelectorAll('[data-knr-picker-count]').forEach((node) => (node.textContent = this.selected.size));
      el.querySelectorAll('[data-knr-sample]').forEach((button) => {
        const on = this.selected.has(button.dataset.knrSample);
        button.setAttribute('aria-pressed', String(on));
        button.closest('.knr-picker__card')?.classList.toggle('is-selected', on);
        if (!button.closest('.is-unavailable')) button.disabled = full && !on;
      });
    },

    submit() {
      const wanted = new Set(this.selected);
      return enqueue(async () => {
        const cart = await getCart();
        const updates = {};
        const inCart = new Set();
        cart.items.filter(isSample).forEach((item) => {
          const id = String(item.variant_id);
          if (!wanted.has(id) || inCart.has(id)) updates[item.key] = 0;
          else inCart.add(id);
        });
        const add = [...wanted]
          .filter((id) => !inCart.has(id))
          .map((id) => ({ id: Number(id), quantity: 1, properties: { _knr_reward: 'sample' } }));

        if (Object.keys(updates).length) await updateCart({ updates });
        if (add.length) await addToCart(add);
        await apply(plan(await getCart())); // re-check limits (e.g. subtotal changed meanwhile)
        await refresh();
      }).then(() => this.close());
    },
  };

  /* ---------- Events ---------- */

  document.addEventListener('click', (event) => {
    const target = event.target.closest(
      '[data-knr-picker-open], [data-knr-picker-close], [data-knr-sample], [data-knr-picker-submit], [data-knr-gift-remove]'
    );
    if (!target || !target.closest('cart-drawer')) return;
    event.preventDefault();

    if (target.matches('[data-knr-picker-open]')) picker.open(target);
    else if (target.matches('[data-knr-picker-close]')) picker.close();
    else if (target.matches('[data-knr-sample]')) picker.toggle(target);
    else if (target.matches('[data-knr-picker-submit]')) picker.submit();
    else if (target.matches('[data-knr-gift-remove]')) {
      const key = target.dataset.knrGiftRemove;
      enqueue(async () => {
        await updateCart({ updates: { [key]: 0 }, attributes: { [DECLINED]: '1' } });
        await refresh();
      });
    }
  });

  // Escape closes the picker first (not the whole drawer).
  document.addEventListener(
    'keyup',
    (event) => {
      if (event.code !== 'Escape' || !picker.el || picker.el.hidden) return;
      event.stopPropagation();
      picker.close();
    },
    true
  );

  if (typeof subscribe === 'function' && typeof PUB_SUB_EVENTS !== 'undefined') {
    subscribe(PUB_SUB_EVENTS.cartUpdate, (event) => {
      if (event?.source === SOURCE) return;
      cartEvents += 1;
      enqueue(() => sync(event?.source));
    });
  }

  // Cart may have changed on another tab/page: enforce once on load.
  enqueue(() => sync());
})();

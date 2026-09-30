/*
  KNR — small, dependency-free custom elements used by the knr- sections.
  Loaded with `defer` from layout/theme.liquid; each element only upgrades when
  its tag is present on the page. Variant logic stays in Dawn (product-info.js);
  these elements only listen to Dawn's PUB_SUB_EVENTS.
*/
(() => {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const define = (name, element) => {
    if (!customElements.get(name)) customElements.define(name, element);
  };
  const onVariantChange = (callback) =>
    typeof subscribe === 'function' && typeof PUB_SUB_EVENTS !== 'undefined'
      ? subscribe(PUB_SUB_EVENTS.variantChange, callback)
      : () => {};

  /* Horizontal scroller: next/prev buttons, progress bar, dash pagination. */
  class KnrScroller extends HTMLElement {
    connectedCallback() {
      this.track = this.querySelector('[data-scroller-track]');
      if (!this.track) return;
      this.bar = this.querySelector('[data-progress-bar]');
      this.dots = [...this.querySelectorAll('[data-scroller-dot]')];

      this.querySelector('[data-scroller-next]')?.addEventListener('click', () => this.step(1));
      this.querySelector('[data-scroller-prev]')?.addEventListener('click', () => this.step(-1));
      this.dots.forEach((dot, index) => dot.addEventListener('click', () => this.goTo(index)));

      this.update = this.update.bind(this);
      this.track.addEventListener('scroll', this.update, { passive: true });
      this.resizeObserver = new ResizeObserver(this.update);
      this.resizeObserver.observe(this.track);
    }

    disconnectedCallback() {
      this.resizeObserver?.disconnect();
    }

    get items() {
      return [...this.track.children];
    }

    get itemSpan() {
      const [first, second] = this.items;
      if (!first) return this.track.clientWidth;
      return second ? second.offsetLeft - first.offsetLeft : first.offsetWidth;
    }

    get index() {
      return Math.round(this.track.scrollLeft / (this.itemSpan || 1));
    }

    goTo(index) {
      const item = this.items[index];
      if (!item) return;
      this.track.scrollTo({
        left: item.offsetLeft - this.items[0].offsetLeft,
        behavior: reducedMotion.matches ? 'auto' : 'smooth',
      });
    }

    step(direction) {
      const maxScroll = this.track.scrollWidth - this.track.clientWidth;
      if (direction > 0 && this.track.scrollLeft >= maxScroll - 2) return this.goTo(0);
      this.goTo(Math.max(0, this.index + direction));
    }

    update() {
      const { scrollLeft, scrollWidth, clientWidth } = this.track;
      const overflowing = scrollWidth > clientWidth + 1;
      this.toggleAttribute('data-overflowing', overflowing);

      if (this.bar && overflowing) {
        this.bar.style.setProperty('--knr-progress-size', `${(clientWidth / scrollWidth) * 100}%`);
        this.bar.style.setProperty('--knr-progress-offset', `${(scrollLeft / clientWidth) * 100}%`);
      }

      if (this.dots.length) {
        const current = Math.min(this.index, this.dots.length - 1);
        this.dots.forEach((dot, i) => dot.setAttribute('aria-current', String(i === current)));
      }
    }
  }
  define('knr-scroller', KnrScroller);

  /* Product gallery: a scroller that also follows the selected variant image. */
  class KnrProductGallery extends KnrScroller {
    connectedCallback() {
      super.connectedCallback();
      this.querySelector('[data-gallery-next]')?.addEventListener('click', () => this.step(1));
      this.unsubscribe = onVariantChange(({ data }) => {
        if (data.sectionId !== this.dataset.section) return;
        const mediaId = data.variant?.featured_media?.id;
        const item = mediaId && this.querySelector(`[data-media-id="${this.dataset.section}-${mediaId}"]`);
        if (!item || this.track.scrollWidth <= this.track.clientWidth) return;
        this.goTo(this.items.indexOf(item));
      });
    }

    disconnectedCallback() {
      super.disconnectedCallback();
      this.unsubscribe?.();
    }
  }
  define('knr-product-gallery', KnrProductGallery);

  /* Rotator: one visible slide, dash pagination, optional autoplay and arrows. */
  class KnrRotator extends HTMLElement {
    connectedCallback() {
      this.slides = [...this.querySelectorAll('[data-rotator-slide]')];
      if (this.slides.length < 2) return;
      this.dots = [...this.querySelectorAll('[data-rotator-dot]')];
      this.current = 0;

      this.dots.forEach((dot, index) => dot.addEventListener('click', () => this.show(index, true)));
      this.querySelector('[data-rotator-prev]')?.addEventListener('click', () => this.show(this.current - 1, true));
      this.querySelector('[data-rotator-next]')?.addEventListener('click', () => this.show(this.current + 1, true));

      const seconds = Number(this.dataset.interval);
      if (seconds > 0 && !reducedMotion.matches) {
        this.interval = seconds * 1000;
        ['mouseenter', 'focusin'].forEach((type) => this.addEventListener(type, () => this.pause()));
        ['mouseleave', 'focusout'].forEach((type) => this.addEventListener(type, () => this.play()));
        this.play();
      }
    }

    disconnectedCallback() {
      this.pause();
    }

    show(index, userInitiated = false) {
      const count = this.slides.length;
      this.current = (index + count) % count;
      this.slides.forEach((slide, i) => (slide.hidden = i !== this.current));
      this.dots.forEach((dot, i) => dot.setAttribute('aria-current', String(i === this.current)));
      if (userInitiated) this.play();
    }

    play() {
      if (!this.interval) return;
      this.pause();
      this.timer = window.setInterval(() => this.show(this.current + 1), this.interval);
    }

    pause() {
      window.clearInterval(this.timer);
    }
  }
  define('knr-rotator', KnrRotator);

  /* Sticky add to cart: mirrors Dawn's variant picker and submits Dawn's form. */
  class KnrStickyAtc extends HTMLElement {
    connectedCallback() {
      const section = this.dataset.section;
      this.mainButton = document.getElementById(`ProductSubmitButton-${section}`);
      if (!this.mainButton) return;

      this.hidden = false;
      this.setVisible(false);

      // Visible once the main button has scrolled away, hidden again over the footer.
      this.pastButton = false;
      this.overFooter = false;
      const update = () => this.setVisible(this.pastButton && !this.overFooter);
      this.observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.target === this.mainButton) {
            this.pastButton = !entry.isIntersecting && entry.boundingClientRect.top < 0;
          } else {
            this.overFooter = entry.isIntersecting;
          }
        });
        update();
      });
      this.observer.observe(this.mainButton);
      const footer = document.querySelector('.shopify-section-group-footer-group, footer');
      if (footer) this.observer.observe(footer);

      this.addEventListener('click', (event) => {
        const option = event.target.closest('[data-option-value]');
        if (option) this.selectOption(Number(option.dataset.optionPosition), option.dataset.optionValue);
      });

      this.unsubscribe = onVariantChange(({ data }) => {
        if (data.sectionId !== section) return;
        const source = data.html.getElementById(`KnrSticky-${section}`);
        const destination = this.querySelector(`#KnrSticky-${section}`);
        if (source && destination) destination.innerHTML = source.innerHTML;
      });
    }

    disconnectedCallback() {
      this.observer?.disconnect();
      this.unsubscribe?.();
    }

    setVisible(visible) {
      this.classList.toggle('is-visible', visible);
      this.inert = !visible;
      this.setAttribute('aria-hidden', String(!visible));
    }

    selectOption(position, value) {
      const selects = document.getElementById(`variant-selects-${this.dataset.section}`);
      if (!selects) return;

      const radio = [...selects.querySelectorAll('input[type="radio"]')].find(
        (input) => input.value === value && input.name.endsWith(`-${position}`)
      );
      if (radio) {
        radio.checked = true;
        radio.dispatchEvent(new Event('change', { bubbles: true }));
        return;
      }

      const select = selects.querySelectorAll('select')[position - 1];
      if (select) {
        select.value = value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  }
  define('knr-sticky-atc', KnrStickyAtc);

  /* Variant switching: Dawn disables the add-to-cart button while it fetches the
     new variant. Flag that state so the button doesn't flash its sold-out style. */
  if (typeof subscribe === 'function' && typeof PUB_SUB_EVENTS !== 'undefined') {
    let switchTimer;
    const setSwitching = (on) => {
      document.querySelectorAll('.knr-product').forEach((el) => el.classList.toggle('is-switching', on));
    };
    subscribe(PUB_SUB_EVENTS.optionValueSelectionChange, () => {
      setSwitching(true);
      window.clearTimeout(switchTimer);
      switchTimer = window.setTimeout(() => setSwitching(false), 4000);
    });
    subscribe(PUB_SUB_EVENTS.variantChange, () => {
      window.clearTimeout(switchTimer);
      setSwitching(false);
    });
  }

  /* Before / after comparison driven by a native (accessible) range input. */
  class KnrBeforeAfter extends HTMLElement {
    connectedCallback() {
      const input = this.querySelector('input[type="range"]');
      if (!input) return;
      const update = () => this.style.setProperty('--knr-ba-pos', `${input.value}%`);
      input.addEventListener('input', update);
      update();
    }
  }
  define('knr-before-after', KnrBeforeAfter);

  /* Reviews: star filter + progressive "load more". */
  class KnrReviews extends HTMLElement {
    connectedCallback() {
      this.items = [...this.querySelectorAll('[data-review]')];
      this.pageSize = Number(this.dataset.pageSize) || 3;
      this.visible = this.pageSize;
      this.moreButton = this.querySelector('[data-reviews-more]');
      this.filter = this.querySelector('[data-reviews-filter]');
      this.status = this.querySelector('[data-reviews-status]');
      this.filterValue = this.querySelector('[data-reviews-filter-value]');

      this.moreButton?.addEventListener('click', () => {
        this.visible += this.pageSize;
        this.render();
      });
      this.filter?.addEventListener('change', () => {
        this.visible = this.pageSize;
        this.render();
      });
      this.render();
    }

    render() {
      const rating = this.filter?.value || 'all';
      const matching = this.items.filter((item) => rating === 'all' || item.dataset.rating === rating);
      this.items.forEach((item) => (item.hidden = true));
      matching.slice(0, this.visible).forEach((item) => (item.hidden = false));
      if (this.moreButton) this.moreButton.hidden = matching.length <= this.visible;
      if (this.status) this.status.textContent = this.status.dataset.template.replace('[count]', matching.length);
      if (this.filterValue && this.filter) {
        this.filterValue.textContent = rating === 'all' ? '' : `· ${this.filter.selectedOptions[0].text}`;
      }
    }
  }
  define('knr-reviews', KnrReviews);

  /* Footer columns: accordions on mobile, always open on desktop. */
  const desktop = window.matchMedia('(min-width: 750px)');
  const syncDesktopDetails = () => {
    document.querySelectorAll('details[data-knr-open-desktop]').forEach((details) => {
      details.open = desktop.matches;
      details.querySelector('summary')?.setAttribute('tabindex', desktop.matches ? '-1' : '0');
    });
  };
  document.addEventListener('click', (event) => {
    const summary = event.target.closest('details[data-knr-open-desktop] > summary');
    if (summary && desktop.matches) event.preventDefault();
  });
  desktop.addEventListener('change', syncDesktopDetails);
  document.addEventListener('shopify:section:load', syncDesktopDetails);
  syncDesktopDetails();
})();

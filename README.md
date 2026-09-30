# KNR — Product page integration (Dawn 16)

A dedicated product template (`templates/product.knr-product.json`) for **Sérum Précieux Régénérant** (Maison Célestine). It is built on Shopify's default theme (Dawn) and follows the supplied Figma frames: desktop 1440 px, mobile 390 px.

- Stack: Liquid, vanilla CSS, vanilla JS (custom elements, `defer`). No framework or library.
- Font: Inter. Dawn's settings use Shopify's `inter_n4`; the KNR sections use a self-hosted variable Inter (`assets/knr-inter-var.woff2`, 73 KB Latin subset, OFL, served from Shopify's CDN and preloaded) because its optical-size axis matches the Figma text widths. Letter-spacing tokens in `knr-base.css` are calibrated against the PDF.
- Every new file is prefixed `knr-`. Each section loads its own scoped stylesheet.

## Architecture

| Section | Content source |
| --- | --- |
| `knr-main-product` | Product data, metafields and Dawn components (see below) |
| `knr-product-story` | Section settings: desktop and mobile images, eyebrow, quote, author |
| `knr-how-to-use` | Blocks: image, title, text, link |
| `knr-testimonials` | Settings for the before/after images; blocks for the quotes |
| `knr-faq` | Product metafield `custom.faq` (metaobjects), falling back to section blocks |
| `knr-reviews` | Product metafield `custom.reviews` (metaobjects), falling back to blocks; `custom.rating` / `custom.rating_count` (fallback: `reviews.*`) |
| `knr-latest-news` | A blog chosen in the settings (real `article` objects) |
| `knr-brand-story` | Settings plus the native `customer` newsletter form |
| `knr-reassurance`, `knr-footer` | Footer group: blocks, Shopify menus, social settings, localization |

**Reusing Dawn instead of rewriting it.** The main section wraps Dawn's `<product-info>`, so variant changes still re-render the price, inventory, button state, URL (`?variant=`) and picker from the server:
- `product-variant-picker`, which renders the real `<variant-selects>`, restyled
- `buy-buttons` / `<product-form>`, which handles AJAX add to cart, the cart notification and sold-out states
- `product-media-modal` / `<product-modal>`, which powers the "+" zoom buttons

The sticky bar and the "Complétez votre rituel" quick-add buttons go through the same Dawn form and events. No variant logic is duplicated.

**JS** (`assets/knr.js`, deferred, about 5 KB): the scroller/progress bar, the product gallery (it follows the variant image), the rotator, the sticky add-to-cart bar (mirrors the picker and listens to `PUB_SUB_EVENTS.variantChange`), the before/after slider (a native `input[type=range]`, so it's keyboard-accessible), the review filter and load-more, and the footer accordions.

**Motion.** Scroll reveals reuse Dawn's `scroll-trigger` / `animations.js` (theme setting "Reveal sections on scroll", staggered with `data-cascade`). Image hover zoom, smooth accordions (`::details-content` + `interpolate-size`, a progressive enhancement) and rotator fades are CSS-only. All motion is disabled under `prefers-reduced-motion`.

**CSS scoping.** Styles live under `.knr-*` classes. Header tweaks (transparent over the hero, centred menu, mobile layout) apply only on this template, through the body class `template-suffix-knr-product`.

**Dawn files touched:** `layout/theme.liquid` (template body class, `knr-base.css`, `knr.js`) and `sections/header.liquid` (optional store-locator link and icon). Group and settings JSON files are also updated.

## Store setup

### 1. General
- Settings → Languages: make **French** the default language. The storefront strings, such as "Ajouter au panier", come from `fr.json`.
- Settings → General → Currency: **EUR**, with the format `€{{amount}}` (the design shows `€75.00`).
- Online Store → Preferences: password `KNRDEV`.

### 2. Files (Content → Files)
Upload everything in `design/export/sections/` and `design/export/blog/`, keeping the file names. The template and footer reference them as `shopify://shop_images/<name>`, so they connect automatically: `story-desktop.jpg`, `story-mobile.jpg`, `how-to-1/2/3.jpg`, `before.jpg`, `after.jpg`, `brand-story.jpg`, `cosmos-organic.png`.

### 3. Metafield definitions (Settings → Custom data)

**Metaobjects**
- `faq_item`: `question` (single line text), `answer` (rich text)
- `product_review`: `author` (single line text), `verified` (true/false), `title` (single line text), `body` (multi-line text), `rating` (rating 1–5), `date` (date)

**Product metafields**

| Key | Type | Used for |
| --- | --- | --- |
| `custom.badges` | List of single line text | "UNIFIE", "PROTÈGE" badges (fallback: tags `badge:Unifie`) |
| `custom.short_description` | Multi-line text | Summary under the title |
| `custom.scores` | Rich text | **Yuka** 100/100 · **INCI Beauty** 20/20 |
| `custom.benefits` / `custom.key_ingredients` / `custom.skin_types` | Rich text | Accordions (the template text is the fallback) |
| `custom.faq` | List of metaobjects (`faq_item`) | Optional; overrides the FAQ blocks |
| `custom.reviews` | List of metaobjects (`product_review`) | Optional; overrides the review blocks |
| `custom.complementary_products` | List of products | Only if the Search & Discovery app isn't used |
| `custom.rating` / `custom.rating_count` | Rating (or decimal) / Integer | Stars, "4.7 · 200 avis" (falls back to the standard `reviews.*` fields) |

### 4. Products
**Sérum Précieux Régénérant**
- Option **Taille**:
  - `15 mL`: €75.00, compare-at €85.00
  - `150 mL`: e.g. €245.00, compare-at €270.00
- Unit price: total 15 mL / 150 mL, base 100 mL (this shows "… par 100 mL").
- Description: "Formulé à partir de 97 % d'ingrédients d'origine naturelle, ce sérum précieux active les mécanismes naturels de régénération cellulaire."
- Media: `design/export/product/01…04`, in order (01 is the full-width hero). Set image 01's focal point on the bottle so the mobile crop stays centred.
- Metafields as above: `short_description` = "Une huile anti-âge sèche ultra fine qui travaille en synergie avec la peau pour la maintenir ferme, pleine de vitalité tout en lissant les rides."
- Collections: **Soins anti-âge** and **Collection Cactus**. These feed the breadcrumb.
- Theme template: **product.knr-product**

**Ritual products:** Huile Précieuse, Sérum Éclat and Crème Régénérante, each using `design/export/products-complementary/tube.jpg`. Link them as complementary products in Search & Discovery, or fill `custom.complementary_products`.

### 5. Blog `news`
Create 4 articles. Give each one a featured image from `design/export/blog/`, a tag (the first tag is shown) and an excerpt:

| Tag | Title | Excerpt |
| --- | --- | --- |
| L'origine | Fondée en 2012 dans les Alpes | Maison Célestine est née de la passion d'une botaniste pour les plantes alpines et leurs propriétés régénérantes exceptionnelles. |
| La formule | 12 ingrédients actifs sélectionnés | Chaque ingrédient est sourcé chez des producteurs engagés : huile de rosier muscat, rétinol végétal, extrait de cactus Cactaceae. |
| L'expertise | 15 ans de recherche en lab | Notre laboratoire indépendant teste chaque formule sur des panels de peaux diverses, garantissant efficacité et tolérance. |
| L'engagement | 97 % naturel certifié | Emballages recyclables, formules biodégradables, compensation carbone intégrale. Beauté responsable, du champ au flacon. |

### 6. Navigation
- `main-menu`: Produits, Diagnostique, La marque, Journal
- `footer-decouvrir`: Acheter, Notre histoire, Science, Presse, Où nous trouver
- `footer-service-client`: Mon compte, Suivre mon colis, Livraison & retour, FAQs, Nous contacter
- `footer-legal`: Conditions générales de vente, Mentions légales, Paramètre des cookies, Accessibilité

## Development

```bash
shopify theme dev --store <store>.myshopify.com   # local preview
shopify theme push --store <store>.myshopify.com  # upload
```

Upload the Files (step 2) before the first push so the image references resolve.

## Notes / trade-offs
- Reviews: Shopify has no native reviews, so they're modelled as metaobjects plus the standard `reviews.*` metafields. A review app can populate the same fields.
- The desktop frame titles all three "How to use" cards "Découvrir". The template uses the mobile frame's descriptive titles instead; both are block settings.
- The localization selectors reuse Dawn's snippets, so the country label reads "France | EUR €" rather than "France (€)". They only appear when more than one market or language is enabled.
- The footer wordmark is an SVG `<text>` stretched to the column width (editable text, sharp at any size). An image can replace it.

---

# Test 2 — Gamified cart drawer (rewards, free samples, free product)

The cart drawer shows a 3-step progress bar (free shipping → free samples → free product). Customers pick their free samples in a panel inside the drawer, and a free product is added or removed automatically. Everything is set up in **Theme settings → KNR · Récompenses panier**: thresholds, labels, messages (with `[amount]` / `[count]`), the sample collection, the maximum number of samples, the free product and all drawer text. Nothing is hardcoded.

## Architecture
- **`snippets/knr-cart-drawer.liquid`** replaces Dawn's drawer markup (when the rewards setting is on) but keeps Dawn's JS contract (`<cart-drawer>`, `.drawer__inner`, `<cart-drawer-items>`, `Drawer-quantity-N`, `<cart-remove-button>`, `.cart-item__name`, live regions, `.cart-drawer__footer`). Add to cart, quantity changes and removals still run through Dawn's `cart.js` / `cart-drawer.js` and the Section Rendering API.
- **All reward state is computed in Liquid** (progress %, current step, message, sample slots, free product line), so every server render is correct on its own. Sub-snippets: `knr-cart-samples` (slots), `knr-cart-sample-picker` (the picker panel), `knr-cart-icon`.
- **`assets/knr-cart-rewards.js`** (deferred) enforces the rules on the real cart after every `PUB_SUB_EVENTS.cartUpdate` and on page load:
  - samples: none below the samples threshold, at most N above it, quantity 1 each;
  - free product: added above its threshold, removed below it, quantity 1. If the customer removes it, a cart attribute (`_knr_gift_declined`) keeps it removed until the cart drops below the threshold again.

  It then re-renders the drawer. All Cart API calls go through **one promise queue**, so rapid clicks can't interleave, and a render that's older than the latest Dawn update is dropped.
- **Rules config:** `snippets/knr-cart-rewards-config.liquid` prints the rules as JSON from the settings, so the JS and the Liquid share one source of truth.
- **Reward lines** are real €0 products tagged with a hidden `_knr_reward` line-item property. That keeps inventory, orders and checkout correct.
- **Safety:** only **€0 variants** of the sample collection count as samples, so a paid product added to the collection by mistake is ignored.
- **Dawn files touched:** `layout/theme.liquid` and `sections/cart-drawer.liquid` render the KNR drawer when the setting is on, and Dawn's otherwise. The settings group is added to `config/settings_schema.json`, and one translation key per locale.

## Store setup
- **Samples:** €0 products with option `Format` = `1 ml`, status Unlisted, in a manual collection selected in the settings.
- **Free product:** a €0 product (Unlisted), selected in the settings.
- **Shipping:** a €0 rate for orders of €50 or more, so "Livraison offerte" is also true at checkout.

## Notes / limits
- Thresholds apply to the cart total excluding reward lines, after line discounts, in the store currency (single EUR market).
- A theme can't fully stop a determined user from adding a €0 product through a hand-crafted API call. The rules engine removes such lines on the next cart change or page load, and real server-side enforcement would need a Shopify Function (cart validation, via an app).
- Design choices: the step labels follow the brief (€50 free shipping / €75 three samples / €100 free product) where the mockup was inconsistent, and the button total is the real cart total.

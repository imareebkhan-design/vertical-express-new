# Vertical Express — Gap Analysis (Phase 2)

Comparison of the current Vertical Express frontend against the reference platform's observed capabilities. Priority: **P0** = blocks commerce, **P1** = expected by users at launch, **P2** = growth/differentiation, **P3** = future.

| # | Missing feature | Why it exists (reference) | User benefit | Business benefit | Priority |
|---|---|---|---|---|---|
| 1 | **Product Listing Page (PLP) / category pages** | Every category links to a real collection with a product grid | Browse full catalog, not just 6 deals | Catalog depth = revenue; SEO landing pages | **P0** |
| 2 | **Product Detail Page (PDP)** | Each card links to a product page with gallery, specs, bulk tiers | Evaluate product before buying | Conversion, structured-data SEO | **P0** |
| 3 | **Real cart page + drawer** | Cart is a first-class page with editing, totals, delivery meter | Review and adjust order | AOV via nudges (free-delivery meter, bulk tiers) | **P0** |
| 4 | **Search with typeahead + results page** | Hosted search widget with suggestions and facets | Fastest path to a known SKU (contractor behavior) | Search users convert 2–3× browsers | **P0** |
| 5 | **Filters & sort on PLP** | Sidebar: category, brand, type, packaging, price slider, counts | Narrow 100s of SKUs quickly | Reduces bounce, powers long-tail SEO | **P0** |
| 6 | **Authentication (phone OTP)** | OTP login modal with consent | One-tap identity; no passwords on site | Verified phone = deliverable orders, remarketing | **P0** |
| 7 | **Address management + pincode serviceability** | Delivery pincode checker in header; address at checkout | Know deliverability before investing effort | Prevents undeliverable orders | **P0** |
| 8 | **Checkout + payments (Razorpay / PoD)** | Shopify checkout; PoD trust badge | Actually buy | Revenue | **P0** |
| 9 | **Order confirmation + My Orders + tracking states** | Account area with order history | Trust, reorder, track | Support deflection, repeat purchase | **P0** |
| 10 | **User dashboard (account area)** | Shopify account pages | One place for orders/addresses/profile | Retention surface | **P1** |
| 11 | **Wishlist / save for later** | Common commerce pattern **[inferred]** | Save site lists for later purchase | Intent capture, remarketing | **P1** |
| 12 | **Bulk pricing tiers (10+/30+/40+) with unlock nudges** | Explicit on reference cards/cart | Trade pricing without phone calls | Larger order sizes; contractor loyalty | **P1** |
| 13 | **Coupons / offers engine** | "Free delivery first 3 orders > ₹500" is a coded rule | Transparent savings | Acquisition lever | **P1** |
| 14 | **Reviews & ratings** | "4.9 Google rating" social proof; product reviews standard | Confidence in unfamiliar brands | UGC SEO, trust | **P1** |
| 15 | **Quote request (RFQ) for bulk/BOQ** | Price-lists page + WhatsApp contact serve this need | Contractors price whole projects | High-GMV B2B channel | **P1** |
| 16 | **Service booking with real form + status tracking** | Our Services page is display-only | Book, not just browse | Converts services traffic to leads | **P1** |
| 17 | **Transactional notifications (SMS/email)** | Standard order emails; WhatsApp support line | Know order status without asking | Support cost reduction | **P1** |
| 18 | **Admin dashboard (catalog, orders, bookings)** | Shopify admin behind reference | n/a (internal) | Operate without engineers | **P1** |
| 19 | **CMS: banners, blog/Knowledge Hub, FAQs, policies** | Reference has all four | Self-serve answers; fresh promos | Content SEO, merchandising agility | **P2** |
| 20 | **Recently viewed / related products** | Standard cross-sell modules **[inferred]** | Resume shopping | AOV uplift | **P2** |
| 21 | **Delivery slot/ETA display per pincode** | "60 min" promise localized by pincode | Set expectations | Fewer failed deliveries | **P2** |
| 22 | **GST invoice generation** | B2B buyers need input credit | Compliant invoices | Unlocks business customers | **P2** |
| 23 | **Support tickets / WhatsApp deep link** | wa.me contact on reference | Instant help channel | Retention | **P2** |
| 24 | **Vendor portal** | Reference is first-party; we plan marketplace | More selection | Marketplace margin | **P3** |
| 25 | **Project management (link orders+bookings to a project)** | Our differentiator, not on reference | One dashboard per construction project | Platform lock-in, mission goal | **P3** |
| 26 | **Analytics events + dashboards** | Reference runs GA/pixels | n/a | Funnel visibility for every P0 flow | **P1** |

**What we already match or exceed:** brand system, homepage merchandising (deals, categories, banners, testimonials, trust), Services marketing page, announcement bar, responsive nav, motion system, image pipeline.

**Current-priority scope (from stakeholder):** items 1–11 + dashboard = the 13 modules listed in the mission brief. Items 12–17 ride along where cheap (bulk tiers are data on products; booking form reuses quote infrastructure).

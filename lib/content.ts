import type { ContentSection } from "@/components/sections/content-page";

export interface ContentDoc {
  title: string;
  intro?: string;
  updated?: string;
  pending?: string;
  sections: ContentSection[];
}

/**
 * Copy for the policy and informational pages.
 *
 * Anything in [square brackets] is a value the business has not confirmed.
 * These are deliberately visible rather than invented — see ISS-017.
 */
export const CONTENT: Record<string, ContentDoc> = 
{
  "refunds": {
    "title": "Returns and refunds",
    "intro": "Construction material is not a category where one blanket returns window makes sense. A sealed box of tiles and an opened bag of cement are different products the moment they leave the truck, and we would rather say that plainly than publish a policy we cannot honour.",
    "updated": "25 August 2026",
    "pending": "The values in [square brackets] have not been confirmed by the business yet. This page publishes the structure and everything we can already stand behind, so the footer no longer points at a dead link — but it must be completed and reviewed before it can be relied on.",
    "sections": [
      {
        "id": "check-at-delivery",
        "heading": "Check the load before the driver leaves",
        "body": [
          "This is the moment when putting something right costs everybody the least. If a bag is torn, a box is broken, the batch code does not match your order, or the goods are simply not what you ordered, refuse that item at the gate and it goes back on the same vehicle. There is no charge and no form to fill in.",
          "If you find a problem after the driver has gone, tell us within [reporting window] with a photograph and we will replace the item or refund it."
        ]
      },
      {
        "id": "sealed-goods",
        "heading": "Sealed and unused goods",
        "body": [
          "Boxed tiles, unopened paint, fittings, hardware and electrical items in their original packing can be returned within [return window] of delivery. The item must be in resaleable condition with its batch label intact."
        ]
      },
      {
        "id": "cement",
        "heading": "Cement, plaster and adhesives",
        "body": [
          "Once a bag is opened it cannot be returned. An unopened bag can be returned within [return window], subject to a check that it has been stored dry. Cement has a real shelf life and absorbs moisture from the air, so this is a condition of resale rather than a technicality."
        ]
      },
      {
        "id": "made-to-order",
        "heading": "Cut and made-to-order goods",
        "body": [
          "Wire cut to length, and anything ordered in specially for you, cannot be returned unless it is faulty."
        ]
      },
      {
        "id": "refunds",
        "heading": "How refunds are paid",
        "body": [
          "Refunds go back to the method you paid with. Cash-on-delivery orders are refunded to your Vertical Express wallet or by bank transfer, whichever you choose. Expect [refund timeline] from the day we collect the goods.",
          "Delivery charges are refunded when the fault is ours — a wrong item, damaged goods, a missed slot. They are not refunded when an order is returned because you changed your mind."
        ]
      },
      {
        "id": "contact",
        "heading": "Raising a return",
        "body": [
          "Message us on WhatsApp or call during opening hours, 8am to 8pm, all days. Have your order number ready."
        ]
      }
    ]
  },
  "shipping": {
    "title": "Shipping and delivery",
    "intro": "Two kinds of goods travel two different ways, and every product page tells you which it is. We do not put a single delivery promise in the header, because the header cannot know whether you are looking at a coil of wire or a tonne of cement.",
    "updated": "25 August 2026",
    "pending": "The values in [square brackets] have not been confirmed by the business yet. This page publishes the structure and everything we can already stand behind, so the footer no longer points at a dead link — but it must be completed and reviewed before it can be relied on.",
    "sections": [
      {
        "id": "speeds",
        "heading": "Two delivery speeds",
        "body": [
          "Small items — hardware, electricals, paint, adhesives — are held in our Srinagar store and go out on a bike or a small van shortly after you order.",
          "Heavy material — cement, tiles, tanks, plywood — travels by truck. It is loaded and delivered on a scheduled run rather than in the express window, because a tonne of cement does not go on a bike."
        ]
      },
      {
        "id": "areas",
        "heading": "Where we deliver",
        "body": [
          "Srinagar only, for now. If your pincode is not on our serviceable list we will not take the order rather than take it and fail. You can check your pincode at checkout and on any product page.",
          "Delivery charges are shown at checkout before you pay, and depend on the pincode and the kind of goods."
        ]
      },
      {
        "id": "access",
        "heading": "Site access",
        "body": [
          "Tell us about your site when you add an address — whether a truck can reach the gate, whether there are stairs, whether the lane is narrow. Our drivers unload at the gate. Carrying material into or up a building is not included."
        ]
      },
      {
        "id": "seasonal",
        "heading": "Winter",
        "body": [
          "Between roughly December and February, road access and supply into the valley from Jammu are genuinely less reliable. Where an item is affected we will say so rather than promise a date we cannot keep."
        ]
      },
      {
        "id": "failed",
        "heading": "If a delivery cannot be completed",
        "body": [
          "If nobody is at the site, or the vehicle cannot reach it, the driver will call you. [Re-delivery terms to be confirmed.]"
        ]
      }
    ]
  },
  "terms": {
    "title": "Terms of service",
    "intro": "These terms cover orders placed on verticalexpress.in. Our services business operates separately at verticalconstruction.in under its own terms.",
    "updated": "25 August 2026",
    "pending": "The values in [square brackets] have not been confirmed by the business yet. This page publishes the structure and everything we can already stand behind, so the footer no longer points at a dead link — but it must be completed and reviewed before it can be relied on.",
    "sections": [
      {
        "id": "who",
        "heading": "Who we are",
        "body": [
          "Vertical Express is a construction-material retailer operating in Srinagar, Jammu & Kashmir. Business name, registered address, GSTIN and CIN: [to be confirmed]."
        ]
      },
      {
        "id": "orders",
        "heading": "Placing an order",
        "body": [
          "An order is an offer to buy. It is accepted when we confirm it, and confirmation depends on the goods being in stock and your pincode being serviceable. Prices shown include GST. We may cancel and refund an order if an item turns out to be unavailable or if a price has been listed in obvious error."
        ]
      },
      {
        "id": "prices",
        "heading": "Prices and taxes",
        "body": [
          "All prices are in Indian rupees and include GST at the applicable rate for the product's HSN classification. Your invoice shows the tax breakup. If you are buying for a business, add your GSTIN at checkout and it will appear on the invoice."
        ]
      },
      {
        "id": "payment",
        "heading": "Payment",
        "body": [
          "You may pay online before dispatch, or in cash or by UPI to the driver on delivery where cash on delivery is available for your order. [The cash-on-delivery ceiling is to be confirmed and will be shown at checkout.] We do not store card details."
        ]
      },
      {
        "id": "delivery",
        "heading": "Delivery",
        "body": [
          "Delivery terms are set out in our shipping policy. Delivery estimates are estimates, not guarantees."
        ]
      },
      {
        "id": "returns",
        "heading": "Returns",
        "body": [
          "Returns and refunds are set out in our returns policy."
        ]
      },
      {
        "id": "liability",
        "heading": "Liability",
        "body": [
          "We are responsible for supplying goods that match their description and are of satisfactory quality. We are not responsible for how material is used on site, for workmanship, or for losses arising from a delivery running late. [Liability cap to be confirmed with counsel.]"
        ]
      },
      {
        "id": "law",
        "heading": "Governing law",
        "body": [
          "These terms are governed by Indian law. Disputes are subject to the courts at Srinagar, Jammu & Kashmir."
        ]
      }
    ]
  },
  "privacy": {
    "title": "Privacy policy",
    "intro": "What we collect, why, and what we do not do with it.",
    "updated": "25 August 2026",
    "pending": "The values in [square brackets] have not been confirmed by the business yet. This page publishes the structure and everything we can already stand behind, so the footer no longer points at a dead link — but it must be completed and reviewed before it can be relied on.",
    "sections": [
      {
        "id": "collect",
        "heading": "What we collect",
        "body": [
          "Your phone number, which is how you sign in. Your name and delivery addresses, including any access notes you add about your site. Your order history. If you give us a GSTIN for invoicing, we store that too.",
          "We do not ask for and do not store card numbers. Online payments are handled by our payment gateway."
        ]
      },
      {
        "id": "why",
        "heading": "Why we collect it",
        "body": [
          "To take your order, deliver it, invoice it correctly, and answer you when you contact us. Your phone number is also how our driver reaches you on the day."
        ]
      },
      {
        "id": "sharing",
        "heading": "Who we share it with",
        "body": [
          "Our delivery staff see your name, phone number, address and access note for orders they are delivering. Our payment gateway processes your payment. Our infrastructure providers host the data. We do not sell your data and we do not share it for anyone else's marketing.",
          "Specific processors and their locations: [to be listed]."
        ]
      },
      {
        "id": "keep",
        "heading": "How long we keep it",
        "body": [
          "Order and invoice records are kept as long as tax law requires. [Retention period to be confirmed with our accountant.] You can ask us to delete your account and we will, except for records we are legally required to keep."
        ]
      },
      {
        "id": "rights",
        "heading": "Your choices",
        "body": [
          "You can see and correct your details in your account. You can ask for a copy of your data, or ask us to delete it, by contacting us."
        ]
      },
      {
        "id": "contact",
        "heading": "Contacting us about privacy",
        "body": [
          "Grievance officer and contact details: [to be appointed and published], as required under the Consumer Protection (E-Commerce) Rules."
        ]
      }
    ]
  },
  "how-we-work": {
    "title": "How we work",
    "intro": "Everything on this page is a process you can check rather than a claim you have to believe. Where something is not settled, it says so.",
    "updated": "25 August 2026",
    "sections": [
      {
        "id": "genuine",
        "heading": "The material is genuine, and you can check it",
        "body": [
          "Counterfeit and re-bagged material is the real risk in this trade, and a badge on a website does nothing about it. Our answer is a process rather than a logo.",
          "Stock is bought from authorised distributors, and batch details are recorded when it is received into the warehouse rather than reconstructed afterwards. Batch capture and the scan-on-delivery check are being rolled out — where a batch is recorded for your order it appears on the order itself."
        ]
      },
      {
        "id": "delivery",
        "heading": "Two speeds, and we do not mix them up",
        "body": [
          "A bag of cement and a coil of wire do not travel the same way, so we stopped pretending they do. Speed lives on the product: you see it on the card, on the product page and in the cart, and it is the same answer every time.",
          "Small items come from our Srinagar store. Heavy material travels by truck. Full slot selection, so you can pick the window a truck arrives in, is not built yet."
        ]
      },
      {
        "id": "payment",
        "heading": "Pay how you like",
        "body": [
          "Cash or UPI to the driver, or card and net banking online. Nothing is kept on file that you did not ask us to keep.",
          "If material arrives damaged, wrong or off-batch, tell the driver before they leave. That is the cheapest moment for everyone to put it right."
        ]
      },
      {
        "id": "not-yet",
        "heading": "What we have not built yet",
        "body": [
          "We would rather list this than let you assume it exists. Slot selection for heavy deliveries, live order tracking, scan-on-delivery batch verification, and trade credit are all in progress and not available today."
        ]
      }
    ]
  },
  "contact": {
    "title": "Contact us",
    "intro": "We are open 8am to 8pm, all days.",
    "updated": "25 August 2026",
    "pending": "The values in [square brackets] have not been confirmed by the business yet. This page publishes the structure and everything we can already stand behind, so the footer no longer points at a dead link — but it must be completed and reviewed before it can be relied on.",
    "sections": [
      {
        "id": "reach",
        "heading": "How to reach us",
        "body": [
          "Phone and WhatsApp: [number to be published]. Email: [address to be published].",
          "For anything about an existing order, have your order number ready — it is on your confirmation and in your account."
        ]
      },
      {
        "id": "address",
        "heading": "Registered address",
        "body": [
          "[Registered business name and address to be published.] Srinagar, Jammu & Kashmir."
        ]
      },
      {
        "id": "grievance",
        "heading": "Grievance officer",
        "body": [
          "As required under the Consumer Protection (E-Commerce) Rules, 2020: [name, designation and contact to be appointed and published]."
        ]
      }
    ]
  },
  "faq": {
    "title": "Questions we actually get",
    "intro": "If an answer is not settled yet, it says so rather than guessing.",
    "updated": "25 August 2026",
    "sections": [
      {
        "id": "speed",
        "heading": "How fast is delivery, really?",
        "body": [
          "It depends on the item, and the item tells you. Small goods — hardware, electricals, paint, adhesives — come from our Srinagar store. Cement, tiles, tanks and plywood travel by truck on a scheduled run. Every product card and product page carries its own delivery speed, which is why there is no single promise at the top of the site."
        ]
      },
      {
        "id": "split",
        "heading": "Why does my order have items with different speeds?",
        "body": [
          "Because it has both kinds of goods in it. Splitting a mixed order into separate deliveries, each with its own arrival time, is being built — today a mixed order is still delivered as one order."
        ]
      },
      {
        "id": "cod",
        "heading": "Can I pay cash?",
        "body": [
          "Yes, cash or UPI to the driver where cash on delivery is available for your pincode. [A per-order ceiling is being set and will be shown at checkout.]"
        ]
      },
      {
        "id": "gst",
        "heading": "Do your prices include GST?",
        "body": [
          "Yes. Prices shown are inclusive, and your invoice shows the tax breakup. Add your GSTIN at checkout and it will appear on every invoice after that."
        ]
      },
      {
        "id": "genuine",
        "heading": "How do I know the material is genuine?",
        "body": [
          "Stock is bought from authorised distributors and batch details are recorded at goods receipt. Where a batch is recorded for your order it appears on the order. The scan-at-the-gate check is being rolled out."
        ]
      },
      {
        "id": "area",
        "heading": "Where do you deliver?",
        "body": [
          "Srinagar only, for now. Check your pincode at checkout — if we cannot serve it we will say so rather than take the order and fail."
        ]
      }
    ]
  }
};

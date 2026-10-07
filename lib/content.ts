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
          "Refunds go back to the method you paid with, which today means the card, UPI or net-banking payment you made online. Expect [refund timeline] from the day we collect the goods.",
          "Delivery charges are refunded when the fault is ours — a wrong item, damaged goods, a delivery we failed to make. They are not refunded when an order is returned because you changed your mind."
        ]
      },
      {
        "id": "contact",
        "heading": "Raising a return",
        "body": [
          "Email us — the address is on the contact page. [Opening hours to be confirmed.] Have your order number ready."
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
          "All prices are in Indian rupees and include GST at the applicable rate for the product's HSN classification. The tax charged is broken out on your order summary. We are not issuing GST invoices yet and we are not collecting a GSTIN at checkout, so an order placed today cannot carry your registration number and cannot be used to claim input credit."
        ]
      },
      {
        "id": "payment",
        "heading": "Payment",
        "body": [
          "Payment is online, before dispatch. Cash on delivery is switched off and checkout will not accept it, so no order placed today is paid at the gate. [If and when it is offered again, the ceiling per delivery is to be confirmed and will be shown at checkout before it applies.] We do not store card details."
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
          "Your phone number, which is one of the two ways you sign in. If you sign in with Google instead, we receive and store the email address on that account. Your name and delivery addresses, including any access notes you add about your site. Your order history. If you give us a GSTIN for invoicing, we store that too.",
          "We do not ask for and do not store card numbers. Online payments are handled by our payment gateway."
        ]
      },
      {
        "id": "why",
        "heading": "Why we collect it",
        "body": [
          "To take your order, deliver it, invoice it correctly, and answer you when you contact us. Your phone number is also how our driver reaches you on the day, and your email address is where an order confirmation is sent."
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
    "intro": "Building materials for Srinagar sites and homes, ordered online and delivered to your gate.",
    "updated": "8 October 2026",
    "sections": [
      {
        "id": "delivery",
        "heading": "Two ways your order travels",
        "body": [
          "Small goods — hardware, electricals, paint and adhesives — go out from our Srinagar store.",
          "Heavy material — cement, tiles, plywood and tanks — travels by truck and is unloaded at your gate. Add stairs or a narrow lane to your site’s access note so the driver knows before setting off.",
          "An order with both kinds of goods arrives as two shipments. Your cart shows the split before you pay."
        ]
      },
      {
        "id": "payment",
        "heading": "Paying",
        "body": [
          "Pay online by card, UPI or net banking. Prices include GST."
        ]
      },
      {
        "id": "problems",
        "heading": "If something is wrong",
        "body": [
          "If material arrives damaged or isn’t what you ordered, tell the driver before they leave and we’ll replace it."
        ]
      }
    ]
  },
  "contact": {
    "title": "Contact us",
    "intro": "How to reach us. [Opening hours to be confirmed.]",
    "updated": "25 August 2026",
    "pending": "The values in [square brackets] have not been confirmed by the business yet. This page publishes the structure and everything we can already stand behind, so the footer no longer points at a dead link — but it must be completed and reviewed before it can be relied on.",
    "sections": [
      {
        "id": "reach",
        "heading": "How to reach us",
        "body": [
          "Email: info@verticalexpress.in. Phone and WhatsApp: [number to be published].",
          "For anything about an existing order, have your order number ready — it is on your confirmation and in your account."
        ]
      },
      {
        "id": "address",
        "heading": "Registered address",
        "body": [
          "[Registered business name and address to be published.] Srinagar, Jammu & Kashmir. For anything about the services side, which runs separately at verticalconstruction.in: info@verticalconstruction.in."
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
    "title": "Frequently asked questions",
    "updated": "8 October 2026",
    "sections": [
      {
        "id": "speed",
        "group": "Delivery",
        "heading": "How is my order delivered?",
        "body": [
          "Small goods — hardware, electricals, paint, adhesives — go out from our Srinagar store. Cement, tiles, tanks and plywood travel by truck to your gate."
        ]
      },
      {
        "id": "split",
        "group": "Delivery",
        "heading": "Why is my order in two shipments?",
        "body": [
          "It has both kinds of goods in it. Small goods and truck goods travel separately, and each shipment is shown on your order."
        ]
      },
      {
        "id": "area",
        "group": "Delivery",
        "heading": "Where do you deliver?",
        "body": [
          "Across Srinagar. Choose your delivery location at the top of the page and we’ll tell you straight away if we reach it."
        ]
      },
      {
        "id": "pay",
        "group": "Payment",
        "heading": "How can I pay?",
        "body": [
          "Online, by card, UPI or net banking."
        ]
      },
      {
        "id": "gst",
        "group": "Payment",
        "heading": "Do prices include GST?",
        "body": [
          "Yes. Every price shown includes GST, and the tax is broken out on your order summary."
        ]
      },
      {
        "id": "damaged",
        "group": "Orders",
        "heading": "What if something arrives damaged?",
        "body": [
          "Tell the driver before they leave and we’ll replace it."
        ]
      },
      {
        "id": "reorder",
        "group": "Orders",
        "heading": "Can I reorder what I bought before?",
        "body": [
          "Yes — your past orders are in your account, and the home screen brings them back so you can add them again."
        ]
      }
    ]
  }
};

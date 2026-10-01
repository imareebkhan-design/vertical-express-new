import {
  LucideIcon,
} from "lucide-react";

export interface NavCategory {
  label: string;
  href: string;
  children?: { label: string; href: string }[];
}

export interface Category {
  name: string;
  slug: string;
  href: string;
  /** Shows the yellow "Bulk Prices" badge in the tile's top-left corner. */
  bulk?: boolean;
}

export interface Product {
  id: string;
  title: string;
  brandLine: string;
  price: number;
  compareAt: number;
  unit: string;
  /** Delivery speed for this product. Derived from Category.isBulk. */
  speed?: "express" | "scheduled" | "leadtime" | "seasonal";
  /** Express window for the delivery pincode, from ServiceablePincode. */
  etaMinutes?: number;
  /** Drives the tinted product panel's group colour and material drawing. */
  categorySlug?: string;
  icon?: LucideIcon;
  /** Product photo under /public/products; icon placeholder shows if missing. */
  image?: string;
  /**
   * Free stock across warehouses, from `CatalogItem.inStock`.
   *
   * The card and the product page had no stock state at all, so both offered
   * "Add to cart" on an item with nothing on the shelf. `lib/services/cart.ts`
   * refuses it server-side and throws OUT_OF_STOCK, which keeps the data
   * correct — but the customer only found out after choosing a quantity and
   * pressing the button. Every large catalogue marks it on the tile instead.
   *
   * Optional so a caller that genuinely does not know (a static example) is not
   * forced to claim in stock; undefined renders as available, as before.
   */
  inStock?: boolean;
}

export const NAV_PRIMARY: NavCategory[] = [
  {
    label: "Materials",
    href: "/categories",
    children: [
      { label: "Cement", href: "/category/cement" },
      { label: "Tiling", href: "/category/tiling" },
      { label: "Painting", href: "/category/painting" },
      { label: "Wires, MCB & Distribution Boards", href: "/category/wires-mcb-distribution-boards" },
      { label: "Sanitary & Bath Fittings", href: "/category/sanitary-bath-fittings" },
      { label: "All Categories", href: "/categories" },
    ],
  },
  {
    label: "Services",
    href: "/services",
    children: [
      { label: "Complete Home Construction", href: "/services#service-categories" },
      { label: "Home Renovation", href: "/services#service-categories" },
      { label: "Interior Design", href: "/services#service-categories" },
      { label: "Painting Services", href: "/services#service-categories" },
      { label: "Plumbing & Electrical", href: "/services#service-categories" },
      { label: "All Services", href: "/services" },
    ],
  },
  { label: "About", href: "/#" },
  { label: "Contact", href: "#contact" },
];

export const CATEGORIES: Category[] = [
  { name: "Cement", slug: "cement", href: "/category/cement", bulk: true },
  { name: "Tiling", slug: "tiling", href: "/category/tiling", bulk: true },
  { name: "Painting", slug: "painting", href: "/category/painting" },
  { name: "Waterproofing", slug: "waterproofing", href: "/category/waterproofing" },
  { name: "Plywood, MDF & HDHMR", slug: "plywood-mdf-hdhmr", href: "/category/plywood-mdf-hdhmr" },
  { name: "Fevicol", slug: "fevicol", href: "/category/fevicol" },
  { name: "Wires, MCB & Distribution Boards", slug: "wires-mcb-distribution-boards", href: "/category/wires-mcb-distribution-boards", bulk: true },
  { name: "Kitchen Sinks & Faucets", slug: "kitchen-sinks-faucets", href: "/category/kitchen-sinks-faucets" },
  { name: "Sanitary & Bath Fittings", slug: "sanitary-bath-fittings", href: "/category/sanitary-bath-fittings" },
  { name: "Switches & Sockets", slug: "switches-sockets", href: "/category/switches-sockets" },
  { name: "Hinges, Channels & Handles", slug: "hinges-channels-handles", href: "/category/hinges-channels-handles" },
  { name: "Kitchen Systems & Accessories", slug: "kitchen-systems-accessories", href: "/category/kitchen-systems-accessories" },
  { name: "Wardrobe & Bed Fittings", slug: "wardrobe-bed-fittings", href: "/category/wardrobe-bed-fittings" },
  { name: "Door Locks & Hardware", slug: "door-locks-hardware", href: "/category/door-locks-hardware" },
  { name: "Conduits & GI Boxes", slug: "conduits-gi-boxes", href: "/category/conduits-gi-boxes" },
  { name: "Lighting", slug: "lighting", href: "/category/lighting" },
  { name: "CPVC Pipes & Overhead Tanks", slug: "cpvc-pipes-overhead-tanks", href: "/category/cpvc-pipes-overhead-tanks" },
  { name: "Ceiling Fans & Exhaust", slug: "ceiling-fans-exhaust", href: "/category/ceiling-fans-exhaust" },
  { name: "Home Appliances & Power Backup", slug: "home-appliances-power-backup", href: "/category/home-appliances-power-backup" },
  { name: "General Hardware & Tools", slug: "general-hardware-tools", href: "/category/general-hardware-tools" },
];

export const FOOTER_LINKS = {
  company: [
    { label: "How we work", href: "/how-we-work" },
    { label: "Contact", href: "/contact" },
    { label: "FAQ", href: "/faq" },
    { label: "Services", href: "https://verticalconstruction.in" },
  ],
  policy: [
    { label: "Returns & refunds", href: "/refunds" },
    { label: "Privacy Policy", href: "/privacy" },
    { label: "Terms of Service", href: "/terms" },
    { label: "Shipping Policy", href: "/shipping" },
    { label: "Contact", href: "/contact" },
  ],
};

/**
 * Nothing renders this, which is the only reason a third address was not
 * shipping. The footer said "Lal Chowk, Srinagar, J&K 190001", this said
 * "Residency Road", and the contact and terms pages both say the registered
 * address is still to be published.
 *
 * The address is removed rather than corrected — there is nothing to correct it
 * to, and an unused constant holding a plausible one is how it ends up on a
 * page later. It comes back when the owner confirms the registered address,
 * along with the business name, GSTIN and CIN that the terms page brackets
 * beside it.
 */
export const CONTACT = {
  email: "info@verticalexpress.in",
};


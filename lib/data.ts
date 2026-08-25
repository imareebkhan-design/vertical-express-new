import {
  Blocks,
  CookingPot,
  Droplets,
  LucideIcon,
  PaintRoller,
  Plug,
  ShowerHead,
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
  icon?: LucideIcon;
  /** Product photo under /public/products; icon placeholder shows if missing. */
  image?: string;
}

export interface Testimonial {
  id: string;
  name: string;
  role: string;
  quote: string;
}

/**
 * Store announcements.
 *
 * Only statements we can stand behind. Removed: a free-delivery threshold that is
 * an unconfirmed guess (ISS-030), and two unverified speed claims. Emoji are not
 * part of the brand.
 */
export const ANNOUNCEMENTS = [
  "Open 8am to 8pm, all days",
  "Delivering across Srinagar",
];

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

export const DEALS: Product[] = [
  {
    id: "ppc-cement-50kg",
    image: "/products/ppc-cement-50kg.webp",
    title: "PPC Cement, 50 kg Bag",
    brandLine: "Trusted trade brand",
    price: 320,
    compareAt: 335,
    unit: "per bag",
    speed: "scheduled",
    icon: Blocks,
  },
  {
    id: "waterproof-primer-20l",
    image: "/products/waterproof-primer-20l.webp",
    title: "Interior Waterproofing Primer, 20 L",
    brandLine: "Advanced damp protection",
    price: 4899,
    compareAt: 6799,
    unit: "per can",
    icon: ShowerHead,
  },
  {
    id: "distemper-white-20kg",
    image: "/products/distemper-white-20kg.webp",
    title: "Acrylic Distemper Paint, White, 20 kg",
    brandLine: "Smooth matt finish",
    price: 1549,
    compareAt: 2499,
    unit: "per bucket",
    icon: PaintRoller,
  },
  {
    id: "gp-sealant-white",
    image: "/products/gp-sealant-white.webp",
    title: "General Purpose Sealant, White",
    brandLine: "Multi-surface silicone",
    price: 199,
    compareAt: 645,
    unit: "per tube",
    icon: Droplets,
  },
  {
    id: "inverter-battery-combo",
    image: "/products/inverter-battery-combo.webp",
    title: "1050 VA Inverter & 180 Ah Battery Combo",
    brandLine: "Home power backup",
    price: 24499,
    compareAt: 25599,
    unit: "per combo",
    icon: Plug,
  },
  {
    id: "ss-kitchen-sink",
    image: "/products/ss-kitchen-sink.webp",
    title: "Stainless Steel Kitchen Sink, Single Bowl",
    brandLine: "Satin finish, 24 x 18 in",
    price: 2899,
    compareAt: 4299,
    unit: "per piece",
    icon: CookingPot,
  },
];

export const TESTIMONIALS: Testimonial[] = [
  {
    id: "t1",
    name: "Ravi Kumar",
    role: "Site Engineer, Hyderpora",
    quote: "Cement reached my site in 45 minutes. Saved a full day of labour cost.",
  },
  {
    id: "t2",
    name: "Anita Sharma",
    role: "Homeowner, Rajbagh",
    quote: "Mid-renovation, we ran out of tile adhesive on a Sunday. Vertical Express delivered before lunch.",
  },
  {
    id: "t3",
    name: "Mohammed Irfan",
    role: "Contractor, Lal Chowk",
    quote: "Prices match the local mandi and I don't have to send a worker to fetch materials.",
  },
  {
    id: "t4",
    name: "Deepa Nair",
    role: "Interior Designer, Nishat",
    quote: "The hardware selection is excellent. Hinges and channels arrive in an hour, every time.",
  },
  {
    id: "t5",
    name: "Suresh Gowda",
    role: "Builder, Bemina",
    quote: "Pay on delivery and genuine brands. My default supplier for every project now.",
  },
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

export const CONTACT = {
  email: "hello@verticalexpress.co",
  address:
    "Vertical Express Commerce, Residency Road, Lal Chowk, Srinagar, Jammu & Kashmir 190001",
};

export const TRUST_ITEMS: { icon: "star" | "shield" | "banknote"; title: string; caption: string }[] = [
  { icon: "star", title: "4.9 Google Rating", caption: "Loved by thousands of builders & homeowners" },
  { icon: "shield", title: "Quality Assurance", caption: "100% genuine brands, sourced directly" },
  { icon: "banknote", title: "Pay on Delivery", caption: "Check your order first, then pay" },
];

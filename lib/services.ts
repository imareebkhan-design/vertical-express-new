import {
  Armchair,
  BadgeCheck,
  Blocks,
  Building2,
  DoorOpen,
  FileText,
  Frame,
  Grid3x3,
  HardHat,
  Hammer,
  Headphones,
  Home,
  IndianRupee,
  Layers,
  LucideIcon,
  MessageSquare,
  Package,
  PaintRoller,
  PencilRuler,
  PhoneCall,
  ShieldCheck,
  ShowerHead,
  Sofa,
  Sparkles,
  Timer,
  Trees,
  Wrench,
  Zap,
} from "lucide-react";

/**
 * Service category model — built for backend wiring later.
 * `slug` will become the dedicated route (/services/<slug>) with its own
 * inquiry form, pricing, images, FAQs, and assigned professionals.
 */
export interface ServiceCategory {
  slug: string;
  name: string;
  blurb: string;
  items: string[];
  icon: LucideIcon;
}

export interface ServiceFeature {
  title: string;
  caption: string;
  icon: LucideIcon;
}

export interface ServiceStep {
  step: number;
  title: string;
  caption: string;
  icon: LucideIcon;
}

export interface ServicePackage {
  slug: string;
  name: string;
  blurb: string;
  highlights: string[];
  icon: LucideIcon;
  theme: "yellow" | "navy" | "light";
}

export interface ServiceStat {
  value: number;
  suffix: string;
  label: string;
}

export const SERVICE_CATEGORIES: ServiceCategory[] = [
  {
    slug: "complete-home-construction",
    name: "Complete Home Construction",
    blurb: "Foundation to handover.",
    items: ["Turnkey builds", "Project management", "Handover support"],
    icon: Home,
  },
  {
    slug: "home-renovation",
    name: "Home Renovation",
    blurb: "Renovation and remodeling.",
    items: ["Structural changes", "Space remodeling", "Upgrades"],
    icon: Hammer,
  },
  {
    slug: "interior-design",
    name: "Interior Design",
    blurb: "Complete interior solutions.",
    items: ["Concept & mood boards", "Furniture & decor", "Execution"],
    icon: Sofa,
  },
  {
    slug: "architectural-design",
    name: "Architectural Design",
    blurb: "Plans that build right the first time.",
    items: ["2D plans", "3D elevation", "Working drawings"],
    icon: PencilRuler,
  },
  {
    slug: "civil-construction",
    name: "Civil Construction",
    blurb: "Strong bones for every build.",
    items: ["Structural work", "Brickwork", "RCC", "Foundation"],
    icon: Blocks,
  },
  {
    slug: "carpentry",
    name: "Carpentry",
    blurb: "Custom woodwork, made to fit.",
    items: ["Furniture", "Wardrobes", "Modular work"],
    icon: Armchair,
  },
  {
    slug: "false-ceiling",
    name: "False Ceiling",
    blurb: "Ceilings that finish the room.",
    items: ["POP", "Gypsum", "PVC"],
    icon: Layers,
  },
  {
    slug: "tile-installation",
    name: "Tile Installation",
    blurb: "Precision laying, lasting finish.",
    items: ["Floor tiles", "Wall tiles", "Marble", "Granite"],
    icon: Grid3x3,
  },
  {
    slug: "painting-services",
    name: "Painting Services",
    blurb: "Flawless coats, inside and out.",
    items: ["Interior", "Exterior", "Texture", "Waterproof coatings"],
    icon: PaintRoller,
  },
  {
    slug: "plumbing",
    name: "Plumbing",
    blurb: "Leak-free from day one.",
    items: ["Bathroom", "Kitchen", "Pipeline", "Water systems"],
    icon: ShowerHead,
  },
  {
    slug: "electrical-services",
    name: "Electrical Services",
    blurb: "Safe, certified electrical work.",
    items: ["Wiring", "Lighting", "Switchboards", "MCBs"],
    icon: Zap,
  },
  {
    slug: "aluminium-glass",
    name: "Aluminium & Glass",
    blurb: "Modern openings and partitions.",
    items: ["Windows", "Partitions", "Doors"],
    icon: Frame,
  },
  {
    slug: "fabrication",
    name: "Fabrication",
    blurb: "Steel work built to spec.",
    items: ["Steel work", "Railings", "Gates"],
    icon: Wrench,
  },
  {
    slug: "exterior-development",
    name: "Exterior Development",
    blurb: "Outdoors that match the indoors.",
    items: ["Landscaping", "Driveways", "Compound walls"],
    icon: Trees,
  },
  {
    slug: "deep-cleaning",
    name: "Deep Cleaning",
    blurb: "Move-in ready, spotless.",
    items: ["Post-construction cleaning"],
    icon: Sparkles,
  },
  {
    slug: "commercial-construction",
    name: "Commercial Construction",
    blurb: "Spaces that work as hard as you.",
    items: ["Office", "Warehouse", "Retail"],
    icon: Building2,
  },
];

export const SERVICE_FEATURES: ServiceFeature[] = [
  {
    title: "Verified Professionals",
    caption: "Every architect, contractor and worker is background-checked and skill-verified.",
    icon: BadgeCheck,
  },
  {
    title: "Transparent Pricing",
    caption: "Itemized quotations upfront. No surprises, no hidden charges.",
    icon: IndianRupee,
  },
  {
    title: "Quality Assurance",
    caption: "Stage-wise quality checks with photo updates at every milestone.",
    icon: ShieldCheck,
  },
  {
    title: "Dedicated Project Support",
    caption: "One project manager, one point of contact, from start to handover.",
    icon: Headphones,
  },
  {
    title: "Material + Labor in One Place",
    caption: "Materials in 60 minutes and the professionals to put them to work.",
    icon: Package,
  },
  {
    title: "Fast Turnaround",
    caption: "Committed timelines with delay penalties written into every contract.",
    icon: Timer,
  },
];

export const SERVICE_STEPS: ServiceStep[] = [
  {
    step: 1,
    title: "Tell us your requirement",
    caption: "Share your plot, plan, or problem — big or small.",
    icon: MessageSquare,
  },
  {
    step: 2,
    title: "Get a free consultation",
    caption: "An expert visits your site and understands the scope.",
    icon: PhoneCall,
  },
  {
    step: 3,
    title: "Receive quotation",
    caption: "Itemized pricing for materials, labor, and timelines.",
    icon: FileText,
  },
  {
    step: 4,
    title: "Project execution",
    caption: "Verified teams execute with stage-wise quality checks.",
    icon: HardHat,
  },
];

export const SERVICE_PACKAGES: ServicePackage[] = [
  {
    slug: "complete-house-package",
    name: "Complete House Package",
    blurb: "Design, materials, construction, and interiors — one contract, one team, zero coordination headaches.",
    highlights: ["Architecture included", "All materials covered", "Fixed timeline"],
    icon: Home,
    theme: "yellow",
  },
  {
    slug: "interior-package",
    name: "Interior Package",
    blurb: "Modular kitchen, wardrobes, false ceiling, lighting, and decor — a full interior fit-out for your home.",
    highlights: ["3D design preview", "Modular units", "45-day delivery"],
    icon: Sofa,
    theme: "navy",
  },
  {
    slug: "renovation-package",
    name: "Renovation Package",
    blurb: "Structural fixes to full remodels for ageing homes, executed room by room with minimal disruption.",
    highlights: ["Site assessment", "Phased execution", "Debris removal"],
    icon: Hammer,
    theme: "light",
  },
  {
    slug: "bathroom-remodeling",
    name: "Bathroom Remodeling",
    blurb: "Waterproofing, tiling, sanitary fittings, and glasswork — a complete bathroom refresh in under two weeks.",
    highlights: ["Waterproofing warranty", "Premium fittings", "14-day handover"],
    icon: ShowerHead,
    theme: "light",
  },
  {
    slug: "kitchen-remodeling",
    name: "Kitchen Remodeling",
    blurb: "Modular cabinets, counters, sinks, and chimneys — a chef-ready kitchen tailored to your space.",
    highlights: ["Modular design", "Granite & quartz tops", "Plumbing included"],
    icon: Package,
    theme: "navy",
  },
  {
    slug: "painting-package",
    name: "Painting Package",
    blurb: "Interior and exterior painting with surface prep, premium emulsions, and a clean handover.",
    highlights: ["Texture options", "Waterproof coats", "5-day turnaround"],
    icon: PaintRoller,
    theme: "yellow",
  },
];

export const SERVICE_STATS: ServiceStat[] = [
  { value: 500, suffix: "+", label: "Projects Completed" },
  { value: 250, suffix: "+", label: "Verified Professionals" },
  { value: 1000, suffix: "+", label: "Happy Customers" },
  { value: 50, suffix: "+", label: "Service Categories" },
];

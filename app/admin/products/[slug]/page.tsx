import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { CATEGORY_TAX_CONFIGS } from "@/lib/services/tax";
import { ProductEditor } from "@/components/admin/product-editor";
import { getAdminUser } from "@/lib/services/admin/authz";
import { ATTESTED_IMAGE_LICENCES } from "@/lib/catalog-policy";
import { specRows } from "@/lib/catalog/specs";
import { formatPaise } from "@/lib/money";
import { DetailsPanel, PhotosPanel, VariantsPanel } from "@/components/admin/product-catalogue-panels";
import { CommercialReviewPanel } from "@/components/admin/commercial-review-panel";
import { currentOffer } from "@/lib/services/admin/commercial-review";
import { commercialReviewSchema, validateCommercialReadiness } from "@/lib/services/admin/commercial-readiness";
import { ProductApprovalPanel, ProductLivePanel, StockRecordPanel } from "@/components/admin/product-live-panel";
import { liveSteps, storefrontLines, uncoveredReasons } from "@/lib/product-live";
import { sellableReasons } from "@/lib/services/admin/publish-guard";
import { explainProducts } from "@/lib/services/catalog-state";
import { PACK_SENSITIVE } from "@/lib/services/admin/catalogue-approval";
import { adminRecordCatalogueApproval } from "@/actions/catalogue-approval";
import { orderingOpen } from "@/lib/commerce-mode";
import { strictCatalogue } from "@/lib/deploy-env";
import { SERVICEABLE_WHERE } from "@/lib/serviceable-where";
import {
  adminAddVariant,
  adminCreateStockRecord,
  adminRecordCommercialReview,
  adminRemoveImage,
  adminSaveProductDetails,
  adminSetDefaultVariant,
  adminSetPrimaryImage,
  adminSetProductStatus,
  adminSetVariantActive,
} from "@/actions/product-details";

export const dynamic = "force-dynamic";

export default async function AdminProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  /* Backstop for the layout gate: a request that renders only this page
     segment never ran app/admin/layout.tsx, so the page checks too. */
  if (!(await getAdminUser())) return null;
  const { slug } = await params;

  const [product, brands, warehouses] = await Promise.all([
    db.product.findUnique({
      where: { slug },
      select: {
        id: true,
        title: true,
        slug: true,
        status: true,
        brandId: true,
        deliverySpeed: true,
        description: true,
        unitLabel: true,
        specs: true,
        commercialReview: true,
        updatedAt: true,
        identityConfirmed: true,
        identityApprovedAt: true,
        identityApprovalReason: true,
        brand: { select: { name: true, isActive: true } },
        category: { select: { slug: true, name: true, group: true, isBulk: true, isActive: true } },
        images: {
          orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
          select: { id: true, url: true, alt: true, isPrimary: true, identityApproved: true, approvalStatus: true, licence: true, sha256: true },
        },
        variants: {
          orderBy: [{ isDefault: "desc" }, { name: "asc" }],
          select: {
            id: true,
            name: true,
            sku: true,
            pricePaise: true,
            compareAtPaise: true,
            isActive: true,
            isDefault: true,
            inventory: {
              select: {
                qtyOnHand: true,
                qtyReserved: true,
                lowStockThreshold: true,
                warehouse: { select: { id: true, name: true, city: true, isActive: true } },
              },
            },
          },
        },
      },
    }),
    /* Only active brands: an inactive one is retired, and assigning a product
       to it would hide the product from the storefront by a side door. */
    db.brand.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.warehouse.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  if (!product) notFound();

  /* Tax is read, never written, from the category's owner-confirmed config —
     see the note the editor renders alongside it. */
  const tax = CATEGORY_TAX_CONFIGS[product.category.slug] ?? null;

  /* The offer as stored, the review on file, and what the server says still
     stops a sale — the same check the cart and checkout run. */
  const [offer, blockers] = await Promise.all([currentOffer(db, product.id), validateCommercialReadiness(db, product.id)]);
  const onFile = commercialReviewSchema.safeParse(product.commercialReview);

  /* The top panel: the publish gate's own reasons, the storefront rule's own
     answer, and the two things neither covers — stock on hand and the delivery
     area. Read-only; lib/product-live.ts only arranges what these return. */
  const [gateReasons, states, serviceablePincodes] = await Promise.all([
    sellableReasons(db, product.id),
    explainProducts([product.id]),
    db.serviceablePincode.count({ where: SERVICEABLE_WHERE }),
  ]);
  const activeVariants = product.variants.filter((v) => v.isActive);
  const lead = product.images.find((i) => i.isPrimary) ?? null;
  const approvedDecision = (i: { identityApproved: boolean; approvalStatus: string }) =>
    i.identityApproved && (i.approvalStatus === "APPROVED_EXACT" || i.approvalStatus === "APPROVED_WITH_LIMITATION");
  const leadApproved = lead ? approvedDecision(lead) : false;
  const identityOk = product.identityConfirmed && product.identityApprovedAt !== null;
  const reviewIssues = blockers.filter((b) => /review|Delivery classification/i.test(b));
  const steps = liveSteps({
    slug: product.slug,
    hasLeadPhoto: lead !== null,
    leadPhotoApproved: leadApproved,
    licenceUnattested:
      lead !== null && strictCatalogue() && !(ATTESTED_IMAGE_LICENCES as readonly string[]).includes(lead.licence ?? ""),
    identityConfirmed: identityOk,
    variants: activeVariants.map((v) => ({
      sku: v.sku,
      name: v.name,
      isDefault: v.isDefault,
      pricePaise: v.pricePaise,
      compareAtPaise: v.compareAtPaise,
      hasStockRecord: v.inventory.some((i) => i.warehouse.isActive),
    })),
    deliverySpeed: product.deliverySpeed,
    taxConfigured: tax !== null,
    categoryName: product.category.name,
    reviewCurrent: onFile.success && reviewIssues.length === 0,
    reviewOnFile: onFile.success,
  });
  const state = states.get(product.id) ?? { visible: false, purchasable: false, action: "hidden" as const, reasons: [] };
  const defaultVariant = activeVariants.find((v) => v.isDefault);
  const storefront = storefrontLines({
    status: product.status,
    state,
    categoryName: product.category.name,
    categoryActive: product.category.isActive,
    brandName: product.brand.name,
    brandActive: product.brand.isActive,
    availableUnits:
      defaultVariant?.inventory.filter((i) => i.warehouse.isActive).reduce((sum, i) => sum + (i.qtyOnHand - i.qtyReserved), 0) ?? 0,
    orderingOpen: orderingOpen(),
    serviceablePincodes,
  });

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link
          href="/admin/products"
          className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-500 no-underline hover:underline"
        >
          ← Products
        </Link>
        <h1 className="mt-1 text-[22px] font-extrabold tracking-tight">{product.title}</h1>
        <p className="mt-0.5 text-[11px] font-semibold text-ink-500">
          {product.variants.length} variant{product.variants.length === 1 ? "" : "s"} ·{" "}
          {product.category.name}
        </p>
      </div>

      <ProductLivePanel
        productId={product.id}
        slug={product.slug}
        status={product.status}
        steps={steps}
        otherReasons={uncoveredReasons(gateReasons)}
        storefront={{ ...storefront, visible: state.visible }}
        setStatus={adminSetProductStatus}
      />

      <ProductEditor
        brands={brands}
        product={{
          id: product.id,
          title: product.title,
          slug: product.slug,
          status: product.status,
          brandId: product.brandId,
          categoryName: product.category.name,
          categoryGroup: product.category.group,
          categoryIsBulk: product.category.isBulk,
          deliverySpeed: product.deliverySpeed ?? "",
          hsn: tax?.hsn ?? null,
          gstRatePct: tax?.ratePct ?? null,
          variants: product.variants.map((v) => ({
            id: v.id,
            name: v.name,
            sku: v.sku,
            pricePaise: v.pricePaise,
            compareAtPaise: v.compareAtPaise,
            onHand: v.inventory.reduce((s, i) => s + (i.qtyOnHand - i.qtyReserved), 0),
            /* Per warehouse, not just the total. The artboard's "Stock by
               warehouse" panel is where a reorder decision gets made, and a
               single number cannot say which shed is empty. */
            stock: v.inventory.map((i) => ({
              warehouseId: i.warehouse.id,
              warehouse: i.warehouse.name,
              city: i.warehouse.city,
              onHand: i.qtyOnHand,
              committed: i.qtyReserved,
              lowStockThreshold: i.lowStockThreshold,
            })),
          })),
        }}
      />

      <DetailsPanel
        productId={product.id}
        description={product.description ?? ""}
        unitLabel={product.unitLabel}
        specs={specRows(product.specs)}
        save={adminSaveProductDetails}
      />
      <VariantsPanel
        productId={product.id}
        variants={product.variants.map((v) => ({
          id: v.id,
          name: v.name,
          sku: v.sku,
          price: formatPaise(v.pricePaise),
          isActive: v.isActive,
          isDefault: v.isDefault,
        }))}
        warehouses={warehouses}
        add={adminAddVariant}
        setActive={adminSetVariantActive}
        setDefault={adminSetDefaultVariant}
      />
      <PhotosPanel
        slug={product.slug}
        photos={product.images.map((i) => ({
          id: i.id,
          url: i.url,
          alt: i.alt,
          isPrimary: i.isPrimary,
          /* The approval decision only; what a customer sees is approvedImageWhere() (lib/catalog-policy.ts). */
          approved: i.identityApproved && (i.approvalStatus === "APPROVED_EXACT" || i.approvalStatus === "APPROVED_WITH_LIMITATION"),
          licence: i.licence,
        }))}
        licences={ATTESTED_IMAGE_LICENCES}
        uploadEnabled={Boolean(process.env.NEXT_PUBLIC_PRODUCT_IMAGE_BASE)}
        setPrimary={adminSetPrimaryImage}
        remove={adminRemoveImage}
      />
      <StockRecordPanel
        variants={activeVariants
          .filter((v) => !v.inventory.some((i) => i.warehouse.isActive))
          .map((v) => ({ id: v.id, name: v.name, sku: v.sku }))}
        warehouses={warehouses}
        create={adminCreateStockRecord}
      />
      <ProductApprovalPanel
        productId={product.id}
        title={product.title}
        photo={lead ? { id: lead.id, url: lead.url, sha256: lead.sha256 } : null}
        approved={identityOk && leadApproved}
        approvalNote={product.identityApprovalReason}
        updatedAt={product.updatedAt.toISOString()}
        packSensitive={PACK_SENSITIVE.test(product.title)}
        record={adminRecordCatalogueApproval}
      />
      {offer && (
        <CommercialReviewPanel
          productId={product.id}
          offer={offer}
          review={onFile.success ? { by: onFile.data.approvedBy, at: onFile.data.approvedAt } : null}
          blockers={blockers}
          record={adminRecordCommercialReview}
        />
      )}
    </div>
  );
}

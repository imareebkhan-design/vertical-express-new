import "server-only";
import { db } from "@/lib/db";
import { Prisma, PaymentMethod, OrderStatus } from "@prisma/client";

export interface BiFilters {
  startDate?: Date;
  endDate?: Date;
  warehouseId?: string;
  brandId?: string;
  categoryId?: string;
  paymentMethod?: string;
  customerType?: "new" | "returning";
  orderStatus?: string;
  couponCode?: string;
  productId?: string;
}

export interface BiDashboardData {
  filters: {
    warehouses: { id: string; name: string }[];
    brands: { id: string; name: string }[];
    categories: { id: string; slug: string }[];
    products: { id: string; title: string }[];
  };
  sales: {
    grossSalesPaise: number;
    netSalesPaise: number;
    discountsPaise: number;
    gstPaise: number;
    shippingPaise: number;
    aovPaise: number;
    ordersCount: number;
    growthPct: number;
    refundsPaise: number;
    cashbackIssuedPaise: number;
    dailySales: { label: string; gross: number; net: number }[];
  };
  orders: {
    pending: number;
    confirmed: number;
    packed: number;
    outForDelivery: number;
    delivered: number;
    cancelled: number;
    failedPayments: number;
    avgProcessingMinutes: number;
    avgDeliveryMinutes: number;
    cancelledReasons: { label: string; value: number }[];
  };
  products: {
    topSelling: { title: string; qty: number; revenuePaise: number }[];
    worstSelling: { title: string; qty: number; revenuePaise: number }[];
    topCategories: { label: string; value: number }[];
    topBrands: { label: string; value: number }[];
    highestRevenue: { title: string; revenuePaise: number }[];
    mostReturned: { title: string; qty: number }[];
    recentlyAdded: { title: string; createdAt: Date }[];
    neverSold: { title: string; sku: string }[];
  };
  inventory: {
    totalValuePaise: number;
    outOfStockCount: number;
    lowStockCount: number;
    deadStockCount: number;
    utilizationPct: number;
    turnoverRate: number;
    aging: { label: string; value: number }[]; // [0-30 days, 31-90 days, 90+ days]
    fastMoving: { title: string; qtyOnHand: number; soldQty: number }[];
    slowMoving: { title: string; qtyOnHand: number; soldQty: number }[];
  };
  customers: {
    newCount: number;
    returningCount: number;
    repeatPurchaseRate: number;
    ltvAvgPaise: number;
    topCustomers: { name: string; email: string; ordersCount: number; totalSpentPaise: number }[];
    walletUsagePaise: number;
    couponUsageCount: number;
    growth: { label: string; count: number }[];
  };
  marketing: {
    coupons: { code: string; count: number; discountPaise: number }[];
    conversionRate: number;
    checkoutDropoffCount: number;
    cartAbandonmentCount: number;
    topSearches: { term: string; count: number }[];
    noResultSearches: { term: string; count: number }[];
  };
  finance: {
    revenuePaise: number;
    taxesPaise: number;
    walletLiabilityPaise: number;
    refundsPaise: number;
    cashFlowPaise: number;
    gatewaySettlementPaise: number;
    outstandingPaise: number;
  };
  operations: {
    warehousePerf: { name: string; count: number; valuePaise: number }[];
    avgFulfillmentMinutes: number;
    packingSlaPct: number;
    deliverySlaPct: number;
    hourlyActivity: { day: string; hour: number; value: number }[];
  };
}

export async function getBiData(filters: BiFilters): Promise<BiDashboardData> {
  const now = new Date();
  
  // 1. Resolve date boundaries (defaults to past 30 days)
  const endDate = filters.endDate || new Date();
  const startDate = filters.startDate || new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const durationMs = endDate.getTime() - startDate.getTime();
  const prevStartDate = new Date(startDate.getTime() - durationMs);
  const prevEndDate = new Date(startDate.getTime() - 1);

  // 2. Fetch dimension filters
  const [warehouses, brands, categories, products] = await Promise.all([
    db.warehouse.findMany({ select: { id: true, name: true } }),
    db.brand.findMany({ select: { id: true, name: true } }),
    db.category.findMany({ select: { id: true, slug: true } }),
    db.product.findMany({ select: { id: true, title: true }, take: 100 }),
  ]);

  // 3. Build main order query where condition
  const orderWhere: Prisma.OrderWhereInput = {
    placedAt: { gte: startDate, lte: endDate },
  };

  if (filters.warehouseId) {
    orderWhere.warehouseId = filters.warehouseId;
  }
  if (filters.paymentMethod) {
    orderWhere.paymentMethod = filters.paymentMethod as PaymentMethod;
  }
  if (filters.orderStatus) {
    orderWhere.status = filters.orderStatus as OrderStatus;
  }
  if (filters.couponCode) {
    orderWhere.couponCode = { equals: filters.couponCode, mode: "insensitive" };
  }
  if (filters.productId || filters.brandId || filters.categoryId) {
    orderWhere.items = {
      some: {
        ...(filters.productId ? { variantId: filters.productId } : {}),
        variant: {
          product: {
            ...(filters.brandId ? { brandId: filters.brandId } : {}),
            ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
          },
        },
      },
    };
  }

  // 4. Query matching orders
  const orders = await db.order.findMany({
    where: orderWhere,
    include: {
      items: {
        include: {
          variant: {
            include: {
              product: {
                include: {
                  brand: true,
                  category: true,
                },
              },
            },
          },
        },
      },
      user: {
        include: {
          orders: { select: { id: true } },
        },
      },
      statusEvents: true,
      payments: true,
    },
    orderBy: { placedAt: "asc" },
  });

  // Apply customer type filtering if requested
  let filteredOrders = orders;
  if (filters.customerType) {
    filteredOrders = orders.filter((o) => {
      const isNew = o.user.orders.length <= 1;
      return filters.customerType === "new" ? isNew : !isNew;
    });
  }

  // 5. Query previous period orders for revenue growth comparison
  const prevOrderWhere: Prisma.OrderWhereInput = {
    placedAt: { gte: prevStartDate, lte: prevEndDate },
    status: { notIn: ["cancelled", "refunded"] },
  };
  const prevPeriodOrders = await db.order.findMany({
    where: prevOrderWhere,
    select: { totalPaise: true },
  });
  const prevPeriodNet = prevPeriodOrders.reduce((sum, o) => sum + o.totalPaise, 0);

  // 6. Compute Sales & Finance details
  let grossSales = 0;
  let discounts = 0;
  let gstCollected = 0;
  let shippingRevenue = 0;
  let refunds = 0;
  const orderCount = filteredOrders.length;

  const dailyMap = new Map<string, { gross: number; net: number }>();
  
  // Seed dates in daily map
  for (let d = new Date(startDate.getTime()); d <= endDate; d.setDate(d.getDate() + 1)) {
    const key = d.toISOString().split("T")[0];
    dailyMap.set(key, { gross: 0, net: 0 });
  }

  for (const o of filteredOrders) {
    const isCancelled = o.status === "cancelled";
    const isRefunded = o.status === "refunded" || o.status === "refund_initiated";

    const oGross = o.items.reduce((sum, item) => sum + (item.lineTotalPaise ?? 0), 0);
    const oDiscount = o.discountPaise;
    const oTax = o.taxPaise;
    const oShipping = o.deliveryFeePaise;
    const oNet = o.totalPaise;

    grossSales += oGross;
    discounts += oDiscount;
    gstCollected += oTax;
    shippingRevenue += oShipping;

    if (isRefunded) {
      refunds += oNet;
    }

    const dayKey = o.placedAt.toISOString().split("T")[0];
    const dayData = dailyMap.get(dayKey) || { gross: 0, net: 0 };
    dayData.gross += oGross;
    dayData.net += isCancelled ? 0 : oNet;
    dailyMap.set(dayKey, dayData);
  }

  const netSales = Math.max(0, grossSales - discounts + gstCollected + shippingRevenue - refunds);
  const growthPct = prevPeriodNet > 0 ? Math.round(((netSales - prevPeriodNet) / prevPeriodNet) * 100) : 0;
  
  // Cashback Issued during the range
  const cashbackTx = await db.walletTransaction.aggregate({
    where: {
      type: "cashback_credit",
      createdAt: { gte: startDate, lte: endDate },
    },
    _sum: { amountPaise: true },
  });
  const cashbackIssued = cashbackTx._sum.amountPaise ?? 0;

  // Wallet Liability
  const walletAgg = await db.wallet.aggregate({
    _sum: { balancePaise: true },
  });
  const walletLiability = walletAgg._sum.balancePaise ?? 0;

  const dailySales = Array.from(dailyMap.entries()).map(([label, val]) => ({
    label,
    gross: val.gross,
    net: val.net,
  }));

  // 7. Orders statuses
  let pending = 0, confirmed = 0, packed = 0, outForDelivery = 0, delivered = 0, cancelled = 0;
  let totalFulfillMin = 0, fulfillCount = 0;
  let totalDeliveryMin = 0, deliveryCount = 0;
  const cancelledReasonMap = new Map<string, number>();

  for (const o of filteredOrders) {
    if (o.status === "pending_payment") pending++;
    else if (o.status === "confirmed") confirmed++;
    else if (o.status === "packed") packed++;
    else if (o.status === "out_for_delivery") outForDelivery++;
    else if (o.status === "delivered") delivered++;
    else if (o.status === "cancelled") {
      cancelled++;
      const reason = o.cancelledReason || "Unspecified";
      cancelledReasonMap.set(reason, (cancelledReasonMap.get(reason) || 0) + 1);
    }

    const packedEv = o.statusEvents.find((e) => e.toStatus === "packed");
    const deliveredEv = o.statusEvents.find((e) => e.toStatus === "delivered");

    if (packedEv) {
      totalFulfillMin += (packedEv.createdAt.getTime() - o.placedAt.getTime()) / (1000 * 60);
      fulfillCount++;
    }
    if (packedEv && deliveredEv) {
      totalDeliveryMin += (deliveredEv.createdAt.getTime() - packedEv.createdAt.getTime()) / (1000 * 60);
      deliveryCount++;
    }
  }

  const failedPayments = await db.payment.count({
    where: {
      status: "failed",
      createdAt: { gte: startDate, lte: endDate },
    },
  });

  const cancelledReasons = Array.from(cancelledReasonMap.entries()).map(([label, value]) => ({
    label,
    value,
  }));

  // 8. Products analysis
  const prodSalesMap = new Map<string, { qty: number; rev: number; returns: number }>();
  const catSalesMap = new Map<string, number>();
  const brandSalesMap = new Map<string, number>();

  for (const o of filteredOrders) {
    const isRefunded = o.status === "refunded" || o.status === "refund_initiated";
    for (const item of o.items) {
      const title = item.title;
      const data = prodSalesMap.get(title) || { qty: 0, rev: 0, returns: 0 };
      data.qty += item.qty;
      data.rev += item.totalPaise ?? 0;
      if (isRefunded) {
        data.returns += item.qty;
      }
      prodSalesMap.set(title, data);

      const cat = item.variant.product.category.slug;
      catSalesMap.set(cat, (catSalesMap.get(cat) || 0) + (item.totalPaise ?? 0));

      const brand = item.variant.product.brand.name;
      brandSalesMap.set(brand, (brandSalesMap.get(brand) || 0) + (item.totalPaise ?? 0));
    }
  }

  const prodList = Array.from(prodSalesMap.entries()).map(([title, val]) => ({
    title,
    qty: val.qty,
    revenuePaise: val.rev,
    returns: val.returns,
  }));

  const topSelling = [...prodList].sort((a, b) => b.qty - a.qty).slice(0, 5);
  const worstSelling = [...prodList].filter(p => p.qty > 0).sort((a, b) => a.qty - b.qty).slice(0, 5);
  const highestRevenue = [...prodList].sort((a, b) => b.revenuePaise - a.revenuePaise).slice(0, 5);
  const mostReturned = [...prodList].filter(p => p.returns > 0).sort((a, b) => b.returns - a.returns).map(p => ({ title: p.title, qty: p.returns })).slice(0, 5);

  const topCategories = Array.from(catSalesMap.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 5);
  const topBrands = Array.from(brandSalesMap.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 5);

  const recentlyAddedRaw = await db.product.findMany({
    where: { status: "published" },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { title: true, createdAt: true },
  });
  const recentlyAdded = recentlyAddedRaw.map(p => ({ title: p.title, createdAt: p.createdAt }));

  // Never Sold Products
  const soldProductIds = new Set<string>();
  for (const o of filteredOrders) {
    for (const item of o.items) {
      soldProductIds.add(item.variant.productId);
    }
  }
  const neverSoldRaw = await db.product.findMany({
    where: {
      status: "published",
      id: { notIn: Array.from(soldProductIds) },
    },
    select: { title: true, slug: true },
    take: 10,
  });
  const neverSold = neverSoldRaw.map(p => ({ title: p.title, sku: p.slug }));

  // 9. Inventory Details
  const variants = await db.productVariant.findMany({
    include: {
      inventory: true,
      product: {
        select: { title: true, createdAt: true },
      },
    },
  });

  let totalInventoryValue = 0;
  let outOfStockCount = 0;
  let lowStockCount = 0;
  let activeInvCount = 0;
  let age0_30 = 0, age31_90 = 0, age91_plus = 0;

  const invList = variants.map((v) => {
    const qty = v.inventory.reduce((sum, i) => sum + i.qtyOnHand, 0);
    const value = qty * v.pricePaise;
    totalInventoryValue += value;

    if (qty === 0) outOfStockCount++;
    else if (qty <= 10) lowStockCount++;
    
    activeInvCount += qty;

    const daysOld = (now.getTime() - v.product.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    if (daysOld <= 30) age0_30 += qty;
    else if (daysOld <= 90) age31_90 += qty;
    else age91_plus += qty;

    const sold = prodSalesMap.get(v.product.title)?.qty || 0;

    return {
      title: v.product.title,
      qtyOnHand: qty,
      soldQty: sold,
    };
  });

  const deadStockCount = invList.filter(i => i.qtyOnHand > 0 && i.soldQty === 0).length;
  
  // Utilization: total stock divided by warehouse capacity limit
  const warehouseCount = warehouses.length || 1;
  const capacityLimit = warehouseCount * 10000;
  const utilizationPct = Math.round(Math.min(100, (activeInvCount / capacityLimit) * 100));

  // Turnover rate: Cost of goods sold / average inventory value
  const turnoverRate = totalInventoryValue > 0 ? Number((netSales / totalInventoryValue).toFixed(2)) : 0;

  const aging = [
    { label: "0-30 Days", value: age0_30 },
    { label: "31-90 Days", value: age31_90 },
    { label: "90+ Days", value: age91_plus },
  ];

  const fastMoving = [...invList].sort((a, b) => b.soldQty - a.soldQty).slice(0, 5);
  const slowMoving = [...invList].filter(i => i.soldQty > 0).sort((a, b) => a.soldQty - b.soldQty).slice(0, 5);

  // 10. Customer Growth & Retention
  const totalCustomers = await db.user.count({ where: { role: "customer" } });
  
  const customerOrdersAgg = filteredOrders.reduce((map, o) => {
    const data = map.get(o.userId) || { count: 0, spent: 0, email: o.user.email || "unknown", name: o.user.phone || "User" };
    data.count++;
    data.spent += o.totalPaise;
    map.set(o.userId, data);
    return map;
  }, new Map<string, { count: number; spent: number; email: string; name: string }>());

  const repeatCustomersCount = Array.from(customerOrdersAgg.values()).filter((c) => c.count > 1).length;
  const repeatPurchaseRate = customerOrdersAgg.size > 0 ? Math.round((repeatCustomersCount / customerOrdersAgg.size) * 100) : 0;

  const topCustomers = Array.from(customerOrdersAgg.entries()).map(([, val]) => ({
    name: val.name,
    email: val.email,
    ordersCount: val.count,
    totalSpentPaise: val.spent,
  })).sort((a, b) => b.totalSpentPaise - a.totalSpentPaise).slice(0, 5);

  // Calculate Customer Growth (cumulative monthly signups)
  const users = await db.user.findMany({
    where: { role: "customer" },
    select: { createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  const growthMap = new Map<string, number>();
  let cumCount = 0;
  for (const u of users) {
    const key = u.createdAt.toISOString().substring(0, 7); // YYYY-MM
    cumCount++;
    growthMap.set(key, cumCount);
  }

  const customerGrowth = Array.from(growthMap.entries()).map(([label, count]) => ({
    label,
    count,
  }));

  // 11. Marketing performance
  const couponMap = new Map<string, { count: number; discount: number }>();
  let couponUsageCount = 0;
  for (const o of filteredOrders) {
    if (o.couponCode) {
      couponUsageCount++;
      const data = couponMap.get(o.couponCode) || { count: 0, discount: 0 };
      data.count++;
      data.discount += o.discountPaise;
      couponMap.set(o.couponCode, data);
    }
  }

  const couponsList = Array.from(couponMap.entries()).map(([code, val]) => ({
    code,
    count: val.count,
    discountPaise: val.discount,
  })).sort((a, b) => b.count - a.count);

  // Mock marketing metrics for checkout funnel & search analytics
  const checkoutDropoffCount = Math.round(orderCount * 0.15);
  const cartAbandonmentCount = await db.cartItem.count();
  const checkoutStarted = orderCount + checkoutDropoffCount;
  const conversionRate = checkoutStarted > 0 ? Math.round((orderCount / checkoutStarted) * 100) : 100;

  // Mock popular searches
  const topSearches = [
    { term: "cement", count: 320 },
    { term: "paint", count: 245 },
    { term: "tmt bars", count: 180 },
    { term: "bricks", count: 140 },
    { term: "sealant", count: 95 },
  ];
  const noResultSearches = [
    { term: "drill machine", count: 35 },
    { term: "solar tiles", count: 18 },
    { term: "wooden logs", count: 12 },
    { term: "excavator lease", count: 5 },
  ];

  // 12. Operations Performance
  const warehousePerfMap = new Map<string, { count: number; value: number }>();
  for (const o of filteredOrders) {
    if (o.warehouseId) {
      const name = warehouses.find(w => w.id === o.warehouseId)?.name || "Default Warehouse";
      const data = warehousePerfMap.get(name) || { count: 0, value: 0 };
      data.count++;
      data.value += o.totalPaise;
      warehousePerfMap.set(name, data);
    }
  }

  const warehousePerf = Array.from(warehousePerfMap.entries()).map(([name, val]) => ({
    name,
    count: val.count,
    valuePaise: val.value,
  }));

  // Fulfillment SLA percentage (packed under 120 minutes / 2 hours)
  const packingSlaLimit = 120;
  const deliverySlaLimit = 240; // 4 hours

  let packingSlaCount = 0;
  let deliverySlaCount = 0;

  for (const o of filteredOrders) {
    const events = o.statusEvents;
    const packedEv = events.find(e => e.toStatus === "packed");
    const deliveredEv = events.find(e => e.toStatus === "delivered");

    if (packedEv) {
      const elapsed = (packedEv.createdAt.getTime() - o.placedAt.getTime()) / (1000 * 60);
      if (elapsed <= packingSlaLimit) packingSlaCount++;
    }
    if (packedEv && deliveredEv) {
      const elapsed = (deliveredEv.createdAt.getTime() - packedEv.createdAt.getTime()) / (1000 * 60);
      if (elapsed <= deliverySlaLimit) deliverySlaCount++;
    }
  }

  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const hours = [9, 12, 15, 18, 21];
  const hourlyActivity: { day: string; hour: number; value: number }[] = [];

  for (const day of days) {
    for (const hr of hours) {
      hourlyActivity.push({ day, hour: hr, value: 0 });
    }
  }

  for (const o of filteredOrders) {
    const dayIndex = (o.placedAt.getDay() + 6) % 7;
    const day = days[dayIndex] || "Mon";
    const hr = o.placedAt.getHours();
    const matchedHour = hours.reduce((prev, curr) =>
      Math.abs(curr - hr) < Math.abs(prev - hr) ? curr : prev
    );
    const cell = hourlyActivity.find((c) => c.day === day && c.hour === matchedHour);
    if (cell) cell.value++;
  }

  const packingSlaPct = fulfillCount > 0 ? Math.round((packingSlaCount / fulfillCount) * 100) : 100;
  const deliverySlaPct = deliveryCount > 0 ? Math.round((deliverySlaCount / deliveryCount) * 100) : 100;

  // 13. Finance Cash Flows
  const walletUsagePaise = filteredOrders.reduce((sum, o) => {
    return sum + (o.paymentMethod === "cod" ? 0 : o.totalPaise); // non-cod is wallet or gateway payments
  }, 0);
  const outstandingPaise = filteredOrders.filter(o => o.status === "pending_payment").reduce((sum, o) => sum + o.totalPaise, 0);

  return {
    filters: {
      warehouses,
      brands,
      categories,
      products,
    },
    sales: {
      grossSalesPaise: grossSales,
      netSalesPaise: netSales,
      discountsPaise: discounts,
      gstPaise: gstCollected,
      shippingPaise: shippingRevenue,
      aovPaise: orderCount > 0 ? Math.round(netSales / orderCount) : 0,
      ordersCount: orderCount,
      growthPct,
      refundsPaise: refunds,
      cashbackIssuedPaise: cashbackIssued,
      dailySales,
    },
    orders: {
      pending,
      confirmed,
      packed,
      outForDelivery,
      delivered,
      cancelled,
      failedPayments,
      avgProcessingMinutes: fulfillCount > 0 ? Math.round(totalFulfillMin / fulfillCount) : 0,
      avgDeliveryMinutes: deliveryCount > 0 ? Math.round(totalDeliveryMin / deliveryCount) : 0,
      cancelledReasons,
    },
    products: {
      topSelling,
      worstSelling,
      topCategories,
      topBrands,
      highestRevenue,
      mostReturned,
      recentlyAdded,
      neverSold,
    },
    inventory: {
      totalValuePaise: totalInventoryValue,
      outOfStockCount,
      lowStockCount,
      deadStockCount,
      utilizationPct,
      turnoverRate,
      aging,
      fastMoving,
      slowMoving,
    },
    customers: {
      newCount: filteredOrders.filter(o => o.user.orders.length <= 1).length,
      returningCount: filteredOrders.filter(o => o.user.orders.length > 1).length,
      repeatPurchaseRate,
      ltvAvgPaise: totalCustomers > 0 ? Math.round(netSales / totalCustomers) : 0,
      topCustomers,
      walletUsagePaise: walletUsagePaise,
      couponUsageCount,
      growth: customerGrowth,
    },
    marketing: {
      coupons: couponsList,
      conversionRate,
      checkoutDropoffCount,
      cartAbandonmentCount,
      topSearches,
      noResultSearches,
    },
    finance: {
      revenuePaise: netSales,
      taxesPaise: gstCollected,
      walletLiabilityPaise: walletLiability,
      refundsPaise: refunds,
      cashFlowPaise: netSales - refunds,
      gatewaySettlementPaise: Math.round(netSales * 0.98), // 2% gateway fee assumption
      outstandingPaise,
    },
    operations: {
      warehousePerf,
      avgFulfillmentMinutes: fulfillCount > 0 ? Math.round(totalFulfillMin / fulfillCount) : 0,
      packingSlaPct,
      deliverySlaPct,
      hourlyActivity,
    },
  };
}

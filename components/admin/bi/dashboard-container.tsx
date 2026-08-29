"use client";

import React, { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  KpiCard,
  LineChart,
  BarChart,
  DonutChart,
  Heatmap,
} from "./charts";
import { exportToCsv, triggerPrintReport } from "@/lib/services/admin/exports";
import { BiDashboardData } from "@/lib/services/admin/bi";
import { formatPaise } from "@/lib/money";

export function DashboardContainer({ initialData }: { initialData: BiDashboardData }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<
    "executive" | "sales" | "inventory" | "customers" | "marketing" | "operations"
  >("executive");

  // Local filter states matching URL params
  const [startDate, setStartDate] = useState(searchParams.get("startDate") || "");
  const [endDate, setEndDate] = useState(searchParams.get("endDate") || "");
  const [warehouseId, setWarehouseId] = useState(searchParams.get("warehouseId") || "");
  const [brandId, setBrandId] = useState(searchParams.get("brandId") || "");
  const [categoryId, setCategoryId] = useState(searchParams.get("categoryId") || "");
  const [paymentMethod, setPaymentMethod] = useState(searchParams.get("paymentMethod") || "");
  const [orderStatus, setOrderStatus] = useState(searchParams.get("orderStatus") || "");
  const [couponCode, setCouponCode] = useState(searchParams.get("couponCode") || "");
  const [customerType, setCustomerType] = useState(searchParams.get("customerType") || "");

  const handleApplyFilters = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    if (warehouseId) params.set("warehouseId", warehouseId);
    if (brandId) params.set("brandId", brandId);
    if (categoryId) params.set("categoryId", categoryId);
    if (paymentMethod) params.set("paymentMethod", paymentMethod);
    if (orderStatus) params.set("orderStatus", orderStatus);
    if (couponCode) params.set("couponCode", couponCode);
    if (customerType) params.set("customerType", customerType);

    router.push(`/admin/bi?${params.toString()}`);
  };

  const handleClearFilters = () => {
    setStartDate("");
    setEndDate("");
    setWarehouseId("");
    setBrandId("");
    setCategoryId("");
    setPaymentMethod("");
    setOrderStatus("");
    setCouponCode("");
    setCustomerType("");
    router.push("/admin/bi");
  };

  // Exporters
  const handleExportSales = () => {
    const headers = ["Date", "Gross Sales (Rs)", "Net Sales (Rs)"];
    const rows = initialData.sales.dailySales.map((d) => [
      d.label,
      (d.gross / 100).toFixed(2),
      (d.net / 100).toFixed(2),
    ]);
    exportToCsv("sales_report.csv", headers, rows);
  };

  const handleExportInventory = () => {
    const headers = ["Product Name", "Qty On Hand", "Qty Sold"];
    const rows = initialData.inventory.fastMoving.map((p) => [
      p.title,
      p.qtyOnHand,
      p.soldQty,
    ]);
    exportToCsv("inventory_report.csv", headers, rows);
  };

  const handleExportCustomers = () => {
    const headers = ["Name", "Email", "Orders Count", "Total Spent (Rs)"];
    const rows = initialData.customers.topCustomers.map((c) => [
      c.name,
      c.email,
      c.ordersCount,
      (c.totalSpentPaise / 100).toFixed(2),
    ]);
    exportToCsv("customers_report.csv", headers, rows);
  };

  // Sparkline data generators
  const salesSparkline = initialData.sales.dailySales.map((d) => d.net);

  return (
    <div className="flex flex-col gap-6">
      {/* 1. Header with Title & Export Actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-neutral-900 sm:text-3xl">
            Executive BI & Analytics
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Real-time business intelligence dashboard and sales summaries.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={triggerPrintReport}
            className="inline-flex items-center rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm font-bold text-neutral-700 hover:bg-neutral-50 transition-colors"
          >
            PDF / Print
          </button>
          <button
            onClick={() => {
              if (activeTab === "inventory") handleExportInventory();
              else if (activeTab === "customers") handleExportCustomers();
              else handleExportSales();
            }}
            className="inline-flex items-center rounded-full bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 transition-colors"
          >
            Export CSV
          </button>
        </div>
      </div>

      {/* 2. Filters Accordion / Panel */}
      <div className="rounded-card-lg border border-neutral-100 bg-white p-5 shadow-sm print:hidden">
        <h2 className="text-xs font-extrabold uppercase tracking-wider text-neutral-400 mb-4">
          Report Filters
        </h2>
        <form onSubmit={handleApplyFilters} className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {/* Date range inputs */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-neutral-400">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="rounded-full border border-neutral-200 px-3 py-1.5 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-neutral-400">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="rounded-full border border-neutral-200 px-3 py-1.5 text-sm"
            />
          </div>

          {/* Warehouse Dropdown */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-neutral-400">Warehouse</label>
            <select
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
              className="rounded-full border border-neutral-200 px-3 py-1.5 text-sm"
            >
              <option value="">All Warehouses</option>
              {initialData.filters.warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>

          {/* Brand Dropdown */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-neutral-400">Brand</label>
            <select
              value={brandId}
              onChange={(e) => setBrandId(e.target.value)}
              className="rounded-full border border-neutral-200 px-3 py-1.5 text-sm"
            >
              <option value="">All Brands</option>
              {initialData.filters.brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          {/* Category Dropdown */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-neutral-400">Category</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="rounded-full border border-neutral-200 px-3 py-1.5 text-sm"
            >
              <option value="">All Categories</option>
              {initialData.filters.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.slug}
                </option>
              ))}
            </select>
          </div>

          {/* Payment Method */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-neutral-400">Payment Method</label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="rounded-full border border-neutral-200 px-3 py-1.5 text-sm"
            >
              <option value="">All Methods</option>
              <option value="razorpay">Razorpay</option>
              <option value="cod">COD</option>
              <option value="dummy">Dummy</option>
            </select>
          </div>

          {/* Order Status */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-neutral-400">Order Status</label>
            <select
              value={orderStatus}
              onChange={(e) => setOrderStatus(e.target.value)}
              className="rounded-full border border-neutral-200 px-3 py-1.5 text-sm"
            >
              <option value="">All Statuses</option>
              <option value="pending_payment">Pending Payment</option>
              <option value="confirmed">Confirmed</option>
              <option value="packed">Packed</option>
              <option value="out_for_delivery">Out for Delivery</option>
              <option value="delivered">Delivered</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          {/* Customer Type */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-neutral-400">Customer Type</label>
            <select
              value={customerType}
              onChange={(e) => setCustomerType(e.target.value)}
              className="rounded-full border border-neutral-200 px-3 py-1.5 text-sm"
            >
              <option value="">All Customers</option>
              <option value="new">New Customers</option>
              <option value="returning">Returning Customers</option>
            </select>
          </div>

          {/* Coupon Code Filter */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-neutral-400">Coupon Code</label>
            <input
              type="text"
              placeholder="e.g. SAVE10"
              value={couponCode}
              onChange={(e) => setCouponCode(e.target.value)}
              className="rounded-full border border-neutral-200 px-3 py-1.5 text-sm uppercase"
            />
          </div>

          {/* Action buttons */}
          <div className="flex items-end gap-2 sm:col-span-3 lg:col-span-1">
            <button
              type="submit"
              className="flex-1 rounded-full bg-neutral-900 px-3 py-2 text-sm font-bold text-white hover:bg-neutral-800 transition-colors"
            >
              Filter
            </button>
            <button
              type="button"
              onClick={handleClearFilters}
              className="rounded-full border border-neutral-200 px-3 py-2 text-sm font-bold text-neutral-600 hover:bg-neutral-50 transition-colors"
            >
              Reset
            </button>
          </div>
        </form>
      </div>

      {/* 3. Navigation Tabs */}
      <div className="flex border-b border-neutral-200 overflow-x-auto print:hidden">
        {[
          { key: "executive", label: "Executive Summary" },
          { key: "sales", label: "Sales & Finance" },
          { key: "inventory", label: "Inventory" },
          { key: "customers", label: "Customers" },
          { key: "marketing", label: "Marketing" },
          { key: "operations", label: "Operations SLA" },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as "executive" | "sales" | "inventory" | "customers" | "marketing" | "operations")}
            className={`whitespace-nowrap px-4 py-3 text-sm font-extrabold border-b-2 transition-colors -mb-[2px] ${
              activeTab === tab.key
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-neutral-500 hover:text-ink"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 4. Tab Layout Content */}
      <div className="grid grid-cols-1 gap-6">
        {/* --- EXECUTIVE TAB --- */}
        {activeTab === "executive" && (
          <>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <KpiCard
                label="Gross Sales"
                value={formatPaise(initialData.sales.grossSalesPaise)}
                sparklineData={salesSparkline}
                change={{ value: initialData.sales.growthPct, type: initialData.sales.growthPct >= 0 ? "up" : "down" }}
                color="blue"
              />
              <KpiCard
                label="Orders count"
                value={initialData.sales.ordersCount}
                subValue={`AOV: ${formatPaise(initialData.sales.aovPaise)}`}
                color="emerald"
              />
              <KpiCard
                label="Repeat Purchase Rate"
                value={`${initialData.customers.repeatPurchaseRate}%`}
                subValue={`${initialData.customers.newCount} New / ${initialData.customers.returningCount} Ret`}
                color="violet"
              />
              <KpiCard
                label="Low Stock Alerts"
                value={initialData.inventory.lowStockCount}
                subValue={`${initialData.inventory.outOfStockCount} Out of stock`}
                color="rose"
              />
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div className="rounded-card-lg border border-neutral-100 bg-white p-5 shadow-sm lg:col-span-2">
                <h3 className="text-sm font-bold text-neutral-800 mb-4">Sales Trend</h3>
                <LineChart data={initialData.sales.dailySales.map(d => ({ label: d.label, value: d.net / 100 }))} prefix="₹" />
              </div>
              <div className="rounded-card-lg border border-neutral-100 bg-white p-5 shadow-sm">
                <h3 className="text-sm font-bold text-neutral-800 mb-4">Fulfillment SLA Status</h3>
                <DonutChart
                  data={[
                    { label: "SLA Compliant", value: initialData.operations.packingSlaPct },
                    { label: "SLA Breaches", value: 100 - initialData.operations.packingSlaPct },
                  ]}
                  prefix="%"
                />
              </div>
            </div>

            <div className="rounded-card-lg border border-neutral-100 bg-white p-5 shadow-sm">
              <h3 className="text-sm font-bold text-neutral-800 mb-4">Top Performing Products</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-neutral-500">
                  <thead className="bg-neutral-50 text-[10px] font-extrabold uppercase tracking-wider text-neutral-400">
                    <tr>
                      <th className="px-4 py-3">Product Name</th>
                      <th className="px-4 py-3 text-right">Qty Sold</th>
                      <th className="px-4 py-3 text-right">Revenue (Rs)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 font-semibold text-neutral-700">
                    {initialData.products.topSelling.map((p, idx) => (
                      <tr key={idx} className="hover:bg-neutral-50/50">
                        <td className="px-4 py-3">{p.title}</td>
                        <td className="px-4 py-3 text-right">{p.qty}</td>
                        <td className="px-4 py-3 text-right">{formatPaise(p.revenuePaise)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* --- SALES & FINANCE TAB --- */}
        {activeTab === "sales" && (
          <>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <KpiCard label="GST Collected" value={formatPaise(initialData.sales.gstPaise)} color="amber" />
              <KpiCard label="Discounts Given" value={formatPaise(initialData.sales.discountsPaise)} color="rose" />
              <KpiCard label="Wallet Liability" value={formatPaise(initialData.finance.walletLiabilityPaise)} color="violet" />
              <KpiCard label="Cash Flow" value={formatPaise(initialData.finance.cashFlowPaise)} color="emerald" />
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="rounded-card-lg border border-neutral-100 bg-white p-5 shadow-sm">
                <h3 className="text-sm font-bold text-neutral-800 mb-4">Revenue Breakdown by Category</h3>
                <DonutChart data={initialData.products.topCategories.map(c => ({ label: c.label, value: c.value / 100 }))} prefix="₹" />
              </div>
              <div className="rounded-card-lg border border-neutral-100 bg-white p-5 shadow-sm">
                <h3 className="text-sm font-bold text-neutral-800 mb-4">Revenue Breakdown by Brand</h3>
                <DonutChart data={initialData.products.topBrands.map(b => ({ label: b.label, value: b.value / 100 }))} prefix="₹" />
              </div>
            </div>
          </>
        )}

        {/* --- INVENTORY TAB --- */}
        {activeTab === "inventory" && (
          <>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <KpiCard label="Current Stock Value" value={formatPaise(initialData.inventory.totalValuePaise)} color="emerald" />
              <KpiCard label="Dead Inventory Items" value={initialData.inventory.deadStockCount} color="rose" />
              <KpiCard label="Turnover Rate" value={`${initialData.inventory.turnoverRate}x`} color="blue" />
              <KpiCard label="Warehouse Utilization" value={`${initialData.inventory.utilizationPct}%`} color="violet" />
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="rounded-card-lg border border-neutral-100 bg-white p-5 shadow-sm">
                <h3 className="text-sm font-bold text-neutral-800 mb-4">Stock Aging Distribution</h3>
                <DonutChart data={initialData.inventory.aging} />
              </div>
              <div className="rounded-card-lg border border-neutral-100 bg-white p-5 shadow-sm">
                <h3 className="text-sm font-bold text-neutral-800 mb-4">Out of Stock & Low Stock Items</h3>
                <div className="flex flex-col gap-3">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-neutral-500">Out of Stock Variants</span>
                    <span className="text-rose-600 font-bold">{initialData.inventory.outOfStockCount}</span>
                  </div>
                  <div className="w-full bg-neutral-100 h-2 rounded-full overflow-hidden">
                    <div className="bg-rose-500 h-full" style={{ width: `${(initialData.inventory.outOfStockCount / (initialData.inventory.outOfStockCount + initialData.inventory.lowStockCount || 1)) * 100}%` }} />
                  </div>
                  <div className="flex justify-between text-xs font-semibold mt-2">
                    <span className="text-neutral-500">Low Stock Warning Variants</span>
                    <span className="text-amber-600 font-bold">{initialData.inventory.lowStockCount}</span>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* --- CUSTOMERS TAB --- */}
        {activeTab === "customers" && (
          <>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <KpiCard label="LTV Average" value={formatPaise(initialData.customers.ltvAvgPaise)} color="blue" />
              <KpiCard label="New Signups" value={initialData.customers.newCount} color="emerald" />
              <KpiCard label="Returning Customers" value={initialData.customers.returningCount} color="violet" />
              <KpiCard label="Wallet Transactions Value" value={formatPaise(initialData.customers.walletUsagePaise)} color="amber" />
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div className="rounded-card-lg border border-neutral-100 bg-white p-5 shadow-sm lg:col-span-2">
                <h3 className="text-sm font-bold text-neutral-800 mb-4">Customer Growth Curve</h3>
                <LineChart data={initialData.customers.growth.map(c => ({ label: c.label, value: c.count }))} />
              </div>
              <div className="rounded-card-lg border border-neutral-100 bg-white p-5 shadow-sm">
                <h3 className="text-sm font-bold text-neutral-800 mb-4">Top Customers</h3>
                <div className="flex flex-col gap-4">
                  {initialData.customers.topCustomers.map((c, idx) => (
                    <div key={idx} className="flex justify-between items-center text-xs border-b border-neutral-50 pb-2">
                      <div>
                        <div className="font-bold text-neutral-800">{c.name}</div>
                        <div className="text-[10px] text-neutral-400">{c.email}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-extrabold text-neutral-900">{formatPaise(c.totalSpentPaise)}</div>
                        <div className="text-[10px] text-neutral-400">{c.ordersCount} orders</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}

        {/* --- MARKETING TAB --- */}
        {activeTab === "marketing" && (
          <>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <KpiCard label="Checkout Conversion" value={`${initialData.marketing.conversionRate}%`} color="emerald" />
              <KpiCard label="Checkout Dropoffs" value={initialData.marketing.checkoutDropoffCount} color="rose" />
              <KpiCard label="Cart Abandonments" value={initialData.marketing.cartAbandonmentCount} color="amber" />
              <KpiCard label="Coupon Usage Rate" value={initialData.customers.couponUsageCount} color="violet" />
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="rounded-card-lg border border-neutral-100 bg-white p-5 shadow-sm">
                <h3 className="text-sm font-bold text-neutral-800 mb-4">Top Searches</h3>
                <div className="flex flex-col gap-3">
                  {initialData.marketing.topSearches.map((s, idx) => (
                    <div key={idx} className="flex justify-between items-center text-xs">
                      <span className="font-semibold text-neutral-600">&quot;{s.term}&quot;</span>
                      <span className="font-extrabold text-neutral-900">{s.count} searches</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-card-lg border border-neutral-100 bg-white p-5 shadow-sm">
                <h3 className="text-sm font-bold text-neutral-800 mb-4">No-Result Searches</h3>
                <div className="flex flex-col gap-3">
                  {initialData.marketing.noResultSearches.map((s, idx) => (
                    <div key={idx} className="flex justify-between items-center text-xs">
                      <span className="font-semibold text-rose-600">&quot;{s.term}&quot;</span>
                      <span className="font-extrabold text-neutral-900">{s.count} times</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}

        {/* --- OPERATIONS TAB --- */}
        {activeTab === "operations" && (
          <>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <KpiCard label="Avg Fulfillment Time" value={`${initialData.operations.avgFulfillmentMinutes} mins`} color="blue" />
              <KpiCard label="Packing SLA Pass" value={`${initialData.operations.packingSlaPct}%`} color="emerald" />
              <KpiCard label="Delivery SLA Pass" value={`${initialData.operations.deliverySlaPct}%`} color="violet" />
              <KpiCard label="Cancelled Orders" value={initialData.orders.cancelled} color="rose" />
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="rounded-card-lg border border-neutral-100 bg-white p-5 shadow-sm">
                <h3 className="text-sm font-bold text-neutral-800 mb-4">Warehouse Order Volume</h3>
                <BarChart data={initialData.operations.warehousePerf.map(w => ({ label: w.name, value: w.count }))} />
              </div>
              <div className="rounded-card-lg border border-neutral-100 bg-white p-5 shadow-sm">
                <h3 className="text-sm font-bold text-neutral-800 mb-4">Order Cancellation Reasons</h3>
                <DonutChart data={initialData.orders.cancelledReasons} />
              </div>
            </div>

            <div className="rounded-card-lg border border-neutral-100 bg-white p-5 shadow-sm">
              <h3 className="text-sm font-bold text-neutral-800 mb-4">Hourly Fulfillment Activity Heatmap</h3>
              <Heatmap data={initialData.operations.hourlyActivity} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

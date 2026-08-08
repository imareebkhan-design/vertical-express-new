"use client";

/** Downloads dataset as a formatted CSV file, compatible with Excel. */
export function exportToCsv(filename: string, headers: string[], rows: (string | number | boolean | null | undefined)[][]) {
  const csvContent = [
    headers.join(","),
    ...rows.map((row) =>
      row
        .map((val) => {
          if (val === null || val === undefined) return "";
          const str = String(val);
          // Escape commas, quotes, and newlines
          return str.includes(",") || str.includes('"') || str.includes("\n")
            ? `"${str.replace(/"/g, '""')}"`
            : str;
        })
        .join(",")
    ),
  ].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/** Triggers a clean print layout, optimized for PDF saving via browser print panels. */
export function triggerPrintReport() {
  if (typeof window !== "undefined") {
    window.print();
  }
}

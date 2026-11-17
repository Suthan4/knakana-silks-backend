import { Request, Response } from "express";
import { google } from "googleapis";
import ExcelJS from "exceljs";

type ReportQuery = { startDate: string; endDate: string };
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function getDateRange(req: Request): ReportQuery {
  const endDate = String(req.query.endDate ?? new Date().toISOString().slice(0, 10));
  const startDate = String(req.query.startDate ?? new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10));
  if (!datePattern.test(startDate) || !datePattern.test(endDate) || startDate > endDate) {
    throw new Error("Provide a valid startDate and endDate in YYYY-MM-DD format.");
  }
  return { startDate, endDate };
}

function getAnalyticsClient() {
  const propertyId = process.env.GA4_PROPERTY_ID;
  const credentialsJson = process.env.GA4_SERVICE_ACCOUNT_JSON;
  if (!propertyId || !credentialsJson) {
    throw new Error("GA4 is not configured. Set GA4_PROPERTY_ID and GA4_SERVICE_ACCOUNT_JSON.");
  }
  const credentials = JSON.parse(credentialsJson);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/analytics.readonly"],
  });
  return { propertyId, client: google.analyticsdata({ version: "v1beta", auth }) };
}

async function getGa4Report(range: ReportQuery) {
  const { propertyId, client } = getAnalyticsClient();
  const response = await client.properties.runReport({
    property: `properties/${propertyId}`,
    requestBody: {
      dateRanges: [{ startDate: range.startDate, endDate: range.endDate }],
      dimensions: [{ name: "date" }, { name: "sessionDefaultChannelGroup" }],
      metrics: [
        { name: "sessions" },
        { name: "totalUsers" },
        { name: "screenPageViews" },
        { name: "addToCarts" },
        { name: "checkouts" },
        { name: "ecommercePurchases" },
        { name: "purchaseRevenue" },
      ],
      orderBys: [{ dimension: { dimensionName: "date" } }],
      limit: "10000",
    },
  });
  const headers = response.data.dimensionHeaders ?? [];
  const metricHeaders = response.data.metricHeaders ?? [];
  const rows = (response.data.rows ?? []).map((row) => ({
    date: row.dimensionValues?.[0]?.value ?? "",
    channel: row.dimensionValues?.[1]?.value ?? "(not set)",
    ...Object.fromEntries(metricHeaders.map((header, index) => [
      header.name ?? `metric_${index}`,
      Number(row.metricValues?.[index]?.value ?? 0),
    ])),
  }));
  return { propertyId, rows, rowCount: rows.length };
}

async function getClarityInsights() {
  const token = process.env.CLARITY_API_TOKEN;
  if (!token) return { configured: false, limitation: "Set CLARITY_API_TOKEN to enable Clarity insights." };
  const response = await fetch("https://www.clarity.ms/export-data/api/v1/project-live-insights?numOfDays=3&dimension1=Device&dimension2=URL", {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    throw new Error(`Clarity export failed (HTTP ${response.status}). Check the token and daily API quota.`);
  }
  return { configured: true, window: "last_3_days", data: await response.json() };
}

export class AnalyticsController {
  async getReport(req: Request, res: Response) {
    try {
      const range = getDateRange(req);
      const [ga4, clarity] = await Promise.all([
        getGa4Report(range),
        getClarityInsights().catch((error: Error) => ({
          configured: Boolean(process.env.CLARITY_API_TOKEN),
          error: error.message,
        })),
      ]);
      res.json({
        success: true,
        data: {
          range,
          timezone: "GA4 property timezone (recommended: Asia/Kolkata)",
          ga4,
          clarity,
          notes: [
            "GA4 supports the selected historical date range, subject to GA4 data availability.",
            "Clarity Data Export API only exposes the most recent 1–3 days; historical Clarity reporting requires daily snapshots.",
          ],
        },
      });
    } catch (error) {
      res.status(400).json({ success: false, message: error instanceof Error ? error.message : "Unable to load analytics." });
    }
  }

  async exportReport(req: Request, res: Response) {
    try {
      const range = getDateRange(req);
      const report = await getGa4Report(range);
      const format = String(req.query.format ?? "xlsx").toLowerCase();
      const filename = `kankana-analytics-${range.startDate}-to-${range.endDate}`;
      if (format === "csv") {
        const columns = ["date", "channel", "sessions", "totalUsers", "screenPageViews", "addToCarts", "checkouts", "ecommercePurchases", "purchaseRevenue"];
        const quote = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
        const csv = [columns.join(","), ...report.rows.map((row) => columns.map((key) => quote((row as Record<string, unknown>)[key])).join(","))].join("\r\n");
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}.csv"`);
        return res.send("\uFEFF" + csv);
      }
      if (format !== "xlsx") {
        return res.status(400).json({ success: false, message: "format must be csv or xlsx." });
      }
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "Kankana Silks Analytics";
      const sheet = workbook.addWorksheet("GA4 Report");
      sheet.columns = [
        { header: "Date", key: "date", width: 14 },
        { header: "Channel", key: "channel", width: 28 },
        { header: "Sessions", key: "sessions", width: 14 },
        { header: "Users", key: "totalUsers", width: 14 },
        { header: "Page Views", key: "screenPageViews", width: 14 },
        { header: "Add to Carts", key: "addToCarts", width: 14 },
        { header: "Checkouts", key: "checkouts", width: 14 },
        { header: "Purchases", key: "ecommercePurchases", width: 14 },
        { header: "Purchase Revenue", key: "purchaseRevenue", width: 20 },
      ];
      sheet.addRows(report.rows);
      sheet.getRow(1).font = { bold: true };
      sheet.views = [{ state: "frozen", ySplit: 1 }];
      const buffer = await workbook.xlsx.writeBuffer();
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}.xlsx"`);
      return res.send(Buffer.from(buffer));
    } catch (error) {
      res.status(400).json({ success: false, message: error instanceof Error ? error.message : "Unable to export analytics." });
    }
  }
}

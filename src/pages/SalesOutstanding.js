import React, { useState, useEffect } from "react";
import Sidebar from "../components/Sidebar";
import {
  Typography,
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Alert,
  CircularProgress,
  IconButton,
  Menu,
  FormControlLabel,
  Checkbox,
} from "@mui/material";
import ViewColumnIcon from "@mui/icons-material/ViewColumn";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const BILLS_FILE_NAME = "SalesOutstanding.json";
// Table columns in display order: reference → date → party → amounts → other
const ALL_TABLE_COLUMNS = [
  "Bill No",
  "Date",
  "Customer Name",
  "Supplier Name",
  "Company Name",
  "City",
  "Net Amt",
  "Rec. Amt",
  "Rec. Dt.",
  "RG Paid",
  "Balance",
  "Days",
];

const COLUMN_KEYS = {
  "Bill No": ["Bill No", "billNo", "BillNo", "bill_no"],
  Date: ["Date", "date"],
  "Company Name": ["Company Name", "Company  Name", "companyName", "CompanyName", "company_name", "Company", "company", "firm", "Firm", "branch", "Branch", "companyname", "COMPANY", "COMPANYNAME"],
  "Customer Name": ["Customer Name", "customerName", "CustomerName", "customer_name"],
  "Supplier Name": ["Supplier Name", "supplierName", "SupplierName", "supplier_name"],
  "Net Amt": ["Net Amt", "netAmt", "NetAmt", "net_amt"],
  "Rec. Amt": ["Rec. Amt", "recAmt", "RecAmt", "rec_amt"],
  "Rec. Dt.": ["Rec. Dt.", "recDt", "RecDt", "rec_dt", "Rec Date", "recDate"],
  "RG Paid": ["RG Paid", "rgPaid", "RgPaid", "rg_paid"],
  "Balance": ["Balance", "Outstanding Amt", "outstandingAmt", "OutstandingAmt", "outstanding_amt"],
  Days: ["Days", "days"],
  City: ["City", "city", "CityName", "cityName", "city_name"],
  "Party Name": ["Party Name", "partyName", "Customer Name", "customerName", "customer_name"],
};

async function checkJsonFolder(accessToken) {
  if (!accessToken) return { ok: false, folder: null };
  try {
    const q = "name='JSON' and mimeType='application/vnd.google-apps.folder' and trashed=false";
    const res = await fetch(
      DRIVE_API + "/files?q=" + encodeURIComponent(q) + "&fields=files(id,name)&pageSize=10",
      { headers: { Authorization: "Bearer " + accessToken } }
    );
    if (!res.ok) return { ok: false, folder: null };
    const data = await res.json();
    const folder = data.files && data.files[0];
    return { ok: !!folder, folder };
  } catch (e) {
    return { ok: false, folder: null };
  }
}

async function listFilesInFolder(accessToken, folderId) {
  try {
    const q = "'" + folderId + "' in parents and trashed=false";
    const res = await fetch(
      DRIVE_API + "/files?q=" + encodeURIComponent(q) + "&fields=files(id,name)&pageSize=100",
      { headers: { Authorization: "Bearer " + accessToken } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data.files || [];
  } catch (e) {
    return [];
  }
}

async function getFileContent(accessToken, fileId) {
  const res = await fetch(DRIVE_API + "/files/" + fileId + "?alt=media", {
    headers: { Authorization: "Bearer " + accessToken },
  });
  if (!res.ok) throw new Error("Could not read file");
  return res.json();
}

function parseDate(str) {
  if (!str) return null;
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}
function getDaysCount(rowDate, toDateStr) {
  if (!rowDate) return "";
  const end = toDateStr ? new Date(toDateStr) : new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date(rowDate);
  start.setHours(0, 0, 0, 0);
  const ms = end.getTime() - start.getTime();
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  return days >= 0 ? days : "";
}

/** Returns Array<[companyName, Array<[customerName, rows]>]> sorted by company then customer */
function groupByCompanyThenCustomer(rows) {
  const companyMap = new Map();
  (rows || []).forEach((row) => {
    const company = getCellValue(row, "Company Name") || "(No company)";
    const companyKey = String(company).trim() || "(No company)";
    if (!companyMap.has(companyKey)) companyMap.set(companyKey, new Map());
    const customerMap = companyMap.get(companyKey);
    const customer = getCellValue(row, "Customer Name") || "(No customer)";
    const customerKey = String(customer).trim() || "(No customer)";
    if (!customerMap.has(customerKey)) customerMap.set(customerKey, []);
    customerMap.get(customerKey).push(row);
  });
  return Array.from(companyMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([companyName, customerMap]) => [
      companyName,
      Array.from(customerMap.entries()).sort((a, b) => a[0].localeCompare(b[0])),
    ]);
}

function getUniqueValues(rows, columnLabel) {
  const keys = COLUMN_KEYS[columnLabel];
  if (!keys) return ["All"];
  const set = new Set();
  (rows || []).forEach((row) => {
    let v = "";
    for (const k of keys) {
      if (row[k] != null && String(row[k]).trim() !== "") {
        v = String(row[k]).trim();
        break;
      }
    }
    if (v) set.add(v);
  });
  return ["All", ...Array.from(set).sort()];
}

function getCellValue(row, columnLabel) {
  const keys = COLUMN_KEYS[columnLabel];
  if (!keys) return "";
  for (const k of keys) {
    if (row[k] != null && String(row[k]).trim() !== "") return row[k];
  }
  // Fallback for Company Name: match any key that looks like "company"
  if (columnLabel === "Company Name" && row && typeof row === "object") {
    const found = Object.keys(row).find(
      (key) =>
        key &&
        (key.toLowerCase().replace(/\s+/g, " ") === "company name" ||
          /^company$/i.test(key) ||
          /^companyname$/i.test(key) ||
          key.toLowerCase().includes("company"))
    );
    if (found && row[found] != null && String(row[found]).trim() !== "")
      return row[found];
  }
  return "";
}

function formatAmt(val) {
  const n = Number(val);
  if (isNaN(n)) return "";
  return n.toFixed(2);
}

const AMT_COLUMNS = ["Net Amt", "Rec. Amt", "RG Paid", "Balance"];

function sumAmtColumn(rows, columnLabel) {
  let sum = 0;
  (rows || []).forEach((row) => {
    const v = getCellValue(row, columnLabel);
    const n = Number(v);
    if (!isNaN(n)) sum += n;
  });
  return sum;
}

function SalesOutstanding() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [rows, setRows] = useState([]);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selectedParty, setSelectedParty] = useState("All");
  const [selectedCity, setSelectedCity] = useState("All");
  const hiddenByDefaultColumns = ["Customer Name", "Company Name", "City"];
  const [columnVisibility, setColumnVisibility] = useState(() =>
    Object.fromEntries(ALL_TABLE_COLUMNS.map((c) => [c, !hiddenByDefaultColumns.includes(c)]))
  );
  const [columnsMenuAnchor, setColumnsMenuAnchor] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem("google_access_token");
    if (!token) {
      setError("Please log in with Google (Drive access).");
      setLoading(false);
      return;
    }
    checkJsonFolder(token).then(({ ok, folder }) => {
      if (!ok || !folder) {
        setError('Folder "JSON" not found in Google Drive.');
        setLoading(false);
        return;
      }
      listFilesInFolder(token, folder.id).then((fileList) => {
        const billsFile = fileList.find(
          (f) =>
            f.name === BILLS_FILE_NAME ||
            f.name.toLowerCase() === "SalesOutstanding.json"
        );
        if (!billsFile) {
          setError('"' + BILLS_FILE_NAME + '" not found in JSON folder. Add bills.json with columns: Bill No, Date, Party Name, Ref Name, Net Amt, RG Amt, Balance.');
          setLoading(false);
          return;
        }
        getFileContent(token, billsFile.id)
          .then((json) => {
            let arr = [];
            if (Array.isArray(json)) {
              arr = json;
            } else if (json && typeof json === "object") {
              arr = json.data ?? json.records ?? json.bills ?? json.rows ?? json.items ?? json.list ?? [];
              if (!Array.isArray(arr)) arr = [];
            }
            setRows(arr);
            setError(arr.length === 0 ? "No records found." : null);
          })
          .catch(() => setError("Could not read bills.json."))
          .finally(() => setLoading(false));
      });
    });
  }, []);

  const visibleColumnsList = ALL_TABLE_COLUMNS.filter((c) => columnVisibility[c]);
  const columnsToShow = visibleColumnsList.length > 0 ? visibleColumnsList : ALL_TABLE_COLUMNS;
  const partyNames = getUniqueValues(rows, "Party Name");
  const cityNames = getUniqueValues(rows, "City");

  const filteredRows = rows.filter((row) => {
    const partyVal = getCellValue(row, "Party Name");
    if (selectedParty !== "All" && partyVal !== selectedParty) return false;
    const cityVal = getCellValue(row, "City");
    if (selectedCity !== "All" && cityVal !== selectedCity) return false;
    const rowDate = parseDate(getCellValue(row, "Date"));
    if (fromDate && rowDate) {
      const from = new Date(fromDate);
      from.setHours(0, 0, 0, 0);
      if (rowDate < from) return false;
    }
    if (toDate && rowDate) {
      const to = new Date(toDate);
      to.setHours(23, 59, 59, 999);
      if (rowDate > to) return false;
    }
    return true;
  });

  const groupedByCompanyThenCustomer = groupByCompanyThenCustomer(filteredRows);

  const toggleColumn = (col) => {
    setColumnVisibility((prev) => ({ ...prev, [col]: !prev[col] }));
  };

  const isAmtColumn = (col) =>
    col === "Net Amt" ||
    col === "Rec. Amt" ||
    col === "RG Paid" ||
    col === "Balance";
  const isRightAlignColumn = (col) =>
    col === "Net Amt" || col === "Rec. Amt" || col === "RG Paid" || col === "Balance" || col === "Days";

  const exportToPdf = () => {
    try {
      const esc = (s) =>
        String(s ?? "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
      const thAlign = (c) =>
        c === "Net Amt" || c === "Rec. Amt" || c === "RG Paid" || c === "Balance" || c === "Days"
          ? "right"
          : "left";
      const tdAlignStyle = (c) => (thAlign(c) === "right" ? ";text-align:right" : "");
      const ths = columnsToShow
        .map(
          (c) =>
            '<th style="padding:6px;background:#ddd;text-align:' +
            thAlign(c) +
            '">' +
            esc(c) +
            "</th>"
        )
        .join("");
      let rowsHtml = "";
      groupedByCompanyThenCustomer.forEach(([companyName, customers]) => {
        rowsHtml +=
          '<tr style="background:#888;color:#fff;font-weight:700"><td colspan="' +
          columnsToShow.length +
          '" style="padding:8px">Company: ' +
          esc(companyName) +
          "</td></tr>";
        let companyRows = [];
        customers.forEach(([customerName, customerRows]) => {
          companyRows = companyRows.concat(customerRows);
          rowsHtml +=
            '<tr style="background:#ccc;font-weight:700"><td colspan="' +
            columnsToShow.length +
            '" style="padding:6px">Customer: ' +
            esc(customerName) +
            "</td></tr>";
          customerRows.forEach((row) => {
            const rowDate = parseDate(getCellValue(row, "Date"));
            const cells = columnsToShow.map((col) => {
              const val =
                col === "Days"
                  ? getDaysCount(rowDate, toDate)
                  : getCellValue(row, col);
              const text =
                isAmtColumn(col) && val !== "" ? formatAmt(val) : esc(val);
              return '<td style="padding:4px' + tdAlignStyle(col) + '">' + text + "</td>";
            });
            rowsHtml += "<tr>" + cells.join("") + "</tr>";
          });
          const totalCells = columnsToShow.map((col, i) => {
            const isAmt = AMT_COLUMNS.includes(col);
            const text =
              i === 0
                ? "Total (" + esc(customerName) + ")"
                : isAmt
                  ? formatAmt(sumAmtColumn(customerRows, col))
                  : "";
            return '<td style="padding:4px;font-weight:600;background:#eee' + tdAlignStyle(col) + '">' + (text ? esc(String(text)) : "") + "</td>";
          });
          rowsHtml += "<tr>" + totalCells.join("") + "</tr>";
        });
        const companyTotalCells = columnsToShow.map((col, i) => {
          const isAmt = AMT_COLUMNS.includes(col);
          const text =
            i === 0
              ? "Total (" + esc(companyName) + ")"
              : isAmt
                ? formatAmt(sumAmtColumn(companyRows, col))
                : "";
          return '<td style="padding:4px;font-weight:700;background:#ddd' + tdAlignStyle(col) + '">' + (text ? esc(String(text)) : "") + "</td>";
        });
        rowsHtml += "<tr>" + companyTotalCells.join("") + "</tr>";
      });
      const html =
        `<!DOCTYPE html><html><head><title>Sales Outstanding</title><style>table{border-collapse:collapse;width:100%;font-size:12px}td,th{border:1px solid #999;padding:4px 6px}</style></head><body style="font-family:arial;padding:16px"><h2>Sales Outstanding</h2><p style="font-size:12px;color:#666">` +
        (fromDate || toDate
          ? "From: " + (fromDate || "—") + " &nbsp; To: " + (toDate || "—")
          : "") +
        `</p><table><thead><tr>${ths}</tr></thead><tbody>${rowsHtml}</tbody></table><p style="margin-top:16px;font-size:11px;color:#666">Use Print (Ctrl+P) and choose "Save as PDF".</p></body></html>`;
      const w = window.open("", "_blank");
      if (!w) {
        alert("Please allow pop-ups to save as PDF.");
        return;
      }
      w.document.write(html);
      w.document.close();
      w.focus();
      setTimeout(() => {
        w.print();
        w.onafterprint = () => w.close();
      }, 250);
    } catch (err) {
      console.error("PDF export failed:", err);
      alert("Could not open print window. " + (err.message || ""));
    }
  };

  return (
    <div style={{ display: "flex", minWidth: 0, overflow: "hidden" }}>
      <Sidebar />
      <Box
        component="div"
        sx={{
          flex: 1,
          minWidth: 0,
          p: { xs: 2, sm: 3 },
          overflow: "auto",
          boxSizing: "border-box",
        }}
      >
        <Typography variant="h5" sx={{ mb: 3 }}>
          Sales Outstanding
        </Typography>

        {loading && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 2, py: 2 }}>
            <CircularProgress size={24} />
            <Typography>Loading…</Typography>
          </Box>
        )}

        {error && !loading && (
          <Alert severity="warning" sx={{ maxWidth: 600, mb: 2 }}>
            {error}
          </Alert>
        )}

        {!loading && rows.length > 0 && (
          <>
            <Paper
              variant="outlined"
              sx={{ p: 2, mb: 3, width: "100%", maxWidth: 900 }}
            >
              <Typography
                variant="subtitle1"
                sx={{ fontWeight: 600, mb: 2 }}
              >
                Criteria
              </Typography>
              <Box
                sx={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 2,
                  alignItems: "center",
                }}
              >
                <TextField
                  label="From Date"
                  type="date"
                  size="small"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  sx={{ minWidth: { xs: "100%", sm: 160 } }}
                />
                <TextField
                  label="To Date"
                  type="date"
                  size="small"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  sx={{ minWidth: { xs: "100%", sm: 160 } }}
                />
                <FormControl
                  size="small"
                  sx={{ minWidth: { xs: "100%", sm: 200 } }}
                >
                  <InputLabel id="bills-city-label">City</InputLabel>
                  <Select
                    labelId="bills-city-label"
                    value={selectedCity}
                    label="City"
                    onChange={(e) => setSelectedCity(e.target.value)}
                  >
                    {cityNames.map((name) => (
                      <MenuItem key={name} value={name}>
                        {name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl
                  size="small"
                  sx={{ minWidth: { xs: "100%", sm: 200 } }}
                >
                  <InputLabel id="bills-customer-label">Customer Name</InputLabel>
                  <Select
                    labelId="bills-customer-label"
                    value={selectedParty}
                    label="Customer Name"
                    onChange={(e) => setSelectedParty(e.target.value)}
                  >
                    {partyNames.map((name) => (
                      <MenuItem key={name} value={name}>
                        {name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>
            </Paper>

            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 2,
                mb: 1,
                flexWrap: "wrap",
              }}
            >
              <Typography variant="body2" color="text.secondary">
                Showing {filteredRows.length} of {rows.length} entries
              </Typography>
              <IconButton
                size="small"
                onClick={(e) => setColumnsMenuAnchor(e.currentTarget)}
                title="Show / hide columns"
                sx={{ border: 1, borderColor: "divider" }}
              >
                <ViewColumnIcon fontSize="small" />
              </IconButton>
              <IconButton
                size="small"
                onClick={exportToPdf}
                title="Save as PDF"
                sx={{ border: 1, borderColor: "divider" }}
              >
                <PictureAsPdfIcon fontSize="small" />
              </IconButton>
              <Menu
                anchorEl={columnsMenuAnchor}
                open={!!columnsMenuAnchor}
                onClose={() => setColumnsMenuAnchor(null)}
                PaperProps={{ sx: { minWidth: 200 } }}
              >
                <Box sx={{ px: 2, py: 1 }}>
                  <Typography variant="subtitle2" color="text.secondary">
                    Table columns
                  </Typography>
                </Box>
                {ALL_TABLE_COLUMNS.map((col) => (
                  <MenuItem key={col} dense onClick={() => toggleColumn(col)}>
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={!!columnVisibility[col]}
                          size="small"
                          readOnly
                        />
                      }
                      label={col}
                      sx={{ mr: 0 }}
                    />
                  </MenuItem>
                ))}
              </Menu>
            </Box>

            <TableContainer
              component={Paper}
              variant="outlined"
              sx={{
                width: "100%",
                overflowX: "auto",
                overflowY: "auto",
                maxHeight: { xs: "70vh", sm: 520 },
                "-webkit-overflow-scrolling": "touch",
              }}
            >
              <Table
                stickyHeader
                size="small"
                sx={{ minWidth: Math.max(400, columnsToShow.length * 100) }}
              >
                <TableHead>
                  <TableRow>
                    {columnsToShow.map((col) => (
                      <TableCell
                        key={col}
                        sx={{
                          fontWeight: 600,
                          backgroundColor: "grey.100",
                          textAlign: isRightAlignColumn(col) ? "right" : "left",
                        }}
                      >
                        {col}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {groupedByCompanyThenCustomer.map(([companyName, customers]) => (
                    <React.Fragment key={companyName}>
                      <TableRow sx={{ backgroundColor: "grey.400" }}>
                        <TableCell
                          colSpan={columnsToShow.length}
                          sx={{ fontWeight: 700, fontSize: "subtitle1", py: 1.5 }}
                        >
                          Company: {companyName}
                        </TableCell>
                      </TableRow>
                      {customers.map(([customerName, customerRows]) => {
                        return (
                          <React.Fragment key={companyName + "-" + customerName}>
                            <TableRow sx={{ backgroundColor: "grey.300" }}>
                              <TableCell
                                colSpan={columnsToShow.length}
                                sx={{ fontWeight: 700, fontSize: "subtitle2", py: 1, pl: 3 }}
                              >
                                Customer: {customerName}
                              </TableCell>
                            </TableRow>
                            {customerRows.map((row, idx) => {
                              const rowDate = parseDate(getCellValue(row, "Date"));
                              return (
                                <TableRow key={companyName + "-" + customerName + "-" + idx}>
                                  {columnsToShow.map((col) => {
                                    const val =
                                      col === "Days"
                                        ? getDaysCount(rowDate, toDate)
                                        : getCellValue(row, col);
                                    const display =
                                      isAmtColumn(col) && val !== ""
                                        ? formatAmt(val)
                                        : val;
                                    return (
                                      <TableCell
                                        key={col}
                                        sx={{
                                          padding: 2,
                                          textAlign: isRightAlignColumn(col) ? "right" : "left",
                                        }}
                                      >
                                        {display}
                                      </TableCell>
                                    );
                                  })}
                                </TableRow>
                              );
                            })}
                            <TableRow sx={{ backgroundColor: "grey.200", fontWeight: 600 }}>
                              {columnsToShow.map((col, i) => {
                                const isAmt = AMT_COLUMNS.includes(col);
                                const display =
                                  i === 0
                                    ? "Total (" + customerName + ")"
                                    : isAmt
                                      ? formatAmt(sumAmtColumn(customerRows, col))
                                      : "";
                                return (
                                  <TableCell
                                    key={col}
                                    sx={{
                                      padding: 2,
                                      fontWeight: 600,
                                      textAlign: isRightAlignColumn(col) ? "right" : "left",
                                    }}
                                  >
                                    {display}
                                  </TableCell>
                                );
                              })}
                            </TableRow>
                          </React.Fragment>
                        );
                      })}
                      <TableRow sx={{ backgroundColor: "grey.100", fontWeight: 700 }}>
                        {columnsToShow.map((col, i) => {
                          const companyRows = customers.flatMap(([, cr]) => cr);
                          const isAmt = AMT_COLUMNS.includes(col);
                          const display =
                            i === 0
                              ? "Total (" + companyName + ")"
                              : isAmt
                                ? formatAmt(sumAmtColumn(companyRows, col))
                                : "";
                          return (
                            <TableCell
                              key={col}
                              sx={{
                                padding: 2,
                                fontWeight: 700,
                                textAlign: isRightAlignColumn(col) ? "right" : "left",
                              }}
                            >
                              {display}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    </React.Fragment>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </>
        )}
      </Box>
    </div>
  );
}

export default SalesOutstanding;

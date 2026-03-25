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
const LEDGER_FILE_NAME = "ledger.json";
const ALL_TABLE_COLUMNS = ["Date", "Account Name", "Ref Account Name", "Description", "Debit", "Credit", "Balance"];

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

function getUniqueValues(rows, key) {
  const set = new Set();
  (rows || []).forEach((row) => {
    const v = row[key];
    if (v != null && String(v).trim() !== "") set.add(String(v).trim());
  });
  return ["All", ...Array.from(set).sort()];
}

function getCompanyName(row) {
  return String(row["Company  Name"] ?? row["Company Name"] ?? "").trim();
}

function groupByCompany(rows) {
  const map = new Map();
  (rows || []).forEach((row) => {
    const company = getCompanyName(row) || "(No company)";
    if (!map.has(company)) map.set(company, []);
    map.get(company).push(row);
  });
  return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
}

function getCreditDebitNums(row) {
  const debit = row["Debit"];
  const credit = row["Cerdit"] ?? row["Credit"];
  const d = debit != null && String(debit).trim() !== "" ? Number(debit) : 0;
  const c = credit != null && String(credit).trim() !== "" ? Number(credit) : 0;
  return { credit: c, debit: d };
}

function computeRunningBalances(companyRows, openingBalance = 0) {
  let balance = openingBalance;
  return companyRows.map((row) => {
    const { credit, debit } = getCreditDebitNums(row);
    balance = balance + debit - credit;
    return { row, balance };
  });
}

function getOpeningBalance(companyRows, fromDateStr) {
  if (!fromDateStr || !companyRows.length) return 0;
  const from = new Date(fromDateStr);
  from.setHours(0, 0, 0, 0);
  let total = 0;
  companyRows.forEach((row) => {
    const rowDate = parseDate(row["Date"]);
    if (rowDate && rowDate < from) {
      const { credit, debit } = getCreditDebitNums(row);
      total += debit - credit;
    }
  });
  return total;
}

function groupByAccountRows(rows) {
  const map = new Map();
  (rows || []).forEach((row) => {
    const account = String(row["Account Name"] ?? "").trim() || "(No account)";
    if (!map.has(account)) map.set(account, []);
    map.get(account).push(row);
  });
  return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
}

function getAccountTotals(rowsWithBalanceForAccount) {
  let totalDebit = 0;
  let totalCredit = 0;
  let lastBalance = 0;
  rowsWithBalanceForAccount.forEach(({ row, balance }) => {
    const { credit, debit } = getCreditDebitNums(row);
    totalDebit += debit;
    totalCredit += credit;
    lastBalance = balance;
  });
  return { totalDebit, totalCredit, balance: lastBalance };
}

function filterRowsByDateRange(companyRows, fromDateStr, toDateStr) {
  return companyRows.filter((row) => {
    const rowDate = parseDate(row["Date"]);
    if (!rowDate) return false;
    if (fromDateStr) {
      const from = new Date(fromDateStr);
      from.setHours(0, 0, 0, 0);
      if (rowDate < from) return false;
    }
    if (toDateStr) {
      const to = new Date(toDateStr);
      to.setHours(23, 59, 59, 999);
      if (rowDate > to) return false;
    }
    return true;
  });
}

function Ledger() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [rows, setRows] = useState([]);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selectedCompany, setSelectedCompany] = useState("All");
  const [selectedAccount, setSelectedAccount] = useState("All");
  const [selectedCity, setSelectedCity] = useState("All");
  const [columnVisibility, setColumnVisibility] = useState(() =>
    Object.fromEntries(ALL_TABLE_COLUMNS.map((c) => [c, true]))
  );
  const [columnsMenuAnchor, setColumnsMenuAnchor] = useState(null);
  const visibleColumnsList = ALL_TABLE_COLUMNS.filter((col) => columnVisibility[col]);
  const hasVisibleColumns = visibleColumnsList.length > 0;
  const columnsToShow = hasVisibleColumns ? visibleColumnsList : ALL_TABLE_COLUMNS;

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
        const ledgerFile = fileList.find(
          (f) => f.name === LEDGER_FILE_NAME || f.name.toLowerCase() === "ledger.json"
        );
        if (!ledgerFile) {
          setError('"ledger.json" not found in JSON folder.');
          setLoading(false);
          return;
        }
        getFileContent(token, ledgerFile.id)
          .then((json) => {
            const arr = Array.isArray(json) ? json : [];
            setRows(arr);
            setError(arr.length === 0 ? "No ledger entries found." : null);
          })
          .catch(() => setError("Could not read ledger.json."))
          .finally(() => setLoading(false));
      });
    });
  }, []);

  const companyNamesList = (() => {
    const set = new Set();
    (rows || []).forEach((row) => {
      const c = getCompanyName(row);
      if (c) set.add(c);
    });
    return ["All", ...Array.from(set).sort()];
  })();
  const accountNames = getUniqueValues(rows, "Account Name");
  const cities = getUniqueValues(rows, "city");

  const filteredRows = rows.filter((row) => {
    if (selectedCompany !== "All" && getCompanyName(row) !== selectedCompany) return false;
    if (selectedAccount !== "All" && String(row["Account Name"] || "").trim() !== selectedAccount)
      return false;
    if (selectedCity !== "All" && String(row["city"] || "").trim() !== selectedCity) return false;
    const rowDate = parseDate(row["Date"]);
    if (toDate && rowDate) {
      const to = new Date(toDate);
      to.setHours(23, 59, 59, 999);
      if (rowDate > to) return false;
    }
    return true;
  });

  const groupedByCompany = groupByCompany(filteredRows);
  const toggleColumn = (col) => {
    setColumnVisibility((prev) => ({ ...prev, [col]: !prev[col] }));
  };
  const displayedCount = groupedByCompany.reduce(
    (sum, [, companyRows]) => sum + filterRowsByDateRange(companyRows, fromDate, toDate).length,
    0
  );

  const exportToPdf = () => {
    try {
      const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      let rowsHtml = "";
      groupedByCompany.forEach(([companyName, companyRows]) => {
        rowsHtml += `<tr style="background:#e0e0e0"><td colspan="${columnsToShow.length}" style="font-weight:700;padding:6px">${esc(companyName)}</td></tr>`;
        const byAccount = groupByAccountRows(companyRows);
        const showOpening = !!fromDate;
        byAccount.forEach(([accountName, accountRows]) => {
          const openingBalance = getOpeningBalance(accountRows, fromDate);
          const transactionRows = filterRowsByDateRange(accountRows, fromDate, toDate);
          const rowsWithBalance = computeRunningBalances(transactionRows, openingBalance);
          const { totalDebit, totalCredit, balance: totalBalance } = getAccountTotals(rowsWithBalance);
          const closingBalance = rowsWithBalance.length > 0 ? totalBalance : openingBalance;
          rowsHtml += `<tr style="background:#eee"><td colspan="${columnsToShow.length}" style="font-weight:700;padding:4px">Account: ${esc(accountName)}</td></tr>`;
          if (showOpening) {
            const cells = columnsToShow.map((col) => {
              if (col === "Account Name") return esc(accountName);
              if (col === "Ref Account Name") return "Account Opening";
              if (col === "Balance") return openingBalance !== 0 ? "₹" + openingBalance.toLocaleString() : "₹0";
              return "";
            });
            rowsHtml += "<tr style=\"background:#f5f5f5\">" + cells.map((c) => "<td style=\"padding:4px\">" + esc(c) + "</td>").join("") + "</tr>";
          }
          rowsWithBalance.forEach(({ row, balance: rowBalance }) => {
            const { credit, debit } = getCreditDebitNums(row);
            const cells = columnsToShow.map((col) => {
              if (col === "Date") return row["Date"] ?? "";
              if (col === "Account Name") return row["Account Name"] ?? "";
              if (col === "Ref Account Name") return row["Ref Account Name"] ?? "";
              if (col === "Description") return row["Description"] ?? "";
              if (col === "Debit") return debit ? "₹" + debit.toLocaleString() : "";
              if (col === "Credit") return credit ? "₹" + credit.toLocaleString() : "";
              if (col === "Balance") return rowBalance !== 0 ? "₹" + rowBalance.toLocaleString() : "";
              return "";
            });
            rowsHtml += "<tr>" + cells.map((c) => "<td style=\"padding:4px\">" + esc(c) + "</td>").join("") + "</tr>";
          });
          const totalCells = columnsToShow.map((col) => {
            if (col === "Ref Account Name") return "Total (" + accountName + ")";
            if (col === "Debit") return totalDebit ? "₹" + totalDebit.toLocaleString() : "";
            if (col === "Credit") return totalCredit ? "₹" + totalCredit.toLocaleString() : "";
            if (col === "Balance") return closingBalance !== 0 ? "₹" + closingBalance.toLocaleString() : "₹0";
            return "";
          });
          rowsHtml += "<tr style=\"background:#e8e8e8;font-weight:600\">" + totalCells.map((c) => "<td style=\"padding:4px\">" + esc(c) + "</td>").join("") + "</tr>";
        });
      });
      const ths = columnsToShow.map((c) => "<th style=\"padding:6px;background:#ddd;text-align:left\">" + esc(c) + "</th>").join("");
      const html = `<!DOCTYPE html><html><head><title>Ledger</title><style>table{border-collapse:collapse;width:100%;font-size:12px}td,th{border:1px solid #999;padding:4px 6px}</style></head><body style="font-family:arial;padding:16px"><h2>Ledger</h2><p style="font-size:12px;color:#666">${fromDate || toDate ? "From: " + (fromDate || "—") + " &nbsp; To: " + (toDate || "—") : ""}</p><table><thead><tr>${ths}</tr></thead><tbody>${rowsHtml}</tbody></table><p style="margin-top:16px;font-size:11px;color:#666">Use browser Print (Ctrl+P) and choose "Save as PDF" or "Microsoft Print to PDF".</p></body></html>`;
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
        <Typography variant="h5" sx={{ mb: 3 }}>Ledger</Typography>

        {loading && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 2, py: 2 }}>
            <CircularProgress size={24} />
            <Typography>Loading ledger…</Typography>
          </Box>
        )}

        {error && !loading && (
          <Alert severity="warning" sx={{ maxWidth: 600, mb: 2 }}>{error}</Alert>
        )}

        {!loading && rows.length > 0 && (
          <>
            <Paper variant="outlined" sx={{ p: 2, mb: 3, width: "100%", maxWidth: 900 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>Criteria</Typography>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2, alignItems: "center" }}>
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
                <FormControl size="small" sx={{ minWidth: { xs: "100%", sm: 200 } }}>
                  <InputLabel id="ledger-company-label">Company Name</InputLabel>
                  <Select
                    labelId="ledger-company-label"
                    value={selectedCompany}
                    label="Company Name"
                    onChange={(e) => setSelectedCompany(e.target.value)}
                  >
                    {companyNamesList.map((name) => (
                      <MenuItem key={name} value={name}>{name}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl size="small" sx={{ minWidth: { xs: "100%", sm: 180 } }}>
                  <InputLabel id="ledger-account-label">Account Name</InputLabel>
                  <Select
                    labelId="ledger-account-label"
                    value={selectedAccount}
                    label="Account Name"
                    onChange={(e) => setSelectedAccount(e.target.value)}
                  >
                    {accountNames.map((name) => (
                      <MenuItem key={name} value={name}>{name}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl size="small" sx={{ minWidth: { xs: "100%", sm: 160 } }}>
                  <InputLabel id="ledger-city-label">City</InputLabel>
                  <Select
                    labelId="ledger-city-label"
                    value={selectedCity}
                    label="City"
                    onChange={(e) => setSelectedCity(e.target.value)}
                  >
                    {cities.map((c) => (
                      <MenuItem key={c} value={c}>{c}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>
            </Paper>

            <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 1, flexWrap: "wrap" }}>
              <Typography variant="body2" color="text.secondary">
                Showing {displayedCount} of {rows.length} entries
                {fromDate && " (Account Opening = balance before From Date)"}
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
                  <Typography variant="subtitle2" color="text.secondary">Table columns</Typography>
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
              <Table stickyHeader size="small" sx={{ minWidth: Math.max(400, columnsToShow.length * 90) }}>
                <TableHead>
                  <TableRow>
                    {columnsToShow.map((col) => (
                      <TableCell key={col} sx={{ fontWeight: 600, backgroundColor: "grey.100" }}>
                        {col}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {groupedByCompany.map(([companyName, companyRows]) => {
                    const byAccount = groupByAccountRows(companyRows);
                    const showOpening = !!fromDate;
                    return (
                      <React.Fragment key={companyName}>
                        <TableRow sx={{ backgroundColor: "grey.200" }}>
                          <TableCell colSpan={columnsToShow.length} sx={{ fontWeight: 700, fontSize: "subtitle2" }}>
                            {companyName}
                          </TableCell>
                        </TableRow>
                        {byAccount.map(([accountName, accountRows]) => {
                          const openingBalance = getOpeningBalance(accountRows, fromDate);
                          const transactionRows = filterRowsByDateRange(accountRows, fromDate, toDate);
                          const rowsWithBalance = computeRunningBalances(transactionRows, openingBalance);
                          const { totalDebit, totalCredit, balance: totalBalance } = getAccountTotals(rowsWithBalance);
                          const closingBalance = rowsWithBalance.length > 0 ? totalBalance : openingBalance;
                          const renderCell = (col, ctx) => {
                            if (ctx.isCompany) return null;
                            if (ctx.isOpening) {
                              if (col === "Account Name") return accountName;
                              if (col === "Ref Account Name") return "Account Opening";
                              if (col === "Balance") return openingBalance !== 0 ? "₹" + openingBalance.toLocaleString() : "₹0";
                              return "";
                            }
                            if (ctx.isTotal) {
                              if (col === "Ref Account Name") return "Total (" + accountName + ")";
                              if (col === "Debit") return totalDebit ? "₹" + totalDebit.toLocaleString() : "";
                              if (col === "Credit") return totalCredit ? "₹" + totalCredit.toLocaleString() : "";
                              if (col === "Balance") return closingBalance !== 0 ? "₹" + closingBalance.toLocaleString() : "₹0";
                              return "";
                            }
                            const row = ctx.row;
                            if (col === "Date") return row["Date"] ?? "";
                            if (col === "Account Name") return row["Account Name"] ?? "";
                            if (col === "Ref Account Name") return row["Ref Account Name"] ?? "";
                            if (col === "Description") return row["Description"] ?? "";
                            if (col === "Debit") return ctx.debit ? "₹" + ctx.debit.toLocaleString() : "";
                            if (col === "Credit") return ctx.credit ? "₹" + ctx.credit.toLocaleString() : "";
                            if (col === "Balance") return ctx.rowBalance !== 0 ? "₹" + ctx.rowBalance.toLocaleString() : "";
                            return "";
                          };
                          const cellSx = (col, ctx) => {
                            if (ctx.isOpening && col === "Account Name") return { fontWeight: 600 };
                            if (ctx.isOpening && col === "Ref Account Name") return { fontStyle: "italic" };
                            if (ctx.isOpening && col === "Balance") return { color: openingBalance < 0 ? "error.main" : "inherit", fontWeight: 600 };
                            if (ctx.isTotal && col === "Ref Account Name") return { fontWeight: 600 };
                            if (ctx.isTotal && col === "Debit") return { color: "error.main", fontWeight: 600 };
                            if (ctx.isTotal && (col === "Credit" || col === "Balance")) return { fontWeight: 600 };
                            if (ctx.isTotal && col === "Balance") return { color: closingBalance < 0 ? "error.main" : "inherit", fontWeight: 600 };
                            if (col === "Debit" && ctx.debit) return { color: "error.main", fontWeight: 600 };
                            if (col === "Balance" && ctx.rowBalance < 0) return { color: "error.main", fontWeight: 600 };
                            return {};
                          };
                          return (
                            <React.Fragment key={companyName + "-" + accountName}>
                              <TableRow sx={{ backgroundColor: "grey.300" }}>
                                <TableCell colSpan={columnsToShow.length} sx={{ fontWeight: 700, fontSize: "subtitle2", py: 1 }}>
                                  Account: {accountName}
                                </TableCell>
                              </TableRow>
                              {showOpening && (
                                <TableRow sx={{ backgroundColor: "action.hover" }}>
                                  {columnsToShow.map((col) => (
                                    <TableCell key={col} sx={cellSx(col, { isOpening: true, accountName, openingBalance })}>
                                      {renderCell(col, { isOpening: true, accountName, openingBalance })}
                                    </TableCell>
                                  ))}
                                </TableRow>
                              )}
                              {rowsWithBalance.map(({ row, balance: rowBalance }, idx) => {
                                const { credit, debit } = getCreditDebitNums(row);
                                return (
                                  <TableRow key={companyName + "-" + accountName + "-" + idx}>
                                    {columnsToShow.map((col) => (
                                      <TableCell key={col} sx={cellSx(col, { row, debit, credit, rowBalance })}>
                                        {renderCell(col, { row, debit, credit, rowBalance })}
                                      </TableCell>
                                    ))}
                                  </TableRow>
                                );
                              })}
                              <TableRow sx={{ backgroundColor: "grey.100", fontWeight: 600 }}>
                                {columnsToShow.map((col) => (
                                  <TableCell
                                    key={col}
                                    align={col === "Ref Account Name" ? "right" : "left"}
                                    sx={{
                                      ...cellSx(col, { isTotal: true, accountName, totalDebit: totalDebit, totalCredit: totalCredit, closingBalance }),
                                      fontWeight: 600,
                                    }}
                                  >
                                    {renderCell(col, { isTotal: true, accountName, totalDebit: totalDebit, totalCredit: totalCredit, closingBalance })}
                                  </TableCell>
                                ))}
                              </TableRow>
                            </React.Fragment>
                          );
                        })}
                      </React.Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </>
        )}
      </Box>
    </div>
  );
}

export default Ledger;

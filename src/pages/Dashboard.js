import React, { useState, useEffect } from "react";
import Sidebar from "../components/Sidebar";
import { Typography, Box, Alert, CircularProgress, Paper, List, ListItem, ListItemIcon, ListItemText, FormControl, InputLabel, Select, MenuItem } from "@mui/material";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";
import FolderIcon from "@mui/icons-material/Folder";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const LEDGER_FILE_NAME = "ledger.json";

async function checkJsonFolder(accessToken) {
  if (!accessToken) return { ok: false, message: "Please log in with Google (Drive access)." };
  try {
    const q = "name='JSON' and mimeType='application/vnd.google-apps.folder' and trashed=false";
    const res = await fetch(
      DRIVE_API + "/files?q=" + encodeURIComponent(q) + "&fields=files(id,name)&pageSize=10",
      { headers: { Authorization: "Bearer " + accessToken } }
    );
    if (!res.ok) throw new Error("Drive API error");
    const data = await res.json();
    const folder = data.files && data.files[0];
    if (!folder) {
      return { ok: false, message: 'Folder "JSON" not found in your Google Drive. Create a folder named "JSON" in Drive.' };
    }
    return { ok: true, message: 'Folder "JSON" found.', folder };
  } catch (e) {
    return { ok: false, message: e.message || "Could not access Google Drive. Try logging in again." };
  }
}

async function listFilesInFolder(accessToken, folderId) {
  try {
    const q = "'" + folderId + "' in parents and trashed=false";
    const res = await fetch(
      DRIVE_API + "/files?q=" + encodeURIComponent(q) + "&fields=files(id,name,mimeType,modifiedTime)&pageSize=100&orderBy=name",
      { headers: { Authorization: "Bearer " + accessToken } }
    );
    if (!res.ok) throw new Error("Drive API error");
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

function parseLedgerForChart(json) {
  let creditorsTotal = 0;
  let debtorsTotal = 0;
  if (!json) return { creditorsTotal: 0, debtorsTotal: 0 };

  const toNum = (v) => (v === "" || v == null ? 0 : Number(v)) || 0;

  // Your format: array of { "Cerdit", "Debit", ... }
  if (Array.isArray(json)) {
    json.forEach((row) => {
      creditorsTotal += toNum(row["Cerdit"] ?? row["Credit"]);
      debtorsTotal += toNum(row["Debit"]);
    });
    return { creditorsTotal, debtorsTotal };
  }

  if (typeof json !== "object") return { creditorsTotal: 0, debtorsTotal: 0 };

  if (Array.isArray(json.creditors)) {
    json.creditors.forEach((c) => {
      creditorsTotal += toNum(c.amount ?? c.balance ?? c.total ?? c.Cerdit ?? c.Credit);
    });
  }
  if (Array.isArray(json.debtors)) {
    json.debtors.forEach((d) => {
      debtorsTotal += toNum(d.amount ?? d.balance ?? d.total ?? d.Debit);
    });
  }
  if (Array.isArray(json.entries)) {
    json.entries.forEach((e) => {
      const amt = toNum(e.amount ?? e.balance ?? 0);
      const t = (e.type || e.category || "").toLowerCase();
      if (t.includes("credit")) creditorsTotal += amt;
      else if (t.includes("debit") || t.includes("debtor")) debtorsTotal += amt;
    });
  }
  return { creditorsTotal, debtorsTotal };
}

function getCompanyName(row) {
  return row["Company  Name"] ?? row["Company Name"] ?? "";
}

function getCompanyNames(ledgerRows) {
  if (!Array.isArray(ledgerRows) || ledgerRows.length === 0) return [];
  const names = new Set();
  ledgerRows.forEach((row) => {
    const n = getCompanyName(row);
    if (String(n).trim() !== "") names.add(String(n).trim());
  });
  return ["All", ...Array.from(names).sort()];
}

function Dashboard() {
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState([]);
  const [ledgerRows, setLedgerRows] = useState(null);
  const [ledgerError, setLedgerError] = useState(null);
  const [selectedCompany, setSelectedCompany] = useState("All");

  useEffect(() => {
    const token = localStorage.getItem("google_access_token");
    checkJsonFolder(token).then((r) => {
      setStatus(r.ok ? "found" : "not_found");
      setMessage(r.message);
      if (r.ok && r.folder) {
        listFilesInFolder(token, r.folder.id).then((fileList) => {
          setFiles(fileList);
          const ledgerFile = fileList.find(
            (f) => f.name === LEDGER_FILE_NAME || f.name.toLowerCase() === "ledger.json"
          );
          if (!ledgerFile) {
            setLedgerError('"' + LEDGER_FILE_NAME + '" not found in JSON folder.');
            return;
          }
          getFileContent(token, ledgerFile.id)
            .then((json) => {
              const rows = Array.isArray(json) ? json : [];
              setLedgerRows(rows);
              setLedgerError(rows.length === 0 ? "No ledger entries found." : null);
            })
            .catch(() => setLedgerError("Could not read or parse ledger.json."));
        });
      }
    });
  }, []);

  const companyNames = getCompanyNames(ledgerRows ?? []);
  const filteredRows =
    ledgerRows && selectedCompany !== "All"
      ? ledgerRows.filter((row) => String(getCompanyName(row)).trim() === selectedCompany)
      : ledgerRows ?? [];
  const { creditorsTotal, debtorsTotal } = parseLedgerForChart(filteredRows);
  const chartData =
    ledgerRows && ledgerRows.length > 0
      ? [
          { name: "Creditors", amount: creditorsTotal },
          { name: "Debtors", amount: debtorsTotal },
        ]
      : null;

  return (
    <div style={{ display: "flex" }}>
      <Sidebar />
      <div style={{ padding: "30px", width: "100%" }}>
        <Typography variant="h5" sx={{ mb: 3 }}>Dashboard</Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>Welcome to Accounting System</Typography>

        {status === "loading" && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 2, py: 2 }}>
            <CircularProgress size={24} />
            <Typography>Checking Google Drive for JSON folder…</Typography>
          </Box>
        )}

        {status === "not_found" && (
          <Alert severity="warning" sx={{ maxWidth: 560 }}>{message}</Alert>
        )}

        {status === "found" && (
          <Box>
            <Alert severity="success" sx={{ mb: 2, maxWidth: 560 }}>{message}</Alert>

            {ledgerError && (
              <Alert severity="info" sx={{ mb: 2, maxWidth: 560 }}>{ledgerError}</Alert>
            )}

            {chartData && (
              <Paper elevation={2} sx={{ p: 2, borderRadius: 2, mb: 3, maxWidth: 560, height: 360 }}>
                <Typography variant="h6" sx={{ mb: 2 }}>Creditors vs Debtors (from ledger.json)</Typography>
                <FormControl size="small" sx={{ minWidth: 220, mb: 2, display: "block" }}>
                  <InputLabel id="company-select-label">Company Name</InputLabel>
                  <Select
                    labelId="company-select-label"
                    value={selectedCompany}
                    label="Company Name"
                    onChange={(e) => setSelectedCompany(e.target.value)}
                  >
                    {companyNames.map((name) => (
                      <MenuItem key={name} value={name}>
                        {name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip formatter={(v) => ["₹" + Number(v).toLocaleString(), "Amount"]} />
                    <Legend />
                    <Bar dataKey="amount" name="Amount" radius={[4, 4, 0, 0]}>
                      {chartData.map((_, i) => (
                        <Cell key={i} fill={i === 0 ? "#2e7d32" : "#d32f2f"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Paper>
            )}

            <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>Files in JSON folder</Typography>
            <Paper variant="outlined" sx={{ maxHeight: 360, overflow: "auto", maxWidth: 560 }}>
              {files.length === 0 ? (
                <Box sx={{ p: 2, color: "text.secondary" }}>No files in this folder.</Box>
              ) : (
                <List dense>
                  {files.map((f) => (
                    <ListItem key={f.id}>
                      <ListItemIcon>
                        {f.mimeType === "application/vnd.google-apps.folder" ? (
                          <FolderIcon color="action" />
                        ) : (
                          <InsertDriveFileIcon color="action" />
                        )}
                      </ListItemIcon>
                      <ListItemText
                        primary={f.name}
                        secondary={f.modifiedTime ? new Date(f.modifiedTime).toLocaleString() : null}
                      />
                    </ListItem>
                  ))}
                </List>
              )}
            </Paper>
          </Box>
        )}
      </div>
    </div>
  );
}

export default Dashboard;

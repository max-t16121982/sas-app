import React, { useState } from "react";
import { Drawer, List, ListItem, ListItemIcon, ListItemText, IconButton } from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import DashboardIcon from "@mui/icons-material/Dashboard";
import MenuBookIcon from "@mui/icons-material/MenuBook";
import ShoppingCartIcon from "@mui/icons-material/ShoppingCart";
import ReceiptIcon from "@mui/icons-material/Receipt";
import LogoutIcon from "@mui/icons-material/Logout";

import { useNavigate } from "react-router-dom";

const drawerWidth = 220;
const drawerWidthClosed = 56;

export default function Sidebar() {
const [open, setOpen] = useState(false);
const navigate = useNavigate();

const logout = async () => {
  const token = localStorage.getItem("google_access_token");
  if (token) {
    try {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: "POST" });
    } catch (e) {
      // continue to clear local state even if revoke fails
    }
  }
  localStorage.removeItem("user");
  localStorage.removeItem("google_access_token");
  window.location.href = "/";
};

return (

<Drawer
variant="permanent"
sx={{
width: open ? drawerWidth : drawerWidthClosed,
flexShrink: 0,
transition: (theme) =>
  theme.transitions.create("width", {
    easing: theme.transitions.easing.sharp,
    duration: theme.transitions.duration.enteringScreen,
  }),
"& .MuiDrawer-paper": {
width: open ? drawerWidth : drawerWidthClosed,
boxSizing: "border-box",
transition: (theme) =>
  theme.transitions.create("width", {
    easing: theme.transitions.easing.sharp,
    duration: theme.transitions.duration.enteringScreen,
  }),
overflowX: "hidden",
},
}}
>
<div style={{ display: "flex", alignItems: "center", padding: "8px", minHeight: 48 }}>
<IconButton
  onClick={() => setOpen(!open)}
  aria-label={open ? "Close menu" : "Open menu"}
  sx={{ mr: open ? 0 : 0 }}
>
  <MenuIcon />
</IconButton>
</div>

{open && (
<List>

<ListItem button onClick={()=>navigate("/dashboard")}>
<ListItemIcon><DashboardIcon/></ListItemIcon>
<ListItemText primary="Dashboard"/>
</ListItem>

<ListItem button onClick={()=>navigate("/ledger")}>
<ListItemIcon><MenuBookIcon/></ListItemIcon>
<ListItemText primary="Ledger"/>
</ListItem>

<ListItem button onClick={()=>navigate("/sales")}>
<ListItemIcon><ShoppingCartIcon/></ListItemIcon>
<ListItemText primary="Sales"/>
</ListItem>

<ListItem button onClick={()=>navigate("/purchase")}>
<ListItemIcon><ReceiptIcon/></ListItemIcon>
<ListItemText primary="Purchase"/>
</ListItem>

<ListItem button onClick={()=>navigate("/sales-outstanding")}>
<ListItemText primary="Sales Outstanding"/>
</ListItem>

<ListItem button onClick={()=>navigate("/purchase-outstanding")}>
<ListItemText primary="Purchase Outstanding"/>
</ListItem>

<ListItem button onClick={()=>navigate("/mill-outstanding")}>
<ListItemText primary="Mill Outstanding"/>
</ListItem>

<ListItem button onClick={logout}>
<ListItemIcon><LogoutIcon/></ListItemIcon>
<ListItemText primary="Logout"/>
</ListItem>

</List>
)}

</Drawer>

);
}
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { GoogleOAuthProvider } from "@react-oauth/google";

const root = ReactDOM.createRoot(document.getElementById("root"));

root.render(
  <GoogleOAuthProvider clientId="1016881825608-qteijsd0stog5ooq4021jkc9bbnjp87p.apps.googleusercontent.com">
    <App />
  </GoogleOAuthProvider>
);
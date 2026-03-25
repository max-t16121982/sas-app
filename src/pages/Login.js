import { useGoogleLogin } from "@react-oauth/google";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";

function Login() {
  const login = useGoogleLogin({
    scope: `openid email profile ${DRIVE_SCOPE}`,
    onSuccess: async (tokenResponse) => {
      const accessToken = tokenResponse.access_token;
      if (!accessToken) return;

      try {
        const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const user = await res.json();
        localStorage.setItem("user", JSON.stringify(user));
        localStorage.setItem("google_access_token", accessToken);
        window.location.href = "/dashboard";
      } catch (err) {
        console.error("Failed to get user info", err);
      }
    },
    onError: () => console.log("Login Failed"),
  });

  return (
    <div style={{ textAlign: "center", marginTop: "150px" }}>
      <h2>Login</h2>
      <button
        onClick={() => login()}
        style={{
          padding: "10px 24px",
          fontSize: "16px",
          cursor: "pointer",
          borderRadius: "4px",
        }}
      >
        Sign in with Google (Drive access)
      </button>
      <p style={{ marginTop: 24, fontSize: 13, color: "#666", maxWidth: 360, marginLeft: "auto", marginRight: "auto" }}>
        Getting <strong>403 access_denied</strong>? Add your Gmail as a <strong>Test user</strong> in Google Cloud Console → OAuth consent screen. See <code>GOOGLE_OAUTH_403_FIX.md</code> in the project for full steps.
      </p>
    </div>
  );
}

export default Login;

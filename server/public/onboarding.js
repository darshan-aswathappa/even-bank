// Onboarding flow: sign in (magic-link) -> enter glasses code -> link bank.
// External file so it's allowed under CSP script-src 'self' (no unsafe-inline).

const $ = (id) => document.getElementById(id);
const show = (id) => $(id).classList.remove("hidden");
const hide = (id) => $(id).classList.add("hidden");
const setTitle = (t) => ($("title").textContent = t);
const setSubtitle = (t) => ($("subtitle").textContent = t);
const setStatus = (msg, ok) => {
  $("status").textContent = msg || "";
  $("status").className = "status" + (ok ? " ok" : "");
};

async function api(path, body) {
  const res = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try {
    data = await res.json();
  } catch {}
  return { ok: res.ok, status: res.status, data };
}

function showSignIn() {
  setTitle("Sign in");
  setSubtitle("We'll email you a secure link to sign in.");
  hide("codeStep");
  hide("linkStep");
  show("emailStep");
}
function showEnterCode() {
  setTitle("Pair your glasses");
  setSubtitle("Enter the code shown on your glasses display.");
  hide("emailStep");
  hide("linkStep");
  show("codeStep");
}
function showConnectBank() {
  setTitle("Connect your bank");
  setSubtitle("Securely link your account with Plaid.");
  hide("emailStep");
  hide("codeStep");
  show("linkStep");
}
function showDone(msg) {
  setTitle("All set");
  setSubtitle(msg);
  hide("emailStep");
  hide("codeStep");
  hide("linkStep");
}

$("emailBtn").addEventListener("click", async () => {
  const email = $("email").value.trim();
  if (!email) return setStatus("Enter your email.");
  $("emailBtn").disabled = true;
  const r = await api("/api/auth/magic-link", { email });
  $("emailBtn").disabled = false;
  if (r.ok) setStatus("Check your email for a sign-in link.", true);
  else setStatus("Could not send the link. Try again.");
});

$("codeBtn").addEventListener("click", async () => {
  const code = $("code").value.trim();
  if (!code) return setStatus("Enter the code from your glasses.");
  $("codeBtn").disabled = true;
  const r = await api("/api/device/approve", { user_code: code });
  $("codeBtn").disabled = false;
  if (!r.ok) {
    setStatus(r.status === 404 ? "Code not found or expired." : "Could not pair. Try again.");
    return;
  }
  if (r.data.needsBankLink) showConnectBank();
  else showDone("Your glasses are paired. Return to your glasses.");
});

$("linkBtn").addEventListener("click", async () => {
  $("linkBtn").disabled = true;
  const r = await api("/api/link/token/create", {});
  if (!r.ok) {
    setStatus("Could not start linking.");
    $("linkBtn").disabled = false;
    return;
  }
  if (r.data.mode === "mock") {
    await api("/api/item/public_token/exchange", {});
    showDone("Mock bank linked. Return to your glasses.");
    return;
  }
  const handler = Plaid.create({
    token: r.data.link_token,
    onSuccess: async (publicToken) => {
      setStatus("Linking…");
      const ex = await api("/api/item/public_token/exchange", { public_token: publicToken });
      if (ex.ok) showDone("Connected. Return to your glasses.");
      else setStatus("Link failed — try again.");
    },
    onExit: () => {
      $("linkBtn").disabled = false;
    },
  });
  handler.open();
});

(async () => {
  const me = await api("/api/auth/me");
  if (me.data.authenticated) showEnterCode();
  else showSignIn();
})();

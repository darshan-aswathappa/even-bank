// Onboarding flow: enter the glasses code -> link bank. No sign-in: possession
// of the code shown on your glasses IS the authorization (RFC 8628). The claim
// token returned by /api/device/claim authorizes the Plaid-linking calls.
// After linking, accounts are managed from the glasses app's own phone WebView.
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

// Claim token for this pairing — held in memory only, sent as a Bearer header.
let claimToken = null;

async function api(path, body) {
  const headers = {};
  if (body) headers["Content-Type"] = "application/json";
  if (claimToken) headers["Authorization"] = `Bearer ${claimToken}`;
  const res = await fetch(path, {
    method: body ? "POST" : "GET",
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try {
    data = await res.json();
  } catch {}
  return { ok: res.ok, status: res.status, data };
}

function showEnterCode() {
  setTitle("Pair your glasses");
  setSubtitle("Enter the code shown on your glasses display.");
  hide("linkStep");
  show("codeStep");
}
function showConnectBank() {
  setTitle("Connect your bank");
  setSubtitle("Securely link your account with Plaid.");
  hide("codeStep");
  show("linkStep");
}
function showDone(msg) {
  setTitle("All set");
  setSubtitle(msg);
  hide("codeStep");
  hide("linkStep");
}

$("codeBtn").addEventListener("click", async () => {
  const code = $("code").value.trim();
  if (!code) return setStatus("Enter the code from your glasses.");
  $("codeBtn").disabled = true;
  const r = await api("/api/device/claim", { user_code: code });
  $("codeBtn").disabled = false;
  if (!r.ok) {
    setStatus(r.status === 404 ? "Code not found or expired." : "Could not pair. Try again.");
    return;
  }
  claimToken = r.data.claim_token;
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
    onSuccess: async (publicToken, metadata) => {
      setStatus("Linking…");
      const ex = await api("/api/item/public_token/exchange", {
        public_token: publicToken,
        institution: metadata?.institution?.name,
      });
      if (ex.ok) showDone("Connected. Return to your glasses.");
      else setStatus("Link failed — try again.");
    },
    onExit: () => {
      $("linkBtn").disabled = false;
    },
  });
  handler.open();
});

showEnterCode();

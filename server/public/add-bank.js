// Add-another-bank flow. The token in the URL query string is a short-lived
// signed JWT issued by POST /manage/link/start (device-token auth). This page
// is opened in the user's real phone browser (Plaid Link cannot run inside the
// Even companion app's WebView).

const $ = (id) => document.getElementById(id);
const show = (id) => $(id).classList.remove("hidden");
const hide = (id) => $(id).classList.add("hidden");
const setTitle = (t) => ($("title").textContent = t);
const setSubtitle = (t) => ($("subtitle").textContent = t);
const setStatus = (msg, ok) => {
  $("status").textContent = msg || "";
  $("status").className = "status" + (ok ? " ok" : "");
};

let addBankToken = null;
let plaidLinkToken = null;

async function api(path, body) {
  const headers = {};
  if (body) headers["Content-Type"] = "application/json";
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

async function init() {
  // Token is delivered via hash fragment (not query string) so it is never
  // sent to the server in HTTP requests and does not appear in access logs.
  addBankToken = new URLSearchParams(location.hash.slice(1)).get("token");
  if (!addBankToken) {
    setTitle("Invalid link");
    setSubtitle("This link is missing required information. Get a new one from your Even app.");
    return;
  }

  setTitle("Add a bank");
  setSubtitle("Fetching a secure link…");

  const r = await api("/api/link/add/token", { token: addBankToken });
  if (!r.ok) {
    if (r.status === 401) {
      setTitle("Link expired");
      setSubtitle('This link has expired. Return to your Even app and tap "Add another bank" to get a new one.');
    } else {
      setTitle("Something went wrong");
      setSubtitle("Could not start bank linking. Please try again.");
      setStatus("Error " + r.status);
    }
    return;
  }

  if (r.data.mode === "mock") {
    setSubtitle("Connecting mock bank…");
    const ex = await api("/api/link/add/exchange", { token: addBankToken });
    if (ex.ok) {
      setTitle("Bank added");
      setSubtitle("Mock bank linked. Return to your Even app.");
      setStatus("Done", true);
    } else {
      setTitle("Connection failed");
      setSubtitle("Mock linking failed. Please try again.");
    }
    return;
  }

  plaidLinkToken = r.data.link_token;
  setSubtitle("Connect your bank securely with Plaid.");
  show("linkStep");
}

$("linkBtn").addEventListener("click", () => {
  $("linkBtn").disabled = true;
  const handler = Plaid.create({
    token: plaidLinkToken,
    onSuccess: async (publicToken, metadata) => {
      hide("linkStep");
      setSubtitle("Saving your connection…");
      const ex = await api("/api/link/add/exchange", {
        token: addBankToken,
        public_token: publicToken,
        institution: metadata?.institution?.name,
      });
      if (ex.ok) {
        setTitle("Bank added");
        setSubtitle("Your bank is now connected. Return to your Even app.");
        setStatus("Done", true);
      } else {
        setTitle("Connection failed");
        setSubtitle("The bank link could not be saved. Please try again.");
        show("linkStep");
        $("linkBtn").disabled = false;
      }
    },
    onExit: () => {
      $("linkBtn").disabled = false;
    },
  });
  handler.open();
});

init();

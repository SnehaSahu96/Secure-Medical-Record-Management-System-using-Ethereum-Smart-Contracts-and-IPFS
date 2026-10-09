// Wallet, contract, encryption, IPFS (via backend) and UI in one file for readability.
const C = window.APP_CONFIG || {};
const $ = id => document.getElementById(id);
let provider, signer, account, contract;

function toast(msg, ok = true) { const t = $("toast"); t.textContent = msg; t.style.background = ok ? "#17803d" : "#b3261e"; t.style.display = "block"; clearTimeout(t._t); t._t = setTimeout(() => t.style.display = "none", 6000); }
const fail = e => { console.error(e.code || e.message); toast(e.reason || e.shortMessage || e.message, false); };

function route() { const h = location.hash.slice(1) || "home"; document.querySelectorAll("section").forEach(s => s.classList.toggle("on", s.id === h)); document.querySelectorAll("nav a").forEach(a => a.classList.toggle("on", a.hash === "#" + h)); if (h === "records" && contract) loadRecords().catch(fail); }
window.addEventListener("hashchange", route); route();

function setStatus(txt, cls) { $("stxt").textContent = txt; $("dot").className = "dot " + cls; }
async function connect() {
  try {
    if (!window.ethereum) throw new Error("MetaMask is not installed. Install it from metamask.io.");
    if (!C.CONTRACT_ADDRESS) throw new Error("Contract address missing: copy config/config.example.js to config/config.js and set CONTRACT_ADDRESS.");
    provider = new ethers.BrowserProvider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    const net = await provider.getNetwork();
    if (Number(net.chainId) !== C.CHAIN_ID) {
      setStatus("Wrong network: switch to Sepolia", "bad");
      try { await provider.send("wallet_switchEthereumChain", [{ chainId: "0x" + C.CHAIN_ID.toString(16) }]); return connect(); }
      catch { throw new Error("Please switch MetaMask to the Sepolia test network."); }
    }
    signer = await provider.getSigner(); account = await signer.getAddress();
    contract = new ethers.Contract(C.CONTRACT_ADDRESS, C.ABI, signer);
    setStatus(account.slice(0, 6) + "…" + account.slice(-4) + " · Sepolia", "ok"); $("dwallet").textContent = account;
  } catch (e) { setStatus("Wallet not connected", "bad"); toast(e.code === 4001 ? "Wallet connection was rejected." : e.message, false); }
}
function reset() { signer = account = contract = null; setStatus("Wallet not connected", ""); $("dwallet").textContent = "—"; }
const need = () => { if (!contract) throw new Error("Connect your wallet on Sepolia first."); };
window.ethereum?.on?.("chainChanged", () => location.reload());
window.ethereum?.on?.("accountsChanged", () => location.reload());
$("btnConnect").onclick = connect; $("btnReset").onclick = reset;

async function sendTx(label, fn) {
  need(); toast(label + ": confirm in MetaMask…");
  try { const tx = await fn(); toast("Pending: " + tx.hash.slice(0, 12) + "…"); const rc = await tx.wait(); if (rc.status !== 1) throw new Error("Transaction failed"); toast(label + " confirmed"); return rc; }
  catch (e) { if (e.code === "ACTION_REJECTED") throw new Error("Transaction rejected in MetaMask."); throw e; }
}

// ---------- crypto (AES-GCM in the browser) ----------
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
function b64big(buf) { let s = "", a = new Uint8Array(buf); for (let i = 0; i < a.length; i += 8192) s += String.fromCharCode(...a.subarray(i, i + 8192)); return btoa(s); }
async function encryptFile(file) {
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, await file.arrayBuffer()));
  const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12);
  return { bytes: out, key: b64(await crypto.subtle.exportKey("raw", key)) };
}
async function decryptBytes(bytes, keyB64, mime) {
  const key = await crypto.subtle.importKey("raw", unb64(keyB64), "AES-GCM", false, ["decrypt"]);
  return new Blob([await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(0, 12) }, key, bytes.slice(12))], { type: mime });
}

// ---------- backend ----------
async function api(path, body) {
  let r; try { r = await fetch(C.BACKEND_URL + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); }
  catch { throw new Error("Backend not reachable at " + C.BACKEND_URL + ". Start it: cd server && npm start"); }
  const j = await r.json(); if (!r.ok) throw new Error(j.error || "Server error"); return j;
}
async function signed(action, id, extra = {}) { const ts = Date.now(); return { recordId: Number(id), timestamp: ts, signature: await signer.signMessage(`${action}:${id}:${ts}`), ...extra }; }

// ---------- local metadata (never on-chain) ----------
const meta = () => JSON.parse(localStorage.getItem("meta:" + account) || "{}");
const saveMeta = m => localStorage.setItem("meta:" + account, JSON.stringify(m));

$("fReg").onsubmit = async e => { e.preventDefault();
  try { need();
    localStorage.setItem("profile:" + account, JSON.stringify({ id: $("pid").value, name: $("pname").value, age: $("page").value, gender: $("pgender").value, phone: $("pphone").value, email: $("pemail").value }));
    if (await contract.isPatient(account)) return toast("This wallet is already registered.");
    await sendTx("Registration", () => contract.registerPatient());
  } catch (er) { fail(er); } };

$("fAdd").onsubmit = async e => { e.preventDefault(); const btn = $("btnUp"), p = $("prog"); btn.disabled = true;
  try { need();
    const f = $("rfile").files[0];
    if (!f) throw new Error("Choose a file.");
    if (!["application/pdf", "image/jpeg", "image/png"].includes(f.type)) throw new Error("Unsupported file type. Use PDF, JPG or PNG.");
    if (f.size > C.MAX_FILE_MB * 1048576) throw new Error(`File exceeds the ${C.MAX_FILE_MB} MB limit.`);
    if (!$("rconsent").checked) throw new Error("Please confirm consent.");
    p.hidden = false; p.value = 15; const { bytes, key } = await encryptFile(f);
    p.value = 40; const { cid } = await api("/upload", { data: b64big(bytes) });
    p.value = 65; const date = Math.floor(new Date($("rdate").value).getTime() / 1000);
    const rc = await sendTx("Save record", () => contract.addMedicalRecord(cid, $("rtype").value, date));
    const ev = rc.logs.map(l => { try { return contract.interface.parseLog(l); } catch { return null; } }).find(x => x?.name === "RecordAdded");
    if (!ev) throw new Error("RecordAdded event not found: check that the ABI matches the deployed contract.");
    const id = Number(ev.args.recordId);
    p.value = 85; await api("/keys", await signed("store-key", id, { key }));
    const m = meta(); m[id] = { title: $("rtitle").value, hosp: $("rhosp").value, doc: $("rdoc").value, notes: $("rnotes").value, mime: f.type, tx: rc.hash }; saveMeta(m);
    p.value = 100; toast(`Record #${id} saved. CID: ${cid}`); $("fAdd").reset();
  } catch (er) { fail(er); } finally { btn.disabled = false; setTimeout(() => p.hidden = true, 800); } };

async function fetchAndOpen(id, mime) {
  const r0 = await contract.getRecordMetadata(id).catch(() => { throw new Error("Access denied: you have no permission for this record."); });
  const { key } = await api("/key", await signed("get-key", id));
  const r = await fetch(C.IPFS_GATEWAY + r0[1]).catch(() => null);
  if (!r || !r.ok) throw new Error("Could not retrieve the record from IPFS.");
  const blob = await decryptBytes(new Uint8Array(await r.arrayBuffer()), key, mime || "application/pdf");
  window.open(URL.createObjectURL(blob));
}
window.openRec = id => { try { need(); fetchAndOpen(id, meta()[id]?.mime).catch(fail); } catch (e) { fail(e); } };

async function loadRecords() {
  need(); const ids = await contract.getPatientRecords(account), m = meta(), rows = [];
  for (const id of ids) { const r = await contract.getRecordMetadata(id);
    rows.push({ id: Number(id), title: m[id]?.title || "(not on this device)", type: r[2], date: new Date(Number(r[3]) * 1000).toISOString().slice(0, 10), cid: r[1], tx: m[id]?.tx || "n/a" }); }
  const draw = () => { const q = $("q").value.toLowerCase(), t = $("ft").value, dt = $("fd").value;
    const list = rows.filter(r => r.title.toLowerCase().includes(q) && (!t || r.type === t) && (!dt || r.date === dt));
    $("cnt").textContent = rows.length; $("rows").innerHTML = "";
    if (!list.length) { $("rows").innerHTML = `<tr><td colspan="8">No records yet. Use "Add record" to upload one.</td></tr>`; return; }
    list.forEach(r => { const tr = $("rows").insertRow();
      [r.id, r.title, r.type, r.date, r.cid, r.tx.slice(0, 14) + "…", "Confirmed on-chain"].forEach(v => tr.insertCell().textContent = v);
      const b = document.createElement("button"); b.textContent = "Open"; b.onclick = () => openRec(r.id); tr.insertCell().appendChild(b); }); };
  ["q", "ft", "fd"].forEach(i => $(i).oninput = draw); draw();
}

const addr = () => { const a = $("adoc").value.trim(); if (!ethers.isAddress(a)) throw new Error("Enter a valid doctor wallet address."); return a; };
$("btnGrant").onclick = () => { try { const a = addr(); sendTx("Grant access", () => contract.grantAccess($("aid").value, a)).catch(fail); } catch (e) { fail(e); } };
$("btnRevoke").onclick = () => { try { const a = addr(); if (!confirm("Revoke this doctor's access? Files they already downloaded cannot be erased.")) return;
  sendTx("Revoke access", () => contract.revokeAccess($("aid").value, a)).catch(fail); } catch (e) { fail(e); } };
$("btnCheck").onclick = async () => { try { need(); const ok = await contract.hasAccess($("aid").value, addr()); $("amsg").textContent = ok ? "Doctor currently HAS access." : "Doctor has NO access."; } catch (e) { fail(e); } };

$("btnReq").onclick = () => { try { sendTx("Access request", () => contract.requestAccess($("did").value)).catch(fail); } catch (e) { fail(e); } };
$("btnView").onclick = async () => { try { need(); const id = $("did").value;
  const r = await contract.getRecordMetadata(id).catch(() => { throw new Error("Access denied: permission absent or revoked."); });
  $("dmeta").textContent = `Type: ${r[2]}\nDate: ${new Date(Number(r[3]) * 1000).toISOString().slice(0, 10)}\nCID: ${r[1]}`;
  await fetchAndOpen(id, "application/pdf"); } catch (e) { fail(e); } };

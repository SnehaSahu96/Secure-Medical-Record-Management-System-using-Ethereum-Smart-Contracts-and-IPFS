// Backend: (1) holds the IPFS credential, (2) stores AES keys, (3) releases a key only if the
// caller signs a fresh challenge AND the contract says hasAccess() is true.
require("dotenv").config();
const express = require("express"), cors = require("cors"), fs = require("fs");
const { ethers } = require("ethers");
const { PINATA_JWT, SEPOLIA_RPC, CONTRACT_ADDRESS, ALLOWED_ORIGIN } = process.env;
const abi = ["function getRecordOwner(uint256) view returns (address)", "function hasAccess(uint256,address) view returns (bool)"];
const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, new ethers.JsonRpcProvider(SEPOLIA_RPC));
const FILE = __dirname + "/keys.json";
const keys = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE)) : {};
const save = () => fs.writeFileSync(FILE, JSON.stringify(keys));

const app = express();
app.use(cors({ origin: ALLOWED_ORIGIN || "*" }));
app.use(express.json({ limit: "10mb" }));

function signer(action, id, ts, sig) {
  if (Math.abs(Date.now() - Number(ts)) > 5 * 60 * 1000) throw new Error("Signature expired");
  return ethers.verifyMessage(`${action}:${id}:${ts}`, sig);
}

app.post("/upload", async (req, res) => {
  try {
    if (!PINATA_JWT) return res.status(503).json({ error: "IPFS not configured: set PINATA_JWT in server/.env" });
    const bytes = Buffer.from(req.body.data, "base64");
    const form = new FormData();
    form.append("file", new Blob([bytes]), "encrypted.bin");
    const r = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", { method: "POST", headers: { Authorization: `Bearer ${PINATA_JWT}` }, body: form });
    const j = await r.json();
    if (!r.ok) return res.status(502).json({ error: "IPFS provider error: " + JSON.stringify(j) });
    res.json({ cid: j.IpfsHash });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/keys", async (req, res) => { // patient stores key for own record
  try {
    const { recordId, key, timestamp, signature } = req.body;
    const who = signer("store-key", recordId, timestamp, signature);
    if ((await contract.getRecordOwner(recordId)).toLowerCase() !== who.toLowerCase()) return res.status(403).json({ error: "Not the record owner" });
    keys[recordId] = key; save(); res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.post("/key", async (req, res) => { // authorized wallet fetches key
  try {
    const { recordId, timestamp, signature } = req.body;
    const who = signer("get-key", recordId, timestamp, signature);
    if (!(await contract.hasAccess(recordId, who))) return res.status(403).json({ error: "Access denied: no permission for this record" });
    if (!keys[recordId]) return res.status(404).json({ error: "No key stored for this record" });
    res.json({ key: keys[recordId] });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.listen(3000, () => console.log("MedChain server on :3000"));

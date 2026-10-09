# Secure Medical Record Management (Ethereum Sepolia + IPFS), demo project
Use FICTIONAL data only. Blockchain data is public; Solidity modifiers do not hide on-chain data. Revocation stops future key delivery but cannot erase files already downloaded.

## Architecture
Browser encrypts the file (AES-GCM), backend `/upload` pins the ciphertext to IPFS (Pinata JWT stays on the server), the contract stores CID/type/date, and the backend releases the AES key only to a wallet that signs a fresh challenge AND passes `hasAccess()` on-chain. GitHub Pages hosts the frontend only; the backend in `server/` must be hosted separately (Render, Railway, etc.).

## Setup
1. **Contract**: open `contracts/MedicalRecordManager.sol` in remix.ethereum.org, compile (0.8.20+), deploy with "Injected Provider - MetaMask" on Sepolia (get test ETH from a faucet). Copy the contract address. The deploying wallet is admin: call `verifyDoctor(doctorWallet,true)`.
2. **IPFS**: create a free Pinata account and an API JWT.
3. **Backend**: `cd server && cp .env.example .env`, fill `PINATA_JWT`, `SEPOLIA_RPC`, `CONTRACT_ADDRESS`, `ALLOWED_ORIGIN`; then `npm install && npm start`.
4. **Frontend**: `cp config/config.example.js config/config.js`; set `CONTRACT_ADDRESS`, `BACKEND_URL`, `IPFS_GATEWAY`. The ABI is included; replace it if you change the contract.
5. **Run locally**: VS Code Live Server (or `python -m http.server 5500`), open http://localhost:5500.
6. **Flow**: Connect wallet, Register, Add record, My records, Access management (grant to a verified doctor), then open as the doctor from a second MetaMask account.

## GitHub and Pages
`git init && git add . && git commit -m "init"`, create a repo, `git remote add origin <url> && git push -u origin main`. Settings > Pages > deploy from `main` / root. `config/config.js` contains only public values (no secrets), so it may be committed. Set the backend `ALLOWED_ORIGIN` to your Pages URL and `BACKEND_URL` to the hosted backend. All paths are relative, so repo subpaths work.

## Known limits (demo-grade)
AES keys sit unencrypted in `server/keys.json`; use a KMS or encrypted database for real use. Personal details and titles are stored in browser localStorage only. An access-request inbox for patients is not built (requests emit an `AccessRequested` event).

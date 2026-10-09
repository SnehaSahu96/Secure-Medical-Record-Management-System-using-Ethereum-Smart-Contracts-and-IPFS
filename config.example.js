// Copy to config/config.js and fill in. NO secrets here (this file is public once deployed).
window.APP_CONFIG = {
  CONTRACT_ADDRESS: "",                       // from Remix after deploying
  CHAIN_ID: 11155111,                         // Sepolia
  IPFS_GATEWAY: "https://gateway.pinata.cloud/ipfs/",
  BACKEND_URL: "http://localhost:3000",       // upload + key service (see server/)
  MAX_FILE_MB: 5,
  ABI: [
    "function registerPatient()",
    "function verifyDoctor(address,bool)",
    "function addMedicalRecord(string,string,uint64) returns (uint256)",
    "function grantAccess(uint256,address)",
    "function revokeAccess(uint256,address)",
    "function requestAccess(uint256)",
    "function hasAccess(uint256,address) view returns (bool)",
    "function isPatient(address) view returns (bool)",
    "function getPatientRecords(address) view returns (uint256[])",
    "function getRecordMetadata(uint256) view returns (address,string,string,uint64,uint64)",
    "event RecordAdded(uint256 indexed recordId,address indexed patient,string cid)"
  ]
};

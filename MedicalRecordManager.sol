// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Stores only IPFS CIDs (of ENCRYPTED files) + minimal metadata. Everything here is PUBLIC on-chain.
contract MedicalRecordManager {
    struct Record { address patient; string cid; string recordType; uint64 recordDate; uint64 createdAt; }

    address public admin;
    mapping(address => bool) public isPatient;
    mapping(address => bool) public verifiedDoctor;
    Record[] private records; // recordId = index + 1
    mapping(address => uint256[]) private patientRecords;
    mapping(uint256 => mapping(address => bool)) private access;

    event PatientRegistered(address indexed patient);
    event DoctorVerified(address indexed doctor, bool status);
    event RecordAdded(uint256 indexed recordId, address indexed patient, string cid);
    event AccessGranted(uint256 indexed recordId, address indexed patient, address indexed doctor);
    event AccessRevoked(uint256 indexed recordId, address indexed patient, address indexed doctor);
    event AccessRequested(uint256 indexed recordId, address indexed doctor);

    modifier onlyAdmin() { require(msg.sender == admin, "Only admin"); _; }
    modifier validRecord(uint256 id) { require(id > 0 && id <= records.length, "Record not found"); _; }

    constructor() { admin = msg.sender; }

    function registerPatient() external {
        require(!isPatient[msg.sender], "Already registered");
        isPatient[msg.sender] = true;
        emit PatientRegistered(msg.sender);
    }

    function verifyDoctor(address doctor, bool status) external onlyAdmin {
        require(doctor != address(0), "Invalid address");
        verifiedDoctor[doctor] = status;
        emit DoctorVerified(doctor, status);
    }

    function addMedicalRecord(string calldata cid, string calldata recordType, uint64 recordDate) external returns (uint256) {
        require(isPatient[msg.sender], "Register as patient first");
        require(bytes(cid).length > 0 && bytes(cid).length <= 100, "Invalid CID");
        require(bytes(recordType).length > 0 && bytes(recordType).length <= 32, "Invalid type");
        records.push(Record(msg.sender, cid, recordType, recordDate, uint64(block.timestamp)));
        uint256 id = records.length;
        patientRecords[msg.sender].push(id);
        emit RecordAdded(id, msg.sender, cid);
        return id;
    }

    function grantAccess(uint256 id, address doctor) external validRecord(id) {
        require(records[id - 1].patient == msg.sender, "Not record owner");
        require(doctor != address(0), "Invalid address");
        require(verifiedDoctor[doctor], "Doctor not verified");
        access[id][doctor] = true;
        emit AccessGranted(id, msg.sender, doctor);
    }

    function revokeAccess(uint256 id, address doctor) external validRecord(id) {
        require(records[id - 1].patient == msg.sender, "Not record owner");
        access[id][doctor] = false;
        emit AccessRevoked(id, msg.sender, doctor);
    }

    function requestAccess(uint256 id) external validRecord(id) {
        require(verifiedDoctor[msg.sender], "Doctor not verified");
        emit AccessRequested(id, msg.sender);
    }

    function hasAccess(uint256 id, address user) public view validRecord(id) returns (bool) {
        return records[id - 1].patient == user || access[id][user];
    }

    function getRecordOwner(uint256 id) external view validRecord(id) returns (address) { return records[id - 1].patient; }

    function getPatientRecords(address patient) external view returns (uint256[] memory) {
        require(msg.sender == patient, "Only the patient can list records");
        return patientRecords[patient];
    }

    function getRecordMetadata(uint256 id) external view validRecord(id)
        returns (address patient, string memory cid, string memory recordType, uint64 recordDate, uint64 createdAt) {
        require(hasAccess(id, msg.sender), "Access denied");
        Record storage r = records[id - 1];
        return (r.patient, r.cid, r.recordType, r.recordDate, r.createdAt);
    }
}

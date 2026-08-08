const fs=require("fs");
const p="d:/Projects/hire_adda/frontend/src/constants/suggestions.ts";
let c=fs.readFileSync(p,"utf-8");
const NL="
";
const old="  'SAP ABAP Developer',"+NL+"] as const;"+NL+NL+"export const LANGUAGE_SUGGESTIONS = [";
if(!c.includes(old)){console.log("ERROR");process.exit(1);}
const items=[
"AWS SAP on AWS Specialty",
"AWS Cloud Practitioner",
"Azure Data Scientist (DP-100)",
"Azure Database Administrator (DP-300)",
"Azure AI Fundamentals (AI-900)",
"Azure Data Fundamentals (DP-900)",
"Azure Power Platform Fundamentals (PL-900)",
"Azure Power Platform Developer (PL-400)",
"Azure Security, Compliance & Identity Fundamentals (SC-900)",
"Azure Cosmos DB Developer Specialty",
"Google Cloud Digital Leader",
"Google Cloud Professional Cloud Network Engineer",
"Google Cloud Professional Cloud Database Engineer",
"Google Cloud Professional Workspace Administrator",
"Salesforce Advanced Administrator",
"Salesforce Platform Developer I",
"Salesforce Platform Developer II",
"Salesforce Sales Cloud Consultant",
"Salesforce Service Cloud Consultant",
"Salesforce Marketing Cloud Consultant",
"Salesforce Marketing Cloud Email Specialist",
"Salesforce Einstein Analytics & Discovery Consultant",
"Salesforce Integration Architect",
"Salesforce Application Architect",
"Salesforce System Architect",
"Salesforce Technical Architect",
"Salesforce Data Architect",
"Salesforce Sharing & Visibility Architect",
"Salesforce Identity & Access Management Architect",
"Salesforce B2C Commerce Developer",
"Salesforce CPQ Specialist",
# CostOps Copilot – Master Reference Document (For AI Assistants)

This document is a **complete high-level specification, roadmap, architecture reference, and instructions** for AI coding agents collaborating on the CostOps Copilot project.

It is written to be:

* **Machine-readable** (clear structure, no ambiguity)
* **Human-readable** (you can onboard quickly)
* **Architecture-stable** (defines v1.0 scope)
* **Actionable** (contains tasks, components, rules, flows, and prompts)

This document must be kept up to date as the project evolves.

---

# 1. PROJECT OVERVIEW

## 1.1 Project Name

**CostOps Copilot** (temporary project codename)

## 1.2 Purpose

A web-based FinOps automation tool that connects read-only to **Azure** and **GitHub** to:

* Analyze cloud resource usage and cost
* Detect waste and inefficiencies
* Generate **ready-to-merge PRs** containing infrastructure fixes (Terraform/Bicep/ARM)
* Centralize cost-reduction insights for small–mid teams

## 1.3 Philosophy

CostOps Copilot focuses on:

* **Fix-as-Code** instead of dashboard overload
* **Automation** over manual review
* **Small-to-mid teams** rather than enterprise FinOps
* **Azure-first** (due to the founder's background)

---

# 2. CORE DELIVERABLE (Version 1.0)

## 2.1 Supported Integrations (v1)

* **Azure** (read-only)
* **GitHub** (read + PR write)
* (Optional) Slack notifications

## 2.2 Core Capabilities (v1)

1. Connect Azure using a service principal + read-only permissions
2. Connect GitHub through a GitHub App
3. Ingest subscriptions, resources, metrics, and cost estimates
4. Apply rule engine to find optimizations
5. Display recommendations in dashboard
6. Generate fix PRs for **Terraform/Bicep** repositories
7. Daily scheduled ingestion + rule execution

## 2.3 Non-goals for v1

* No auto-apply (always PR-based)
* No AWS/GCP
* No advanced ML-based forecasting
* No multi-org enterprise workflows

---

# 3. STACK SUMMARY

## 3.1 Frontend

* **Next.js 14** (App Router)
* **TypeScript**
* **TailwindCSS**
* **shadcn/ui** components

## 3.2 Backend

* **Next.js API routes**
* **Node.js + TypeScript**
* **Prisma ORM**
* **Supabase Postgres**

## 3.3 Infra

* **Vercel** for app
* **Supabase** for DB + storage
* **Cron Jobs** on Vercel or additional worker

## 3.4 External Services

* GitHub App (PR creation + repo reading)
* Azure REST APIs

---

# 4. DIRECTORY STRUCTURE (stable)

Root directory:

```
/costops
  prisma/schema.prisma
  src/app/
  src/lib/
  src/components/
  src/types/
  src/styles/
  src/app/api/*
```

(Full structure available in architecture section.)

---

# 5. DATABASE SCHEMA (authoritative)

This schema defines all v1.0 models:

* `Organization`
* `User`
* `Membership`
* `Connection`
* `CloudSubscription`
* `CloudResource`
* `Recommendation`
* `PullRequestEvent`
* `RulesConfig`
* `AuditLog`

(Exact Prisma schema lives in `/prisma/schema.prisma`.)

---

# 6. AZURE INTEGRATION

## 6.1 Required Azure Roles

* **Reader** (subscription scope)
* **Cost Management Reader**
* **Monitoring Reader**

## 6.2 Consumed APIs

* Resource Graph
* Cost Management Query
* Monitor Metrics

## 6.3 Ingestion Tasks

1. Fetch subscriptions
2. Fetch all resources
3. Fetch metrics for key resource types
4. Estimate monthly costs
5. Store in DB tables

---

# 7. GITHUB INTEGRATION

## 7.1 GitHub App Permissions

* `contents: read`
* `metadata: read`
* `pull_requests: write`

## 7.2 PR Workflow

* Generate branch → commit → PR
* PR contains:

  * explanation
  * Terraform/Bicep diff
  * estimated impact
  * labels

## 7.3 IaC Mapping

* Tags: `iac_path: path/to/resource.tf`
* Heuristics:

  * search resource name
  * guess directories: `infra/**`, `terraform/**`, `bicep/**`

---

# 8. RULE ENGINE (V1 RULESET)

Rules are deterministic and configurable.

### **R1** VM Rightsizing (Low CPU)

### **R2** Unattached Managed Disks

### **R3** Idle Public IPs

### **R4** Load Balancers w/ No Backends

### **R5** Storage Tier Mismatch (Hot→Cool)

### **R6** App Service Plan Underutilization

### **R7** SQL DB Underutilization

### **R8** Non-Prod Off-hours Scheduling

### **R9** Orphaned Snapshots

### **R10** Premium Disk w/ Low IOPS

Each rule outputs:

* `title`
* `description`
* `impactMonthly`
* `confidence`
* `details { fixType, params }`

---

# 9. API ENDPOINTS

### `/api/connections/azure/authorize` (POST)

Store encrypted SP credentials.

### `/api/ingest/run` (POST)

Manual trigger for ingestion + rule re-run.

### `/api/recommendations/list` (GET)

List recommendations.

### `/api/recommendations/create-pr` (POST)

Create GitHub PR for one recommendation.

### `/api/rules/config` (GET/POST)

Read/write threshold overrides.

---

# 10. V1 UI PAGES

### 10.1 Dashboard

* total monthly cost
* avoidable waste
* top 5 actions

### 10.2 Opportunities

* Filterable table of recommendations
* Drawer with explanation + PR button

### 10.3 Settings

* Azure connection
* GitHub connection
* Rules thresholds

### 10.4 Activity

* PR timeline

---

# 11. SCHEDULER

### Daily cycle:

1. Ingest Azure resources + metrics
2. Ingest cost estimates
3. Run rules
4. Update or create recommendations
5. Optionally send notifications

---

# 12. CODING RULES FOR AI AGENTS

## 12.1 Always follow directory structure

Never create files outside the defined layout.

## 12.2 Always use TypeScript

No JavaScript files in this project.

## 12.3 All functions must be async

Azure + GitHub require async/await.

## 12.4 Never mutate cloud resources directly

Only generate IaC PRs.

## 12.5 Prisma models must match schema.prisma exactly

Never modify schema without approval.

## 12.6 UI must use:

* TailwindCSS
* shadcn/ui

## 12.7 Commit in small chunks

Each generated file/change must be self-contained.

---

# 13. PROJECT ROADMAP

## 13.1 Phase 1 (7–10 days)

* Scaffold project
* Auth + org model
* Azure connection
* Resource ingestion
* Basic dashboard

## 13.2 Phase 2 (10–14 days)

* Metrics ingestion
* First 3 rules
* Recommendations table

## 13.3 Phase 3 (7 days)

* GitHub integration
* PR generation (Terraform/Bicep)
* Activity timeline

## 13.4 Phase 4 (Rest of v1)

* Remaining rules
* RulesConfig
* Slack integration (optional)
* Polishing and onboarding

---

# 14. FUTURE VERSIONS

## 14.1 v1.5

* AWS integration
* Cost anomaly detection
* Custom rule scripting

## 14.2 v2.0

* Multi-cloud environment graphs
* Savings Plans optimization
* Auto-fix CI validation

---

# 15. HOW TO USE THIS DOCUMENT

### For AI coding assistants (Codex, Claude, GPT):

* Read this document before generating any code
* Follow file paths exactly
* Follow architecture conventions strictly

### For the human developer:

* Share this doc with every new AI agent
* Update when major architecture changes occur
* Keep rules and models consistent

---

# END OF MASTER SPEC DOCUMENT
